import { CaseFile, Proposal, type HumanOutcome } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { summarise } from "./compare.js";

/** Decision points cut from the live month carry this prefix, so the ladder can tell them from closed-period history. */
export const LIVE_POINT_PREFIX = "dp_live_";

export interface HarvestedPoint {
  decision_point_id: string;
  intent_id: string;
  decision_id: string;
  kind: string;
}

interface Candidate {
  decision_id: string; intent_id: string; function: string; proposal_json: string; case_json: string;
  approved_at: string; approver_id: string; note: string | null;
}

/**
 * What people decided during the live month becomes history the compile step can learn from. Only entries a PERSON
 * approved count: an entry the agents posted on their own, or that the controller agent approved, is not evidence of
 * what the humans would do, and learning from it would be the system agreeing with itself. One point per settled
 * case: the entry that carries the judgment, or the cash application when there was no judgment to make.
 */
export function harvestLiveOutcomes(db: Db): HarvestedPoint[] {
  const rows = db
    .prepare(
      `SELECT d.id AS decision_id, d.intent_id, d.function, d.proposal_json, i.case_json, a.approved_at, a.approver_id, a.note
       FROM decision d JOIN intent i ON i.id = d.intent_id
       JOIN approval a ON a.decision_id = d.id AND a.approver_kind = 'human' AND a.outcome = 'approved'
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.proposal_json IS NOT NULL
         AND i.status = 'resolved' AND i.case_json IS NOT NULL
       ORDER BY d.intent_id, d.kind = 'apply_payment', d.rowid DESC`,
    )
    .all() as Candidate[];
  const harvested: HarvestedPoint[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.intent_id)) continue;
    seen.add(row.intent_id);
    const point = toPoint(db, row);
    if (point) harvested.push(point);
  }
  return harvested;
}

function toPoint(db: Db, row: Candidate): HarvestedPoint | null {
  const proposal = Proposal.safeParse(safeJson(row.proposal_json));
  const caseFile = CaseFile.safeParse(safeJson(row.case_json));
  if (!proposal.success || !caseFile.success) return null;
  const booked = summarise(proposal.data);
  const outcome: HumanOutcome = {
    kind: proposal.data.kind, amount_cents: booked.amount_cents, doc_ids: booked.doc_ids,
    asked_user: askedUser(db, row.intent_id), note: row.note ?? `approved by ${row.approver_id}`,
    ...(booked.account ? { account: booked.account } : {}),
  };
  const id = `${LIVE_POINT_PREFIX}${row.decision_id}`;
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, row.function, proposal.data.entry_date.slice(0, 7), proposal.data.kind, JSON.stringify(caseFile.data.trace_ids),
      row.approved_at, row.case_json, JSON.stringify(outcome));
  return info.changes === 1 ? { decision_point_id: id, intent_id: row.intent_id, decision_id: row.decision_id, kind: proposal.data.kind } : null;
}

/** Who had to be asked before this case could be settled, if anyone. */
function askedUser(db: Db, intentId: string): string | null {
  const row = db
    .prepare("SELECT e.asked_user FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE d.intent_id = ? ORDER BY e.asked_at LIMIT 1")
    .get(intentId) as { asked_user: string } | undefined;
  return row?.asked_user ?? null;
}
