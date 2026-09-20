import type { Topic } from "../contract/topics.js";
import type { Proposal, ProposalKind } from "../contract/types.js";
import type { Clock } from "./config.js";
import type { Db } from "./db.js";
import { emit } from "./events.js";
import { newId } from "./ids.js";

export interface PostInput {
  decision_id: string;
  intent_id: string;
  proposal: Proposal;
}

export interface PostResult {
  entry_id: string | null;
  event_ids: number[];
}

const KIND_TOPIC: Partial<Record<ProposalKind, Topic>> = {
  apply_payment: "ar.payment.applied",
  credit_memo: "ar.credit_memo.posted",
  dispute_hold: "ar.dispute.opened",
  customer_credit: "ar.unapplied_cash",
  approve_bill: "ap.bill.approved",
  hold_bill: "ap.bill.held",
  schedule_payment: "ap.payment.scheduled",
  accrual: "close.accrual.posted",
  payroll_accrual: "close.accrual.posted",
  rev_recognition: "rev.recognised",
};

const REDUCES_INVOICE: ReadonlySet<ProposalKind> = new Set(["apply_payment", "credit_memo", "write_off"]);

/** Post an accepted proposal. One SQLite transaction: ledger, subledger, artifact and events move together or not at all. */
export function postEntry(db: Db, clock: Clock, input: PostInput): PostResult {
  const run = db.transaction((): PostResult => {
    const entryId = writeLedger(db, clock, input);
    applyToDocuments(db, input.proposal);
    if (entryId) writeArtifact(db, clock, input, entryId);
    db.prepare("UPDATE decision SET posted_at = ? WHERE id = ?").run(clock.now(), input.decision_id);
    return { entry_id: entryId, event_ids: emitEvents(db, clock, input, entryId) };
  });
  return run();
}

function writeLedger(db: Db, clock: Clock, input: PostInput): string | null {
  const { proposal } = input;
  if (proposal.entries.length === 0) return null;
  const entryId = newId("je");
  const memo = proposal.entries[0]?.memo || proposal.kind;
  db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(entryId, proposal.entry_date.slice(0, 7), proposal.entry_date, input.decision_id, memo, clock.now());
  const insertLine = db.prepare(
    "INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents, party_id) VALUES (?, ?, ?, ?, ?, ?)",
  );
  proposal.entries.forEach((line, i) => {
    insertLine.run(entryId, i + 1, line.account, line.debit_cents, line.credit_cents, proposal.party_id);
  });
  return entryId;
}

function applyToDocuments(db: Db, proposal: Proposal): void {
  for (const app of proposal.applications) {
    if (REDUCES_INVOICE.has(proposal.kind)) reduceOpen(db, "invoice", app.doc_id, app.amount_cents);
    else if (proposal.kind === "schedule_payment") reduceOpen(db, "bill", app.doc_id, app.amount_cents);
    else if (proposal.kind === "approve_bill") setStatus(db, "bill", app.doc_id, "approved");
    else if (proposal.kind === "hold_bill") setStatus(db, "bill", app.doc_id, "held");
    else if (proposal.kind === "dispute_hold") setStatus(db, "invoice", app.doc_id, "disputed");
  }
}

function reduceOpen(db: Db, table: "invoice" | "bill", id: string, cents: number): void {
  const info = db
    .prepare(`UPDATE ${table} SET open_cents = open_cents - ?, status = CASE WHEN open_cents - ? = 0 THEN 'paid' ELSE status END WHERE id = ? AND open_cents >= ?`)
    .run(cents, cents, id, cents);
  if (info.changes !== 1) throw new Error(`${table} ${id}: cannot apply ${cents} cents (missing, or more than the open balance)`);
}

function setStatus(db: Db, table: "invoice" | "bill", id: string, status: string): void {
  const info = db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(status, id);
  if (info.changes !== 1) throw new Error(`${table} ${id} not found`);
}

function writeArtifact(db: Db, clock: Clock, input: PostInput, entryId: string): void {
  db.prepare(
    "INSERT INTO artifact (id, decision_id, intent_id, function, system, external_id, kind, created_at) VALUES (?, ?, ?, ?, 'ledger', ?, 'gl_entry', ?)",
  ).run(newId("art"), input.decision_id, input.intent_id, input.proposal.function, entryId, clock.now());
}

function emitEvents(db: Db, clock: Clock, input: PostInput, entryId: string | null): number[] {
  const { proposal } = input;
  const base = {
    decision_id: input.decision_id, entry_id: entryId, kind: proposal.kind, party_id: proposal.party_id,
    entry_date: proposal.entry_date, bank_txn_id: proposal.bank_txn_id ?? null, applications: proposal.applications,
  };
  const ids = [emit(db, clock, { topic: "entry.posted", from_function: proposal.function, intent_id: input.intent_id, payload: base })];
  const topic = KIND_TOPIC[proposal.kind];
  if (topic) ids.push(emit(db, clock, { topic, from_function: proposal.function, intent_id: input.intent_id, payload: base }));
  if (proposal.terms_change) {
    ids.push(emit(db, clock, {
      topic: "billing.expectation.changed", from_function: proposal.function, intent_id: input.intent_id,
      payload: { ...base, terms_change: proposal.terms_change, fact_refs: proposal.fact_refs },
    }));
  }
  return ids;
}
