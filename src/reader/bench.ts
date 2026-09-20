import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ACCOUNTS } from "../contract/accounts.js";
import type { CaseFile } from "../contract/types.js";
import { fixedBenchClock } from "./benchClock.js";
import { RemittanceRead, type DocumentReader } from "./types.js";
import { openDb, type Db } from "../runtime/db.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { runOpenIntents } from "../worker/runOpenIntents.js";

export interface BenchDoc { text: string; gold: RemittanceRead; family: string; held_out_party: boolean }

export interface ReaderBenchResult {
  reader: string;
  n: number;
  /** The reading passed every check in code and the receipt was applied to the invoices the customer named. */
  settled_from_code: number;
  /** Cash applied as the customer said, with a claimed deduction left open for investigation (never conceded). */
  applied_deduction_open: number;
  /** The reading was refused by code, or the reader gave none. The receipt waits for a stronger tier or a person. */
  left_for_judgment: number;
  /** A posting that differs from what the customer's remittance says. This is the number that must be zero. */
  wrong_postings: number;
  books_tied: boolean;
  avg_latency_ms: number;
  refusal_reasons: Record<string, number>;
  by_family: Record<string, { n: number; settled: number }>;
}

/** Remittance documents from lane C's held-out test split (ft/data/sft.test.jsonl), with their gold labels. */
export function loadBenchDocs(path: string, n: number, family?: string): BenchDoc[] {
  const docs: BenchDoc[] = [];
  const seenInvoices = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim() || docs.length >= n) continue;
    const row = JSON.parse(line) as { messages: { content: string }[]; meta: { doc_kind: string; family: string; held_out_party: boolean } };
    if (row.meta.doc_kind !== "remittance" || (family && row.meta.family !== family)) continue;
    const gold = RemittanceRead.safeParse(JSON.parse(row.messages[1]!.content));
    const text = row.messages[0]!.content.split("\n\n").slice(1).join("\n\n");
    if (!gold.success || gold.data.applications.some((a) => seenInvoices.has(a.invoice))) continue;
    for (const a of gold.data.applications) seenInvoices.add(a.invoice);
    docs.push({ text, gold: gold.data, family: row.meta.family, held_out_party: row.meta.held_out_party });
  }
  return docs;
}

/** What the customer's remittance really directs: each invoice in full, or for a single short-paid invoice, the net. */
function trueAllocation(g: RemittanceRead): { doc_id: string; amount_cents: number }[] {
  return g.applications.map((a) => ({ doc_id: a.invoice, amount_cents: g.discount_cents > 0 ? g.amount_cents : a.amount_cents }));
}

/** One customer, their invoices (plus two older decoys so oldest-first would be wrong), a bare bank line, and the mail. */
function seedDoc(db: Db, i: number, d: BenchDoc): number {
  const party = `cust_${i}`;
  const date = d.gold.date ?? "2026-07-15";
  db.prepare("INSERT INTO party (id, kind, name, owner_user) VALUES (?, 'customer', ?, 'U_DANA')").run(party, d.gold.payer ?? party);
  const insertInvoice = db.prepare("INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, ?, '2026-03-01', '2026-03-31', ?, ?, 'open')");
  let ar = 0;
  for (const a of d.gold.applications) { insertInvoice.run(a.invoice, party, a.amount_cents, a.amount_cents); ar += a.amount_cents; }
  for (const k of [1, 2]) { insertInvoice.run(`DECOY-${i}-${k}`, party, 123400 * k, 123400 * k); ar += 123400 * k; }
  db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES (?, ?, ?, ?, 'ach', ?)")
    .run(`BTX-${i}`, date, d.gold.amount_cents, `ORIG CO NAME:${(d.gold.payer ?? party).toUpperCase()} CO ENTRY DESCR:AP BATCH SEC:CCD`, party);
  const payload = JSON.stringify({ subject: "Remittance", body: d.text });
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, 'gmail', 'email', ?, ?, ?, ?, ?, ?, ?)")
    .run(`tr_${i}`, `m-${i}`, `${date}T08:00:00Z`, `${date}T08:00:00Z`, "2026-09-19T20:00:00Z", party, createHash("sha256").update(payload).digest("hex"), payload);
  const c: CaseFile = { intent_id: `int_${i}`, function: "ar", party_id: party, entry_date: date, bank_txn_id: `BTX-${i}`, doc_ids: [],
    expected_cents: 0, received_cents: d.gold.amount_cents, shortfall_cents: -d.gold.amount_cents, method: "ach", trace_ids: [],
    matching_issue: "No unique invoice allocation; obtain the customer's remittance." };
  db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'ar', 'Identify the deposit', 'ar', 'open', ?, ?)")
    .run(c.intent_id, JSON.stringify(c), `${date}T09:00:00Z`);
  return ar;
}

