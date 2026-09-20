import { createHash } from "node:crypto";
import type { EntryLine } from "../contract/types.js";
import { normalizeWs } from "../kernel/util.js";
import type { Db } from "../runtime/db.js";
import { payloadText } from "../runtime/payloadText.js";
import { entryAmountCents, finding } from "./shared.js";
import type { RerunSubject } from "./subject.js";
import type { Finding } from "./types.js";

interface LineRow {
  line_no: number;
  account: string;
  debit_cents: number;
  credit_cents: number;
}

interface TraceRow {
  content_hash: string;
  payload_json: string;
}

/** The ledger is the record; the proposal is the claim. They must agree line for line, in order. */
export function ledgerTieOut(db: Db, subject: RerunSubject): Finding[] {
  const entries = db
    .prepare("SELECT id FROM gl_entry WHERE source_decision_id = ? ORDER BY id")
    .all(subject.decision_id) as { id: string }[];
  const expected = subject.proposal.entries;
  const refs = { decision_id: subject.decision_id, entry_id: entries[0]?.id };
  if (expected.length === 0 && entries.length === 0) return [];
  if (entries.length !== 1) {
    return [finding("ledger_mismatch", `proposal posts ${expected.length} line(s) but ${entries.length} ledger entry(s) cite this decision`, refs)];
  }
  const entryId = entries[0]?.id ?? "";
  const lines = db
    .prepare("SELECT line_no, account, debit_cents, credit_cents FROM gl_line WHERE entry_id = ? ORDER BY line_no")
    .all(entryId) as LineRow[];
  if (lines.length !== expected.length) {
    return [finding("ledger_mismatch", `proposal has ${expected.length} line(s), entry ${entryId} has ${lines.length}`, refs)];
  }
  return expected.flatMap((line, index) => lineDiff(line, lines[index], index, entryId, subject.decision_id));
}

function lineDiff(claimed: EntryLine, posted: LineRow | undefined, index: number, entryId: string, decisionId: string): Finding[] {
  const refs = { decision_id: decisionId, entry_id: entryId };
  if (!posted) return [finding("ledger_mismatch", `line ${index + 1} is missing from entry ${entryId}`, refs)];
  const same = posted.account === claimed.account && posted.debit_cents === claimed.debit_cents && posted.credit_cents === claimed.credit_cents;
  if (same) return [];
  const detail =
    `entry ${entryId} line ${posted.line_no}: ledger has ${posted.account} Dr ${posted.debit_cents} Cr ${posted.credit_cents}, ` +
    `proposal has ${claimed.account} Dr ${claimed.debit_cents} Cr ${claimed.credit_cents}`;
  return [finding("ledger_mismatch", detail, refs)];
}

/**
 * Evidence is only evidence while it still says what it said. Every cited trace must still exist, its
 * content_hash must still be the sha256 of the payload on file (the hash `humanLoop` writes at ingest),
 * and every quoted span must still be found in that payload.
 */
export function evidenceIntegrity(db: Db, subject: RerunSubject): Finding[] {
  const out: Finding[] = [];
  const loaded = new Map<string, TraceRow | null>();
  for (const id of new Set(subject.proposal.evidence.map((item) => item.trace_id))) {
    const row = db.prepare("SELECT content_hash, payload_json FROM trace WHERE id = ?").get(id) as TraceRow | undefined;
    loaded.set(id, row ?? null);
    out.push(...traceProblems(subject.decision_id, id, row));
  }
  for (const item of subject.proposal.evidence) {
    const row = loaded.get(item.trace_id);
    if (!row || item.quote === undefined) continue;
    if (normalizeWs(payloadText(row.payload_json)).includes(normalizeWs(item.quote))) continue;
    const detail = `quoted span is no longer in trace ${item.trace_id}: "${item.quote}"`;
    out.push(finding("evidence_invalidated", detail, { decision_id: subject.decision_id, trace_id: item.trace_id }));
  }
  return out;
}

function traceProblems(decisionId: string, traceId: string, row: TraceRow | undefined): Finding[] {
  const refs = { decision_id: decisionId, trace_id: traceId };
  if (!row) return [finding("evidence_invalidated", `cited trace ${traceId} no longer exists`, refs)];
  const now = createHash("sha256").update(row.payload_json).digest("hex");
  if (now === row.content_hash) return [];
  const detail = `trace ${traceId} payload hashes to ${now}, but the content_hash on file is ${row.content_hash}`;
  return [finding("evidence_invalidated", detail, refs)];
}

/**
 * The approval as a control, tested independently of the kernel: someone real signed it, it was not
 * the person who prepared it, and the money that moved was inside the authority they hold.
 */
export function approvalOnFile(db: Db, subject: RerunSubject): Finding[] {
  const approval = subject.approval;
  if (!approval) {
    if (subject.route !== "PROPOSE") return [];
    const detail = `decision took the approval route but no approval is on file`;
    return [finding("approval_defect", detail, { decision_id: subject.decision_id, entry_id: subject.entry_id ?? undefined })];
  }
  const refs = { decision_id: subject.decision_id, approver_id: approval.approver_id, entry_id: subject.entry_id ?? undefined };
  const amount = entryAmountCents(subject.proposal);
  const approver = db
    .prepare("SELECT id, role, limit_cents FROM approver WHERE id = ?")
    .get(approval.approver_id) as { id: string; role: string; limit_cents: number } | undefined;
  const out: Finding[] = [];
  if (approval.approver_id === subject.actor) {
    out.push(finding("approval_defect", `approver ${approval.approver_id} is the preparer of this decision`, refs));
  }
  if (!approver) {
    out.push(finding("approval_defect", `approver ${approval.approver_id} is not on the authority list`, refs));
    return out;
  }
  if (amount > approver.limit_cents) {
    out.push(finding("approval_defect", `entry moves ${amount} cents, above ${approver.id} (${approver.role}) limit ${approver.limit_cents}`, refs));
  }
  return out;
}
