import type { Mark, Proposal } from "../contract/types.js";
import { evaluateCondition } from "./condition.js";
import type { FactLite, KernelContext } from "./types.js";
import { isAfterAsOf, mark, naMark, passMark, verdictMark } from "./util.js";

/** J1 — every cited policy resolves, is approved, and its condition holds on this decision. */
export function checkJ1(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = proposal.policy_refs;
  if (refs.length === 0) return naMark("J", "J1", "proposal cites no policy", [proposal.intent_id]);
  const problems: string[] = [];
  for (const id of refs) {
    const policy = ctx.getPolicy(id);
    if (!policy) {
      problems.push(`policy ${id} does not resolve`);
      continue;
    }
    if (policy.status !== "approved") {
      problems.push(`policy ${id} status is ${policy.status}, not approved`);
      continue;
    }
    if (!evaluateCondition(policy.condition, ctx.features)) {
      problems.push(`policy ${id} condition does not hold on the features of this decision`);
    }
  }
  return verdictMark("J", "J1", problems, `${refs.length} cited policy(s) approved and in condition`, refs);
}

/** J2 — every cited fact resolves and is in scope for this party, kind, date and amount. */
export function checkJ2(proposal: Proposal, ctx: KernelContext, adjustment: number): Mark {
  const refs = proposal.fact_refs;
  if (refs.length === 0) return naMark("J", "J2", "proposal cites no fact", [proposal.intent_id]);
  const problems: string[] = [];
  for (const id of refs) {
    const fact = ctx.getFact(id);
    if (!fact) {
      problems.push(`fact ${id} does not resolve`);
      continue;
    }
    problems.push(...factProblems(fact, proposal, ctx, adjustment));
  }
  return verdictMark("J", "J2", problems, `${refs.length} cited fact(s) in scope for this decision`, refs);
}

function factProblems(fact: FactLite, proposal: Proposal, ctx: KernelContext, adjustment: number): string[] {
  const problems: string[] = [];
  const id = fact.id;
  if (fact.status !== "active") problems.push(`fact ${id} status is ${fact.status}, not active`);
  if (proposal.entry_date < fact.valid_from || proposal.entry_date > fact.valid_to) {
    problems.push(`fact ${id} is valid ${fact.valid_from}..${fact.valid_to}, entry_date is ${proposal.entry_date}`);
  }
  if (fact.party_id !== proposal.party_id) {
    problems.push(`fact ${id} party ${fact.party_id} != proposal party ${proposal.party_id}`);
  }
  if (fact.kinds && !fact.kinds.includes(proposal.kind)) {
    problems.push(`fact ${id} covers [${fact.kinds.join(", ")}], not ${proposal.kind}`);
  }
  if (fact.uses === "one_time" && fact.used_count !== 0) {
    problems.push(`fact ${id} is one_time and has already been used ${fact.used_count} time(s)`);
  }
  if (typeof fact.max_amount_cents === "number" && adjustment > fact.max_amount_cents) {
    problems.push(`fact ${id} caps at ${fact.max_amount_cents}, adjustment is ${adjustment}`);
  }
  if (isAfterAsOf(ctx, fact.learned_at)) {
    problems.push(`fact ${id} learned ${fact.learned_at} is after as_of ${ctx.as_of}`);
  }
  return problems;
}

/**
 * J3 — residual judgment. One mark per judgment note the agent left standing. These are not
 * machine re-performed, so they do not count towards the checkable fraction, and any of them
 * means a person has to approve.
 */
export function checkJ3(proposal: Proposal): Mark[] {
  const refs = [proposal.intent_id];
  if (proposal.judgment.length === 0) {
    return [passMark("J", "J3", "no residual judgment on this proposal", refs)];
  }
  const total = proposal.judgment.length;
  return proposal.judgment.map((item, index) =>
    mark("J", "J3", "judgment", `judgment ${index + 1}/${total} (${item.confidence} confidence): ${item.note}`, refs),
  );
}

export function judgmentMarks(
  proposal: Proposal,
  ctx: KernelContext,
  adjustment: number,
  j3: readonly Mark[],
): Mark[] {
  return [checkJ1(proposal, ctx), checkJ2(proposal, ctx, adjustment), ...j3];
}