export function buildBenchWorld(docs: BenchDoc[]): Db {
  const db = openDb();
  for (let m = 1; m <= 12; m += 1) db.prepare("INSERT INTO period (id, status) VALUES (?, 'open')").run(`2026-${String(m).padStart(2, "0")}`);
  const ar = docs.reduce((n, d, i) => n + seedDoc(db, i, d), 0);
  db.exec(`INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-01-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at) VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-01','2026-01-01','dec_open','Open invoices','2026-01-01T00:00:00Z');`);
  db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES ('je_open',1,?,?,0), ('je_open',2,?,0,?)")
    .run(ACCOUNTS.ar, ar, ACCOUNTS.deferred_revenue, ar);
  return db;
}

/** Run the real worker over the documents with one reader, then check every posting against what the customer wrote. */
export async function runReaderBench(docs: BenchDoc[], reader: DocumentReader | undefined): Promise<ReaderBenchResult> {
  const db = buildBenchWorld(docs);
  const report = await runOpenIntents(db, { investigators: [], reader, clock: fixedBenchClock });
  const result: ReaderBenchResult = { reader: reader?.name ?? "no reader", n: docs.length, settled_from_code: 0, applied_deduction_open: 0,
    left_for_judgment: 0, wrong_postings: 0, books_tied: false, avg_latency_ms: 0, refusal_reasons: {}, by_family: {} };
  docs.forEach((d, i) => score(db, result, d, i));
  for (const r of report.readings.filter((x) => x.outcome === "rejected")) {
    const key = (r.reason ?? "unknown").replace(/\d[\d,.]*/g, "#").slice(0, 70);
    result.refusal_reasons[key] = (result.refusal_reasons[key] ?? 0) + 1;
  }
  const t = readControlTotals(db);
  result.books_tied = t.ar_gl_cents === t.ar_subledger_cents;
  result.avg_latency_ms = report.readings.length ? Math.round(report.readings.reduce((n, r) => n + r.latency_ms, 0) / report.readings.length) : 0;
  return result;
}

function score(db: Db, result: ReaderBenchResult, d: BenchDoc, i: number): void {
  const fam = (result.by_family[d.family] ??= { n: 0, settled: 0 });
  fam.n += 1;
  const row = db.prepare("SELECT proposal_json FROM decision WHERE intent_id = ? AND kind = 'apply_payment' AND posted_at IS NOT NULL").get(`int_${i}`) as { proposal_json: string } | undefined;
  if (!row) { result.left_for_judgment += 1; return; }
  const posted = (JSON.parse(row.proposal_json) as { applications: { doc_id: string; amount_cents: number }[] }).applications;
  const canon = (a: { doc_id: string; amount_cents: number }[]): string => a.map((x) => `${x.doc_id}=${x.amount_cents}`).sort().join(",");
  if (canon(posted) !== canon(trueAllocation(d.gold))) { result.wrong_postings += 1; return; }
  if (d.gold.discount_cents > 0) result.applied_deduction_open += 1;
  else { result.settled_from_code += 1; fam.settled += 1; }
}
