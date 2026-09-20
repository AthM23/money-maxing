import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS } from "../contract/accounts.js";
import { CaseFile, HumanOutcome } from "../contract/types.js";
import { traceId } from "../ingest/ids.js";
import { SEED_ACCOUNTS } from "../ledger/accounts.js";
import type { Db } from "../ledger/db.js";
import type { World, WorldBankTxn, WorldInvoice } from "./world.js";

export const SEED_INTENT_ID = "int_seed";
export const SEED_DECISION_ID = "dec_seed";
/** Seeded rows carry the world's own clock; `seeded_at` is the only wall-clock value written here. */
const SEED_TS = "2026-04-01T00:00:00Z";

export interface SeedLocalResult { parties: number; invoices: number; bills: number; gl_entries: number; decision_points: number }

/**
 * Load the world into the local ledger: parties, documents and the human-closed Q2 books. July arrives with its
 * invoices issued and nothing else booked; applying July's cash is the agents' work. Bank lines, mail and chat
 * are NOT loaded here: they reach the database through ingestion, like any other source.
 *
 * Kernel obligation (F3): GL 1200 equals open invoices and GL 2000 equals approved or scheduled bills, before any
 * proposal runs. Every invoice is posted with its entry and July bills stay `open` (unapproved, not yet in AP).
 */
export function seedLocal(db: Db, world: World): SeedLocalResult {
  const already = db.prepare("SELECT COUNT(*) AS n FROM seed_manifest WHERE system = 'local'").get() as { n: number };
  if (already.n > 0) throw new Error("database is already seeded; run with --reset for a clean state");
  const result: SeedLocalResult = { parties: 0, invoices: 0, bills: 0, gl_entries: 0, decision_points: 0 };
  db.transaction(() => {
    const manifest = db.prepare("INSERT INTO seed_manifest (world_id, system, kind, external_id, seeded_at) VALUES (?, 'local', ?, ?, ?)");
    const seededAt = new Date().toISOString();
    const note = (kind: string, id: string): void => { manifest.run(`${kind}:${id}`, kind, id, seededAt); };

    for (const p of world.periods) db.prepare("INSERT INTO period (id, status, locked_at) VALUES (?, ?, ?)").run(p.id, p.status, p.status === "locked" ? `${p.id}-28T23:59:59Z` : null);
    seedApprovers(db, world);
    result.parties = seedParties(db, world, note);

    db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at, closed_at) VALUES (?, 'close', 'Seeded history: Q2 as the humans closed it', 'seed', 'resolved', ?, ?)").run(SEED_INTENT_ID, SEED_TS, SEED_TS);
    db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at) VALUES (?, ?, 'close', 'live', 'no_action', 'seed', 'auto', ?)").run(SEED_DECISION_ID, SEED_INTENT_ID, SEED_TS);

    const post = entryWriter(db);
    const settled = settlements(world);
    for (const c of world.contracts) {
      db.prepare("INSERT INTO contract (id, party_id, start_date, end_date, value_cents, terms_json, trace_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(c.id, c.party_id, c.start_date, c.end_date, c.value_cents, JSON.stringify(c.terms), traceId("contract", c.id));
      note("contract", c.id);
    }
    for (const inv of world.invoices) {
      const open = inv.total_cents - (settled.get(inv.id) ?? 0);
      db.prepare("INSERT INTO invoice (id, party_id, contract_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(inv.id, inv.party_id, inv.contract_id, inv.issue_date, inv.due_date, inv.total_cents, open, open === 0 ? "paid" : "open");
      post(`inv_${inv.id}`, inv.issue_date, `Invoice ${inv.id}`, inv.party_id, [[ACCOUNTS.ar, inv.total_cents, 0], [ACCOUNTS.deferred_revenue, 0, inv.total_cents]]);
      if (world.meta.history_periods.includes(inv.issue_date.slice(0, 7))) {
        post(`rev_${inv.id}`, monthEnd(inv.issue_date), `Revenue recognised ${inv.id}`, inv.party_id, [[ACCOUNTS.deferred_revenue, inv.total_cents, 0], [ACCOUNTS.subscription_revenue, 0, inv.total_cents]]);
      }
      note("invoice", inv.id);
      result.invoices++;
    }
    for (const b of world.bills) {
      const paid = settled.has(b.id);
      db.prepare("INSERT INTO bill (id, party_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(b.id, b.party_id, b.vendor_invoice_no, b.bill_date, b.due_date, b.service_period, b.total_cents, paid ? 0 : b.total_cents, paid ? "paid" : "open");
      if (paid) post(`bill_${b.id}`, b.bill_date, `Bill ${b.vendor_invoice_no}`, b.party_id, [[b.expense_account, b.total_cents, 0], [ACCOUNTS.ap, 0, b.total_cents]]);
      note("bill", b.id);
      result.bills++;
    }
    for (const t of world.bank.txns) {
      if (!t.history) continue;
      const entryId = postSettlement(world, t, post);
      db.prepare("INSERT INTO bank_match_seed (bank_txn_id, entry_id) VALUES (?, ?)").run(t.id, entryId);
      if (t.history.write_off) { seedDecisionPoint(db, world, t); result.decision_points++; }
    }
    result.gl_entries = (db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n;
  })();
  return result;
}

function seedApprovers(db: Db, world: World): void {
  const insert = db.prepare("INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES (?, ?, ?, ?, ?)");
  for (const p of world.people) if (p.limit_cents !== undefined) insert.run(p.id, p.name, p.role, p.id, p.limit_cents);
  // Person A's controller agent reviews below materiality only; without this row it approves nothing.
  insert.run("controller:gpt", "Controller agent (GPT)", "controller_agent", null, 49_999);
  insert.run("controller:claude", "Controller agent (Claude fallback)", "controller_agent", null, 49_999);
  // The revenue engine withdraws its own stale recognitions through approveDecision, which only takes a signer in the
  // matrix. A limit of 0 means it can decline and can never approve.
  insert.run("engine:revenue", "Revenue engine (withdrawals only)", "controller_agent", null, 0);
}

function seedParties(db: Db, world: World, note: (kind: string, id: string) => void): number {
  const insert = db.prepare("INSERT INTO party (id, kind, name, parent_id, remit_to_json, owner_user) VALUES (?, ?, ?, ?, ?, ?)");
  const alias = db.prepare("INSERT OR IGNORE INTO alias (party_id, alias, source) VALUES (?, ?, 'seed')");
  // parents first, so the self-reference holds
  const ordered = [...world.parties].sort((a, b) => Number(Boolean(a.parent_id)) - Number(Boolean(b.parent_id)));
  for (const p of ordered) {
    insert.run(p.id, p.kind, p.name, p.parent_id ?? null, p.remit_to ? JSON.stringify(p.remit_to) : null, p.owner ?? null);
    for (const a of p.aliases) alias.run(p.id, a);
    note("party", p.id);
  }
  return ordered.length;
}

/** Cents settled per document by the seeded history, write-offs included. */
function settlements(world: World): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of world.bank.txns) {
    const h = t.history;
    if (!h?.doc_id) continue;
    out.set(h.doc_id, (out.get(h.doc_id) ?? 0) + h.applied_cents + (h.write_off?.amount_cents ?? 0));
  }
  return out;
}

