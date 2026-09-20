import { z } from "zod";
import { Proposal, type Mark } from "../contract/types.js";
import { approveDecision, type ApproveResult } from "../runtime/approve.js";
import { DEFAULT_CONFIG, systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { getTrace, safeJson } from "../runtime/lookups.js";

/** What the controller sees: the proposal, the kernel's marks, and the full text of every cited source. Nothing else. */
export interface ReviewPacket {
  decision_id: string;
  proposal: Proposal;
  marks: Mark[];
  sources: { trace_id: string; text: string }[];
}

export const ControllerVerdict = z.object({
  agrees: z.boolean(),
  /** One line per judgment mark reviewed, or the reason for disagreeing. Shown to the human approver. */
  note: z.string().min(1),
  concerns: z.array(z.string()).default([]),
});
export type ControllerVerdict = z.infer<typeof ControllerVerdict>;

/** An independent reviewer on a different model family from the preparer, so its errors are not the preparer's errors. */
export interface Controller {
  id: string;
  review(packet: ReviewPacket): Promise<ControllerVerdict>;
}

export type ControllerOutcome =
  | { status: "not_pending"; decision_id: string }
  | { status: "disagreed"; decision_id: string; verdict: ControllerVerdict }
  | { status: "needs_human"; decision_id: string; verdict: ControllerVerdict }
  | { status: "approved_by_controller"; decision_id: string; verdict: ControllerVerdict; result: ApproveResult };

/**
 * Review a parked proposal. The controller may approve only below materiality (the kernel enforces that at the
 * post gate regardless). At or above it, its note goes to the human approver; a disagreement escalates.
 */
export async function controllerReview(
  db: Db, controller: Controller, decisionId: string, deps: { clock?: Clock; config?: RuntimeConfig } = {},
): Promise<ControllerOutcome> {
  const packet = buildPacket(db, decisionId);
  if (!packet) return { status: "not_pending", decision_id: decisionId };
  const verdict = ControllerVerdict.parse(await controller.review(packet));
  recordNote(db, deps.clock ?? systemClock, decisionId, controller.id, verdict);
  if (!verdict.agrees) return { status: "disagreed", decision_id: decisionId, verdict };

  const result = approveDecision(db, decisionId, { approver_id: controller.id, approver_kind: "controller_agent", outcome: "approved", note: verdict.note },
    { clock: deps.clock, config: deps.config ?? DEFAULT_CONFIG });
  if (result.status === "posted") return { status: "approved_by_controller", decision_id: decisionId, verdict, result };
  return { status: "needs_human", decision_id: decisionId, verdict };
}

function buildPacket(db: Db, decisionId: string): ReviewPacket | null {
  const row = db.prepare("SELECT proposal_json, route FROM decision WHERE id = ? AND mode = 'live'")
    .get(decisionId) as { proposal_json: string | null; route: string | null } | undefined;
  if (!row?.proposal_json || row.route !== "PROPOSE") return null;
  const proposal = Proposal.safeParse(safeJson(row.proposal_json));
  if (!proposal.success) return null;
  const wp = db.prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(decisionId) as { marks_json: string } | undefined;
  const marks = ((safeJson(wp?.marks_json ?? "{}") as { marks?: Mark[] } | null)?.marks) ?? [];
  const sources = proposal.data.evidence.flatMap((e) => {
    const t = getTrace(db, e.trace_id);
    return t ? [{ trace_id: t.id, text: t.payload_text }] : [];
  });
  return { decision_id: decisionId, proposal: proposal.data, marks, sources };
}

/** The controller's note is a step on the decision timeline, so the human approver and the auditor both see it. */
function recordNote(db: Db, clock: Clock, decisionId: string, controllerId: string, verdict: ControllerVerdict): void {
  const next = db.prepare("SELECT COALESCE(MAX(step_no), 0) + 1 AS n FROM decision_step WHERE decision_id = ?").get(decisionId) as { n: number };
  db.prepare("INSERT INTO decision_step (decision_id, step_no, ts, kind, tool, output_json) VALUES (?, ?, ?, 'model_turn', ?, ?)")
    .run(decisionId, next.n, clock.now(), `controller:${controllerId}`, JSON.stringify(verdict));
}

export const CONTROLLER_PROMPT = `You are the controller reviewing an accounting entry an agent prepared. You did not prepare it and you owe it nothing.
Read the proposal, the kernel's tick marks and the full text of every cited source. Check: does each quoted source actually say what the claim says, in context (a later message can reverse an earlier one)? Is the account treatment right for the facts (a price concession on a subscription still being delivered reduces deferred revenue, not current revenue)? Is the amount the amount the source supports, no more? Is anything material missing that a careful reviewer would ask for?
Answer in JSON: {"agrees": boolean, "note": "one or two sentences for the human approver", "concerns": ["..."]}. If you are unsure, do not agree.`;
