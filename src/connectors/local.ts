import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatPayload, Connector, MailPayload, RawItem } from "./types.js";

/**
 * Local stores behind the same trace shapes as the live systems (written by `writeStores`). The roadmap's rule:
 * local first, live swapped in behind the same names. A missing store yields nothing rather than an error.
 */
export const DEFAULT_STORES_DIR = "data/stores";

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

interface StoredMail extends MailPayload { id: string; party_id?: string }

export function localMail(dir: string): Connector {
  return {
    name: "local-mail",
    async pull() {
      const mail = readJson<StoredMail[]>(join(dir, "mail.json")) ?? [];
      return mail.map((m): RawItem => ({
        source: "gmail", kind: "email", external_id: m.id, event_time: m.date, recorded_time: m.date,
        payload: { thread_id: m.thread_id, from: m.from, to: m.to, cc: m.cc, subject: m.subject, date: m.date, body: m.body } satisfies MailPayload,
        party_hint: { emails: [m.from, ...m.to, ...m.cc] },
      }));
    },
  };
}

interface StoredChat extends ChatPayload { id: string; party_id?: string }

export function localChat(dir: string): Connector {
  return {
    name: "local-chat",
    async pull() {
      const chat = readJson<StoredChat[]>(join(dir, "chat.json")) ?? [];
      return chat.map((c): RawItem => ({
        source: "slack", kind: "chat_message", external_id: c.id, event_time: c.ts, recorded_time: c.ts,
        payload: { channel: c.channel, user: c.user, user_name: c.user_name, ts: c.ts, text: c.text } satisfies ChatPayload,
        party_hint: { text: c.text },
      }));
    },
  };
}

interface StoredCrm {
  deals: Array<{ id: string; party_id: string; name: string; amount_cents: number; close_date: string; owner: string; stage: string; recorded_time: string }>;
  notes: Array<{ id: string; party_id: string; ts: string; author: string; text: string }>;
}

export function localCrm(dir: string): Connector {
  return {
    name: "local-crm",
    async pull() {
      const crm = readJson<StoredCrm>(join(dir, "crm.json")) ?? { deals: [], notes: [] };
      const deals = crm.deals.map((d): RawItem => ({
        source: "crm", kind: "deal", external_id: d.id, event_time: `${d.close_date}T00:00:00Z`, recorded_time: d.recorded_time,
        payload: { name: d.name, amount_cents: d.amount_cents, close_date: d.close_date, owner: d.owner, stage: d.stage }, party_hint: { party_id: d.party_id },
      }));
      const notes = crm.notes.map((n): RawItem => ({
        source: "crm", kind: "note", external_id: n.id, event_time: n.ts, recorded_time: n.ts,
        payload: { author: n.author, ts: n.ts, text: n.text }, party_hint: { party_id: n.party_id },
      }));
      return [...deals, ...notes];
    },
  };
}

export function contractFiles(dir: string): Connector {
  return {
    name: "contract-files",
    async pull() {
      const folder = join(dir, "contracts");
      if (!existsSync(folder)) return [];
      return readdirSync(folder).filter((f) => f.endsWith(".md")).sort().map((file): RawItem => {
        const raw = readFileSync(join(folder, file), "utf8");
        const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
        if (!m) throw new Error(`REFUSE ${file}: no front matter, so the contract has no recorded_time`);
        const meta = Object.fromEntries(m[1]!.split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
        const recorded = meta.recorded_time;
        if (!meta.contract_id || !recorded) throw new Error(`REFUSE ${file}: front matter needs contract_id and recorded_time`);
        return {
          source: "contract", kind: "contract", external_id: meta.contract_id, event_time: recorded, recorded_time: recorded,
          payload: { contract_id: meta.contract_id, text: m[2]!.trim() }, party_hint: { party_id: meta.party_id },
        };
      });
    },
  };
}

interface StoredFile { id: string; kind: string; title: string; recorded_time: string; sections: Array<{ slug: string; heading: string; text: string }> }

/** One trace per memo section, so a search hit and an evidence quote point at the rule, not at the whole memo. */
export function policyFiles(dir: string): Connector {
  return {
    name: "policy-files",
    async pull() {
      const folder = join(dir, "files");
      if (!existsSync(folder)) return [];
      return readdirSync(folder).filter((f) => f.endsWith(".json")).sort().flatMap((file) => {
        const doc = JSON.parse(readFileSync(join(folder, file), "utf8")) as StoredFile;
        return doc.sections.map((s): RawItem => ({
          source: "file", kind: doc.kind, external_id: `${doc.id}#${s.slug}`, event_time: doc.recorded_time, recorded_time: doc.recorded_time,
          payload: { document: doc.title, heading: s.heading, text: s.text },
        }));
      });
    },
  };
}

const BANK_HEADER = "external_id,posted_date,amount,descriptor,method,recorded_time,running_balance";

/**
 * The bank feed is a file (Phase 0 decision 3). Structure is validated before content, and the whole file is
 * refused on the first failure: every row has the header's field count (an unquoted 1,240.00 would split,
 * corpus F-01), amounts parse to integer cents without a float (F-07), and the running balance is the control
 * total: previous balance plus the line equals the printed balance, line by line (F-04).
 */
export function bankFile(dir: string, account = "operating"): Connector {
  return {
    name: "bank-file",
    async pull() {
      const path = join(dir, "bank", `${account}.csv`);
      if (!existsSync(path)) return [];
      return parseBankCsv(readFileSync(path, "utf8"), `${account}.csv`);
    },
  };
}

export function parseBankCsv(text: string, label = "bank file"): RawItem[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines[0] !== BANK_HEADER) throw new Error(`REFUSE ${label}: unexpected header`);
  const width = BANK_HEADER.split(",").length;
  let balance: number | null = null;
  return lines.slice(1).map((line, i): RawItem => {
    const f = splitCsv(line);
    if (f.length !== width) throw new Error(`REFUSE ${label}: row ${i + 2} has ${f.length} fields, header has ${width}`);
    const [id, posted, amount, descriptor, method, recorded, running] = f as [string, string, string, string, string, string, string];
    const cents = toCents(amount, label, i + 2);
    const printed = toCents(running, label, i + 2);
    if (balance !== null && balance + cents !== printed) throw new Error(`REFUSE ${label}: row ${i + 2} breaks the running balance (${balance} + ${cents} is not ${printed})`);
    balance = printed;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(posted)) throw new Error(`REFUSE ${label}: row ${i + 2} posted_date is not YYYY-MM-DD`);
    return {
      source: "bank", kind: "bank_line", external_id: id, event_time: `${posted}T00:00:00Z`, recorded_time: recorded,
      payload: { posted_date: posted, amount_cents: cents, amount, descriptor, method },
      party_hint: { text: descriptor },
      bank_txn: { id, posted_date: posted, amount_cents: cents, descriptor, method },
    };
  });
}

function toCents(s: string, label: string, row: number): number {
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
  if (!m) throw new Error(`REFUSE ${label}: row ${row} amount "${s}" is not a plain decimal with two places`);
  return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number(m[3]));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parties first-class sources need before anything else: bank lines resolve against aliases, mail against domains. */
export function localConnectors(dir: string = DEFAULT_STORES_DIR): Connector[] {
  return [contractFiles(dir), policyFiles(dir), localCrm(dir), localMail(dir), localChat(dir), bankFile(dir)];
}