type Line = [account: string, debit: number, credit: number];

function entryWriter(db: Db): (key: string, date: string, memo: string, partyId: string | null, lines: Line[]) => string {
  const entry = db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES (?, ?, ?, ?, ?, ?)");
  const line = db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents, party_id) VALUES (?, ?, ?, ?, ?, ?)");
  return (key, date, memo, partyId, lines) => {
    const debits = lines.reduce((n, l) => n + l[1], 0);
    const credits = lines.reduce((n, l) => n + l[2], 0);
    if (debits !== credits) throw new Error(`seed entry ${key} does not foot: ${debits} vs ${credits}`);
    const id = `je_seed_${key}`;
    entry.run(id, date.slice(0, 7), date, SEED_DECISION_ID, memo, `${date}T23:00:00Z`);
    lines.forEach((l, i) => line.run(id, i + 1, l[0], l[1], l[2], partyId));
    return id;
  };
}

function postSettlement(world: World, t: WorldBankTxn, post: ReturnType<typeof entryWriter>): string {
  const h = t.history!;
  if (h.doc_kind === "equity") return post(`bank_${t.id}`, t.posted_date, "Opening funding", null, [[ACCOUNTS.cash, h.applied_cents, 0], [SEED_ACCOUNTS.equity, 0, h.applied_cents]]);
  if (h.doc_kind === "bill") {
    const bill = world.bills.find((b) => b.id === h.doc_id)!;
    return post(`bank_${t.id}`, t.posted_date, `Payment of ${bill.vendor_invoice_no}`, bill.party_id, [[ACCOUNTS.ap, h.applied_cents, 0], [ACCOUNTS.cash, 0, h.applied_cents]]);
  }
  const inv = invoiceOf(world, h.doc_id);
  const lines: Line[] = [[ACCOUNTS.cash, h.applied_cents, 0]];
  if (h.write_off) lines.push([h.write_off.account, h.write_off.amount_cents, 0]);
  lines.push([ACCOUNTS.ar, 0, h.applied_cents + (h.write_off?.amount_cents ?? 0)]);
  return post(`bank_${t.id}`, t.posted_date, `Cash application ${inv.id}`, inv.party_id, lines);
}

