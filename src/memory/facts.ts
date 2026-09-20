import { z } from "zod";
import { IsoDate, PROPOSAL_KINDS } from "../contract/types.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { emit } from "../runtime/events.js";
import { newId } from "../runtime/ids.js";
import { getTrace, safeJson } from "../runtime/lookups.js";

/** What an answer or a found document may turn into. Nothing open-ended, nothing wider than what was said. */
export const FactCandidate = z.object({
  party_id: z.string().min(1),
  predicate: z.string().min(1),                       // e.g. "concession_pct", "payer_alias", "one_time_credit"
  value: z.record(z.string(), z.unknown()),
  kinds: z.array(z.enum(PROPOSAL_KINDS)).min(1),      // the decision kinds it may be cited for
  uses: z.enum(["standing", "one_time"]),
  valid_from: IsoDate,
  valid_to: IsoDate,                                  // required: a fact must end
  explained_amount_cents: z.number().int().nonnegative().optional(),
  source_trace_ids: z.array(z.string().min(1)).min(1),
  stated_by: z.string().min(1),
});
export type FactCandidate = z.infer<typeof FactCandidate>;

export type RecordFactResult =
  | { status: "invalid"; issues: string[] }
  | { status: "candidate"; fact_id: string };

/** Store a candidate. It changes nothing until someone with authority approves it. */
export function recordFactCandidate(db: Db, clock: Clock, input: unknown): RecordFactResult {
  const parsed = FactCandidate.safeParse(input);
  if (!parsed.success) return { status: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const f = parsed.data;
  const issues = guardCandidate(db, f);
  if (issues.length > 0) return { status: "invalid", issues };
  const id = newId("fact");
  db.prepare(
    `INSERT INTO fact (id, party_id, predicate, value_json, scope_json, explained_amount_cents, uses, valid_from, valid_to,
                       learned_at, source_trace_ids_json, stated_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate')`,
  ).run(id, f.party_id, f.predicate, JSON.stringify(f.value), JSON.stringify({ kinds: f.kinds }), f.explained_amount_cents ?? null,
    f.uses, f.valid_from, f.valid_to, clock.now(), JSON.stringify(f.source_trace_ids), f.stated_by);
  return { status: "candidate", fact_id: id };
}

/** Pinned to stable keys, sourced, and ending after it starts. A bank descriptor is never a key. */
function guardCandidate(db: Db, f: FactCandidate): string[] {
  const issues: string[] = [];
  if (!db.prepare("SELECT 1 FROM party WHERE id = ?").get(f.party_id)) issues.push(`party_id: ${f.party_id} is not in the party master`);
  if (f.valid_to < f.valid_from) issues.push("valid_to: ends before it starts");
  for (const traceId of f.source_trace_ids) {
    if (!db.prepare("SELECT 1 FROM trace WHERE id = ?").get(traceId)) issues.push(`source_trace_ids: trace ${traceId} does not exist`);
  }
  return issues;
}

export type ApproveFactResult =
  | { status: "not_found" | "not_candidate"; fact_id: string }
  | { status: "unauthorised"; fact_id: string; reason: string }
  | { status: "active"; fact_id: string; max_amount_cents: number };

/**
 * Activate a fact. It inherits the authority ceiling of whoever approved it (corpus G-04), so a rule learned
 * from a $10,000 approver can never clear a $14,000 entry. A newer fact for the same party and predicate
 * supersedes the old one; the old row stays on record.
 */
export function approveFact(db: Db, clock: Clock, factId: string, approverId: string): ApproveFactResult {
  const fact = db.prepare("SELECT id, party_id, predicate, status, source_trace_ids_json FROM fact WHERE id = ?")
    .get(factId) as { id: string; party_id: string; predicate: string; status: string; source_trace_ids_json: string } | undefined;
  if (!fact) return { status: "not_found", fact_id: factId };
  if (fact.status !== "candidate") return { status: "not_candidate", fact_id: factId };
  const sources = safeJson(fact.source_trace_ids_json);
  if (!Array.isArray(sources) || !sources.length || sources.some(id => typeof id !== "string" || !getTrace(db, id) || getTrace(db, id)?.superseded_by)) {
    return { status: "unauthorised", fact_id: factId, reason: "source evidence is missing or superseded; record a fresh candidate" };
  }
  const approver = db.prepare("SELECT limit_cents FROM approver WHERE id = ?").get(approverId) as { limit_cents: number } | undefined;
  if (!approver) return { status: "unauthorised", fact_id: factId, reason: `${approverId} is not in the approval matrix` };

  const run = db.transaction(() => {
    db.prepare("UPDATE fact SET status = 'superseded' WHERE party_id = ? AND predicate = ? AND status = 'active'")
      .run(fact.party_id, fact.predicate);
    db.prepare("UPDATE fact SET status = 'active', approved_by = ?, max_amount_cents = ? WHERE id = ?")
      .run(approverId, approver.limit_cents, factId);
    emit(db, clock, { topic: "fact.activated", from_function: "memory", intent_id: null,
      payload: { fact_id: factId, party_id: fact.party_id, predicate: fact.predicate, approved_by: approverId } });
    reopenCasesWaitingOnMemory(db, fact.party_id);
  });
  run();
  return { status: "active", fact_id: factId, max_amount_cents: approver.limit_cents };
}

/**
 * A case the agents could not settle waits on a person. When that person's answer is a fact (who pays for whom, a
 * standing rate), the case is worth another pass, so it goes back to open. A case with an entry parked or a question
 * still unanswered stays where it is: those have their own way back.
 */
function reopenCasesWaitingOnMemory(db: Db, partyId: string): void {
  db.prepare(
    `UPDATE intent SET status = 'open', closed_at = NULL
     WHERE status = 'waiting_on_human' AND json_extract(case_json, '$.party_id') = ?
       AND NOT EXISTS (SELECT 1 FROM decision d WHERE d.intent_id = intent.id AND d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
                         AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected'))
       AND NOT EXISTS (SELECT 1 FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE d.intent_id = intent.id AND e.answered_at IS NULL)`,
  ).run(partyId);
}

/** A person said no. The candidate is kept on record and never applies; the schema's word for that is expired. */
export function rejectFact(db: Db, factId: string): { status: "rejected" | "not_candidate" } {
  const info = db.prepare("UPDATE fact SET status = 'expired' WHERE id = ? AND status = 'candidate'").run(factId);
  return { status: info.changes === 1 ? "rejected" : "not_candidate" };
}

export interface FactCandidateView {
  id: string; party_id: string; predicate: string; value: Record<string, unknown>; kinds: string[];
  uses: string; valid_from: string; valid_to: string; stated_by: string; source_trace_ids: string[]; explained_amount_cents: number | null;
}

/** What an agent proposes to remember, waiting for a person. It applies to nothing until approved. */
export function factCandidates(db: Db): FactCandidateView[] {
  const rows = db.prepare("SELECT * FROM fact WHERE status = 'candidate' ORDER BY learned_at, id").all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id), party_id: String(r.party_id), predicate: String(r.predicate),
    value: (safeJson(String(r.value_json)) as Record<string, unknown> | null) ?? {},
    kinds: ((safeJson(String(r.scope_json)) as { kinds?: string[] } | null)?.kinds) ?? [],
    uses: String(r.uses), valid_from: String(r.valid_from), valid_to: String(r.valid_to), stated_by: String(r.stated_by),
    source_trace_ids: (safeJson(String(r.source_trace_ids_json)) as string[] | null) ?? [],
    explained_amount_cents: typeof r.explained_amount_cents === "number" ? r.explained_amount_cents : null,
  }));
}

/** Facts whose end date has passed stop applying. Run at the start of every period run. */
export function expireFacts(db: Db, today: string): number {
  return db.prepare("UPDATE fact SET status = 'expired' WHERE status = 'active' AND valid_to < ?").run(today).changes;
}
