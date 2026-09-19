import type { BlockRule, KernelStage, Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { applicationsTotal, failMark } from "./util.js";

export interface TriggeredRule {
  rule: BlockRule;
  mark: Mark;
}

/** A rule returns the detail that fired it, or undefined when it did not fire. */
type RuleProbe = (proposal: Proposal, ctx: KernelContext, stage: KernelStage, adjustment: number) => string | undefined;

/** H1 — the same vendor and amount has already been paid on another document. */
const h1: RuleProbe = (proposal, ctx) => {
  if (proposal.kind !== "schedule_payment" || !ctx.findPaidDuplicate) return undefined;
  const amount = applicationsTotal(proposal);
  const hit = ctx.findPaidDuplicate(proposal.party_id, amount, proposal.applications.map((app) => app.doc_id));
  if (!hit) return undefined;
  return `document ${hit.doc_id} already pays ${amount} to ${proposal.party_id}`;
};

/** H2 — segregation of duties: the person who prepared it cannot be the one who approved it. */
const h2: RuleProbe = (_proposal, ctx) => {
  const approval = ctx.approval;
  if (!approval || approval.approver_id !== ctx.preparer) return undefined;
  return `preparer ${ctx.preparer} also approved this decision`;
};

/** H3 — a locked period does not accept a posting, approved or not. */
const h3: RuleProbe = (_proposal, ctx) =>
  ctx.period.status === "locked" ? `period ${ctx.period.id} is locked` : undefined;

/** H4 — the cited rule itself caps below what this proposal moves. */
const h4: RuleProbe = (proposal, ctx, _stage, adjustment) => {
  const caps: string[] = [];
  for (const id of proposal.fact_refs) {
    const cap = ctx.getFact(id)?.max_amount_cents;
    if (typeof cap === "number" && cap < adjustment) caps.push(`fact ${id} caps at ${cap}`);
  }
  for (const id of proposal.policy_refs) {
    const cap = ctx.getPolicy(id)?.max_amount_cents;
    if (typeof cap === "number" && cap < adjustment) caps.push(`policy ${id} caps at ${cap}`);
  }
  if (caps.length === 0) return undefined;
  return `${caps.join("; ")}, but the adjustment is ${adjustment}`;
};

/** H5 — remit-to details changed and nobody confirmed them out of band. */
const h5: RuleProbe = (proposal, ctx) => {
  if (proposal.kind !== "schedule_payment" || !ctx.remitChangedUnverified) return undefined;
  if (!ctx.remitChangedUnverified(proposal.party_id)) return undefined;
  return `remit-to details for ${proposal.party_id} changed with no out-of-band confirmation on record`;
};

/** H6 — the approver signed over their own limit. */
const h6: RuleProbe = (_proposal, ctx, stage, adjustment) => {
  if (stage !== "post_gate") return undefined;
  const approval = ctx.approval;
  if (!approval) return undefined;
  const approver = ctx.getApprover(approval.approver_id);
  if (!approver || approver.limit_cents >= adjustment) return undefined;
  return `approver ${approver.id} limit ${approver.limit_cents} < adjustment ${adjustment}`;
};

/** Evaluated in order. The first one to fire names the block. */
const RULES: ReadonlyArray<{ rule: BlockRule; probe: RuleProbe }> = [
  { rule: "DUPLICATE_PAYMENT", probe: h1 },
  { rule: "PREPARER_EQUALS_APPROVER", probe: h2 },
  { rule: "PERIOD_LOCKED", probe: h3 },
  { rule: "RULE_ABOVE_APPROVER_AUTHORITY", probe: h4 },
  { rule: "BANK_DETAILS_CHANGED", probe: h5 },
  { rule: "OVER_APPROVER_LIMIT", probe: h6 },
];

/**
 * Hard rules that hold in both stages and even when a human approved. Every rule is
 * evaluated so the workpaper shows all of them; the first to fire sets the block.
 */
export function evaluateBlockRules(
  proposal: Proposal,
  ctx: KernelContext,
  stage: KernelStage,
  adjustment: number,
): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];
  for (const { rule, probe } of RULES) {
    const detail = probe(proposal, ctx, stage, adjustment);
    if (detail === undefined) continue;
    triggered.push({ rule, mark: failMark("P", rule, detail, [proposal.intent_id, proposal.party_id]) });
  }
  return triggered;
}
