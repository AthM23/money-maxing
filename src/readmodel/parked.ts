import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { judgmentCentsOf, partyIdOf } from "./proposalFields.js";
import { classifySettlement, type DecisionRow } from "./settledBy.js";
import type { ParkedEntry } from "./types.js";

const COLUMNS = "d.id, d.actor, d.tier, d.model_calls, d.cost_micros, d.proposal_json, d.kind, d.intent_id";

/**
 * Decisions the kernel accepted but that still need a person: parked for approval, never declined. Pass an
 * intent_id to scope this to one receipt, or omit it for every parked decision in the database.
 */
export function listParkedDecisions(db: Db, intentId?: string): ParkedEntry[] {
  const rows = db.prepare(
    `SELECT ${COLUMNS} FROM decision d WHERE d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
       AND (? IS NULL OR d.intent_id = ?)
       AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')
     ORDER BY d.rowid`,
  ).all(intentId ?? null, intentId ?? null) as (DecisionRow & { kind: string; intent_id: string })[];
  return rows.map((r) => ({
    decision_id: r.id, intent_id: r.intent_id, kind: r.kind, party_id: partyIdOf(r.proposal_json),
    amount_cents: judgmentCentsOf(r.proposal_json), prepared_by: classifySettlement(db, r), controller_note: controllerNote(db, r.id), ...reasoning(r.proposal_json),
  }));
}

function reasoning(proposalJson: string | null): Pick<ParkedEntry, "why" | "evidence"> {
  const p = safeJson(proposalJson ?? "null") as { judgment?: { note?: string }[]; evidence?: { claim?: string; trace_id?: string; quote?: string }[] } | null;
  return {
    why: (p?.judgment ?? []).map((j) => j.note ?? "").filter(Boolean),
    evidence: (p?.evidence ?? []).map((e) => ({ claim: e.claim ?? "", trace_id: e.trace_id ?? "", quote: e.quote ?? "" })),
  };
}

/** The controller's most recent note on this decision, if an independent review ran before it parked. */
function controllerNote(db: Db, decisionId: string): string | null {
  const row = db.prepare("SELECT output_json FROM decision_step WHERE decision_id = ? AND tool LIKE 'controller:%' ORDER BY step_no DESC LIMIT 1")
    .get(decisionId) as { output_json: string | null } | undefined;
  const parsed = row?.output_json ? (safeJson(row.output_json) as { note?: string } | null) : null;
  return parsed?.note ?? null;
}
