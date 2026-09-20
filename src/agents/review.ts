import { CaseFile } from "../contract/types.js";
import type { AutonomySetting } from "../runtime/autonomy.js";
import { systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { newId } from "../runtime/ids.js";
import { safeJson } from "../runtime/lookups.js";
import { controllerReview, type Controller, type ControllerOutcome } from "./controller.js";
import type { Investigator } from "./investigator.js";
import { runCase } from "./runCase.js";

export interface ReviewLoopResult {
  first: ControllerOutcome;
  /** Set when the controller disagreed and a stronger tier revised the entry. */
  revised_decision_id: string | null;
  second: ControllerOutcome | null;
}

/**
 * Preparer, reviewer, one revision. If the controller disagrees, its concerns go back to a stronger tier, the first
 * draft is declined on the record, and the revision is reviewed again. A person only sees what survives that, with
 * the controller's notes attached. One revision, not a loop: two model opinions that still differ are a person's call.
 */
export async function reviewAndRevise(
  db: Db, controller: Controller, decisionId: string, investigators: Investigator[],
  deps: { clock?: Clock; config?: RuntimeConfig; autonomy_level?: AutonomySetting } = {},
): Promise<ReviewLoopResult> {
  const first = await controllerReview(db, controller, decisionId, deps);
  if (first.status !== "disagreed") return { first, revised_decision_id: null, second: null };

  const caseFile = loadCase(db, decisionId);
  if (!caseFile) return { first, revised_decision_id: null, second: null };
  decline(db, deps.clock ?? systemClock, decisionId, controller.id, first.verdict.note);
  const revised = await runCase(db, caseFile, {
    mode: "live", autonomy_level: deps.autonomy_level ?? "auto", investigators, start_tier: Math.min(2, investigators.length), clock: deps.clock, config: deps.config,
    extra_notes: [`An independent controller rejected the previous draft: ${first.verdict.note}`, ...first.verdict.concerns.map((c) => `Concern: ${c}`)],
  });
  if (!revised.decision_id || revised.final_route !== "PROPOSE") return { first, revised_decision_id: revised.decision_id, second: null };
  const second = await controllerReview(db, controller, revised.decision_id, deps);
  return { first, revised_decision_id: revised.decision_id, second };
}

function loadCase(db: Db, decisionId: string): CaseFile | null {
  const row = db.prepare("SELECT i.case_json FROM decision d JOIN intent i ON i.id = d.intent_id WHERE d.id = ?").get(decisionId) as { case_json: string | null } | undefined;
  const parsed = row?.case_json ? CaseFile.safeParse(safeJson(row.case_json)) : null;
  return parsed?.success ? parsed.data : null;
}

/** The first draft is declined on the record by the controller, so it can never be approved later by mistake. */
function decline(db: Db, clock: Clock, decisionId: string, controllerId: string, note: string): void {
  db.prepare("INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, note, approved_at) VALUES (?, ?, ?, 'controller_agent', 'rejected', ?, ?)")
    .run(newId("apr"), decisionId, controllerId, note, clock.now());
  db.prepare("UPDATE decision SET route = 'REFUSE' WHERE id = ? AND posted_at IS NULL").run(decisionId);
}