/** A Q2 judgment as replay needs it: the case as the humans saw it, and (never reachable by a tool) what they booked. */
function seedDecisionPoint(db: Db, world: World, t: WorldBankTxn): void {
  const h = t.history!;
  const w = h.write_off!;
  const inv = invoiceOf(world, h.doc_id);
  const bankTrace = traceId("bank", t.id);
  const id = `dp_${t.id}`;
  const caseFile = CaseFile.parse({
    intent_id: `int_replay_${id}`, function: "ar", party_id: inv.party_id, entry_date: w.decided_at.slice(0, 10), doc_ids: [inv.id],
    expected_cents: inv.total_cents, received_cents: 0, shortfall_cents: w.amount_cents, method: t.method, trace_ids: [bankTrace],
    docs_snapshot: [{ id: inv.id, kind: "invoice", party_id: inv.party_id, total_cents: inv.total_cents, open_cents: w.amount_cents, date: inv.issue_date }],
  });
  const outcome = HumanOutcome.parse({ kind: "write_off", account: w.account, amount_cents: w.amount_cents, doc_ids: [inv.id] });
  db.prepare("INSERT INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json) VALUES (?, 'ar', ?, 'short_pay', ?, ?, ?, ?)")
    .run(id, t.posted_date.slice(0, 7), JSON.stringify([bankTrace]), w.decided_at, JSON.stringify(caseFile), JSON.stringify(outcome));
}

function invoiceOf(world: World, id: string | undefined): WorldInvoice {
  const inv = world.invoices.find((i) => i.id === id);
  if (!inv) throw new Error(`world history refers to unknown invoice ${id}`);
  return inv;
}

function monthEnd(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Write the local source stores the connectors read: the bank file, the mailbox, chat, CRM, contracts and the
 * policy memo. These stand behind the same tool names as the live systems and are swapped out one at a time.
 */
export function writeStores(world: World, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  for (const sub of ["bank", "contracts", "files"]) mkdirSync(join(dir, sub), { recursive: true });

  let balance = world.bank.opening_balance_cents;
  const rows = world.bank.txns.map((t) => {
    balance += t.amount_cents;
    return [t.id, t.posted_date, decimal(t.amount_cents), csvField(t.descriptor), t.method, t.recorded_time, decimal(balance)].join(",");
  });
  writeFileSync(join(dir, "bank", `${world.bank.account}.csv`),
    ["external_id,posted_date,amount,descriptor,method,recorded_time,running_balance", ...rows].join("\n") + "\n");

  const names = new Map(world.people.map((p) => [p.id, p.name]));
  writeFileSync(join(dir, "mail.json"), JSON.stringify(world.mail, null, 2));
  writeFileSync(join(dir, "chat.json"), JSON.stringify(world.chat.map((c) => ({ ...c, user_name: names.get(c.user) ?? c.user })), null, 2));
  writeFileSync(join(dir, "crm.json"), JSON.stringify(world.crm, null, 2));
  for (const c of world.contracts) {
    writeFileSync(join(dir, "contracts", `${c.id}.md`), `---\ncontract_id: ${c.id}\nparty_id: ${c.party_id}\nrecorded_time: ${c.recorded_time}\n---\n${c.text}\n`);
  }
  for (const f of world.files) writeFileSync(join(dir, "files", `${f.id}.json`), JSON.stringify(f, null, 2));
}

/** Integer cents to a decimal string, by string arithmetic. No float touches a money path (corpus F-07). */
export function decimal(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function csvField(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
