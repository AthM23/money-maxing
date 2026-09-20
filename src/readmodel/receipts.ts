import { CaseFile } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { getBankTxn, getDoc, safeJson } from "../runtime/lookups.js";
import { listParkedDecisions } from "./parked.js";
import { entryDateOf, judgmentCentsOf } from "./proposalFields.js";
import { classifySettlement, type DecisionRow } from "./settledBy.js";
import type { BankLineRef, OpenQuestion, PostedEntry, ReceiptRow } from "./types.js";

interface IntentRow { id: string; function: string; case_json: string; status: ReceiptRow["status"] }

/** One row per intent that carries a case file: the receipt as the drift monitor opened it, and what happened to it since. */
export function buildReceipts(db: Db): ReceiptRow[] {
  const rows = db.prepare("SELECT id, function, case_json, status FROM intent WHERE case_json IS NOT NULL ORDER BY created_at, id").all() as IntentRow[];
  const receipts: ReceiptRow[] = [];
  for (const row of rows) {
    const parsed = CaseFile.safeParse(safeJson(row.case_json));
    // This runtime never writes a case_json that fails its own schema; skip rather than guess at a shape.
    if (parsed.success) receipts.push(toReceiptRow(db, row, parsed.data));
  }
  return receipts;
}

function toReceiptRow(db: Db, row: IntentRow, c: CaseFile): ReceiptRow {
  const party = db.prepare("SELECT name FROM party WHERE id = ?").get(c.party_id) as { name: string } | undefined;
  return {
    intent_id: row.id, function: row.function, status: row.status, party_id: c.party_id, party_name: party?.name ?? null,
    bank_line: bankLineRef(db, c.bank_txn_id), doc_ids: c.doc_ids, expected_cents: c.expected_cents, received_cents: c.received_cents,
    shortfall_cents: c.shortfall_cents, open_cents_now: c.doc_ids.reduce((n, id) => n + (getDoc(db, id)?.open_cents ?? 0), 0),
    posted: postedEntries(db, row.id), parked: listParkedDecisions(db, row.id), open_questions: openQuestions(db, row.id),
  };
}

function bankLineRef(db: Db, bankTxnId: string | undefined): BankLineRef | null {
  if (!bankTxnId) return null;
  const txn = getBankTxn(db, bankTxnId);
  return txn ? { id: txn.id, descriptor: txn.descriptor ?? "", posted_date: txn.posted_date, amount_cents: txn.amount_cents } : null;
}

const DECISION_COLUMNS = "id, actor, tier, model_calls, cost_micros, proposal_json";

function postedEntries(db: Db, intentId: string): PostedEntry[] {
  const rows = db.prepare(`SELECT ${DECISION_COLUMNS}, kind FROM decision WHERE intent_id = ? AND mode = 'live' AND posted_at IS NOT NULL ORDER BY rowid`)
    .all(intentId) as (DecisionRow & { kind: string })[];
  return rows.map((r) => ({
    decision_id: r.id, kind: r.kind, entry_date: entryDateOf(r.proposal_json), amount_cents: judgmentCentsOf(r.proposal_json),
    settled_by: classifySettlement(db, r),
  }));
}

function openQuestions(db: Db, intentId: string): OpenQuestion[] {
  const rows = db.prepare(
    `SELECT e.id AS escalation_id, e.decision_id, e.asked_user, e.question_json, e.asked_at FROM escalation e JOIN decision d ON d.id = e.decision_id
       WHERE d.intent_id = ? AND e.answered_at IS NULL ORDER BY e.asked_at`,
  ).all(intentId) as { escalation_id: string; decision_id: string; asked_user: string; question_json: string; asked_at: string }[];
  return rows.map((r) => ({
    escalation_id: r.escalation_id, decision_id: r.decision_id, intent_id: intentId, asked_user: r.asked_user,
    question: safeJson(r.question_json), asked_at: r.asked_at,
  }));
}
