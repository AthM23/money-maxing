import type { KernelStage, Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { failMark, naMark, passMark, postGateMark, verdictMark } from "./util.js";

/** How far past the fiscal window a terms end date may reach before it looks invented. */
const TERMS_HORIZON_YEARS = 5;

/** P5 — the period is still open to posting. A locked period is also a hard block (H3). */
export function checkP5(ctx: KernelContext): Mark {
  const { id, status } = ctx.period;
  if (status === "open" || status === "closing") {
    return passMark("P", "P5", `period ${id} is ${status}`, [id]);
  }
  return failMark("P", "P5", `period ${id} is ${status}, not open or closing`, [id]);
}

/**
 * P9 — dates are plausible. The entry date lies inside the open fiscal window; a terms end date is not in the
 * past and not absurdly far out (a concession "through renewal" legitimately ends next year).
 */
export function checkP9(proposal: Proposal, ctx: KernelContext): Mark {
  const { from, to } = ctx.fiscal_window;
  const problems: string[] = [];
  if (proposal.entry_date < from || proposal.entry_date > to) {
    problems.push(`entry_date ${proposal.entry_date} is outside the fiscal window ${from}..${to}`);
  }
  const until = proposal.terms_change?.until;
  const latest = `${Number(to.slice(0, 4)) + TERMS_HORIZON_YEARS}${to.slice(4)}`;
  if (until && until < proposal.entry_date) problems.push(`terms_change.until ${until} is before the entry date ${proposal.entry_date}`);
  if (until && until > latest) problems.push(`terms_change.until ${until} is later than ${latest}`);
  const ok = `entry_date ${proposal.entry_date} within ${from}..${to}${until ? `, terms end ${until} on or before ${latest}` : ""}`;
  return verdictMark("P", "P9", problems, ok, [proposal.intent_id]);
}

/** P4 — no escalation attached to this decision is still waiting for an answer. */
export function checkP4(ctx: KernelContext): Mark {
  if (ctx.open_escalations === 0) return passMark("P", "P4", "0 open escalations", [ctx.period.id]);
  return failMark("P", "P4", `${ctx.open_escalations} escalation(s) still unanswered`, [ctx.period.id]);
}

/** P6 — an accrual must say how it reverses. */
export function checkP6(proposal: Proposal): Mark {
  const refs = [proposal.intent_id];
  if (proposal.kind !== "accrual" && proposal.kind !== "payroll_accrual") {
    return naMark("P", "P6", `kind ${proposal.kind} does not reverse`, refs);
  }
  if (!proposal.reversal_mode) {
    return failMark("P", "P6", `kind ${proposal.kind} has no reversal_mode`, refs);
  }
  return passMark("P", "P6", `kind ${proposal.kind} reverses ${proposal.reversal_mode}`, refs);
}

/** P1 — the preparer is not the approver. */
export function checkP1(ctx: KernelContext, stage: KernelStage): Mark {
  if (stage !== "post_gate") return postGateMark("P", "P1");
  const approval = ctx.approval;
  if (!approval) return naMark("P", "P1", "no approval on record", [ctx.preparer]);
  if (approval.approver_id === ctx.preparer) {
    return failMark("P", "P1", `approver ${approval.approver_id} is the preparer`, [ctx.preparer]);
  }
  const detail = `approver ${approval.approver_id} is not the preparer ${ctx.preparer}`;
  return passMark("P", "P1", detail, [approval.approver_id, ctx.preparer]);
}

/** P2 — when approval is required, a valid one is on record. */
export function checkP2(ctx: KernelContext, stage: KernelStage, required: boolean, adjustment: number, proposal?: Proposal): Mark {
  if (stage !== "post_gate") return postGateMark("P", "P2");
  if (!required) return naMark("P", "P2", `approval not required for adjustment ${adjustment}`, [ctx.preparer]);
  const approval = ctx.approval;
  if (!approval) {
    return failMark("P", "P2", `approval required for adjustment ${adjustment} but none is on record`, [ctx.preparer]);
  }
  const refs = [approval.approver_id];
  if (approval.outcome !== "approved" && approval.outcome !== "corrected") {
    return failMark("P", "P2", `approval outcome is ${approval.outcome}, not approved or corrected`, refs);
  }
  const agentProblem = controllerAgentProblem(ctx, adjustment, proposal);
  if (agentProblem) return failMark("P", "P2", agentProblem, refs);
  const detail = `${approval.approver_kind} ${approval.approver_id} ${approval.outcome} adjustment ${adjustment}`;
  return passMark("P", "P2", detail, refs);
}

/**
 * A controller agent may sign only compiled judgment (an entry planned by code, or citing an approved policy or an
 * active fact), below materiality, on a kind of entry with a track record. Anything else needs a person: an entry a
 * model reached by free inference is exactly what was held back from posting alone, and a second model agreeing
 * with the first is not a person.
 */
function controllerAgentProblem(ctx: KernelContext, adjustment: number, proposal?: Proposal): string | undefined {
  const approval = ctx.approval;
  if (!approval || approval.approver_kind !== "controller_agent") return undefined;
  const who = `controller_agent ${approval.approver_id}`;
  if (ctx.autonomy_level === "shadow") return `${who} cannot approve a kind of entry still in shadow; a person must approve`;
  const compiled = ctx.preparer_tier === 0 || (proposal?.policy_refs.length ?? 0) > 0 || (proposal?.fact_refs.length ?? 0) > 0;
  if (!compiled) return `${who} cannot approve an entry reached by free inference (no approved policy, no active fact cited); a person must approve`;
  if (adjustment < ctx.materiality_cents) return undefined;
  return `${who} cannot approve adjustment ${adjustment} at or above materiality ${ctx.materiality_cents}; a person must approve`;
}

/** P3 — the approver exists on the authority list and their limit covers the adjustment. */
export function checkP3(ctx: KernelContext, stage: KernelStage, adjustment: number): Mark {
  if (stage !== "post_gate") return postGateMark("P", "P3");
  const approval = ctx.approval;
  if (!approval) return naMark("P", "P3", "no approval to check authority against", [ctx.preparer]);
  const refs = [approval.approver_id];
  const approver = ctx.getApprover(approval.approver_id);
  if (!approver) {
    return failMark("P", "P3", `approver ${approval.approver_id} is not on the authority list`, refs);
  }
  if (approver.limit_cents < adjustment) {
    const detail = `approver ${approver.id} limit ${approver.limit_cents} < adjustment ${adjustment}`;
    return failMark("P", "P3", detail, refs);
  }
  const detail = `approver ${approver.id} (${approver.role}) limit ${approver.limit_cents} >= adjustment ${adjustment}`;
  return passMark("P", "P3", detail, refs);
}

export function processMarks(
  proposal: Proposal,
  ctx: KernelContext,
  stage: KernelStage,
  required: boolean,
  adjustment: number,
): Mark[] {
  return [
    checkP5(ctx),
    checkP9(proposal, ctx),
    checkP4(ctx),
    checkP6(proposal),
    checkP1(ctx, stage),
    checkP2(ctx, stage, required, adjustment, proposal),
    checkP3(ctx, stage, adjustment),
  ];
}
