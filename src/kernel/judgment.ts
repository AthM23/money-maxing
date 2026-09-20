import { NON_CASH_SETTLEMENT_KINDS, type Mark, type Proposal } from "../contract/types.js";
import { evaluateCondition } from "./condition.js";
import type { FactLite, KernelContext, PolicyLite } from "./types.js";
import { isAfterAsOf, isControlAccount, mark, naMark, passMark, verdictMark } from "./util.js";

/**
 * J1 — every cited policy resolves, is approved, its condition holds on this decision, AND it is a rule for this
 * entry: same function, same kind, and the judgment amount lands on the rule's account. Citing a valid rule that
 * says something else (a bank-fee rule stapled to a revenue concession) is not cover, it is a wrong citation.
 */
export function checkJ1(proposal: Proposal, ctx: KernelContext, adjustment = 0): Mark {
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
    problems.push(...actionProblems(policy, proposal, ctx));
  }
  // The condition was tested on the case's shortfall. An entry for more than that is not what the rule was shown.
  const tested = ctx.features.shortfall_cents;
  if (typeof tested === "number" && adjustment > tested) problems.push(`the entry adjusts ${adjustment}, the cited rule was tested on a shortfall of ${tested}`);
  return verdictMark("J", "J1", problems, `${refs.length} cited policy(s) approved and in condition`, refs);
}

function actionProblems(policy: PolicyLite, proposal: Proposal, ctx: KernelContext): string[] {
  if (!policy.action) return [`policy ${policy.id} has no readable action, so it cannot cover any entry`];
  const problems: string[] = [];
  if (policy.function !== proposal.function) problems.push(`policy ${policy.id} is a rule for ${policy.function}, the entry is ${proposal.function}`);
  if (policy.action.kind !== proposal.kind) problems.push(`policy ${policy.id} books ${policy.action.kind}, the entry is ${proposal.kind}`);
  const wrong = proposal.entries.filter((l) => !isControlAccount(l.account, ctx) && l.account !== policy.action?.account).map((l) => l.account);
  if (wrong.length > 0) problems.push(`policy ${policy.id} books to ${policy.action.account}, the entry uses ${[...new Set(wrong)].join(", ")}`);
  return problems;
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
  // A cash application adjusts nothing, so its size is the cash: a fact that says who pays for whom is capped on that.
  const exposure = proposal.kind === "apply_payment" ? proposal.applications.reduce((n, a) => n + a.amount_cents, 0) : adjustment;
  if (typeof fact.max_amount_cents === "number" && exposure > fact.max_amount_cents) {
    problems.push(`fact ${id} caps at ${fact.max_amount_cents}, ${proposal.kind === "apply_payment" ? "the cash applied" : "adjustment"} is ${exposure}`);
  }
  if (isAfterAsOf(ctx, fact.learned_at)) {
    problems.push(`fact ${id} learned ${fact.learned_at} is after as_of ${ctx.as_of}`);
  }
  if (NON_CASH_SETTLEMENT_KINDS.includes(proposal.kind)) {
    // An agent may file what it learned as a note ("the contract caps credits at 2%"). A note that carries a number is
    // still a note: only a fact stated as a rate or an amount the customer is entitled to can size an entry.
    if (fact.predicate === "other") problems.push(`fact ${id} is a note (predicate "other"), not a rate or an amount: it cannot size an entry`);
    const value = fact.value ?? {};
    const pct = value[proposal.kind === "tax_withholding" ? "pct_withheld" : "pct_off"];
    const docs = [...new Set(proposal.applications.map(a => a.doc_id))].map(id => ctx.getDoc(id));
    const basis = docs.length > 0 && docs.every(Boolean) ? docs.reduce((n, d) => n + d!.total_cents, 0) : null;
    const amount = typeof pct === "number" && Number.isFinite(pct) && pct >= 0 && pct <= 100 && basis !== null
      ? Math.round(basis * pct / 100)
      : Number.isSafeInteger(value.amount_cents) ? value.amount_cents : null;
    if (amount !== adjustment) problems.push(`fact ${id} explains ${amount ?? "no verifiable amount"} cents, entry adjusts ${adjustment}`);
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

/** J4 — the judgment amount lands on an account the chart-of-accounts policy permits for this kind of entry. */
export function checkJ4(proposal: Proposal, ctx: KernelContext): Mark {
  const allowed = ctx.allowedAccounts?.(proposal.kind) ?? [];
  const refs = [proposal.intent_id];
  if (allowed.length === 0) return naMark("J", "J4", `no account policy for kind ${proposal.kind}`, refs);
  const wrong = proposal.entries.filter((l) => !isControlAccount(l.account, ctx) && !allowed.includes(l.account)).map((l) => l.account);
  const problems = wrong.length > 0 ? [`kind ${proposal.kind} may post to ${allowed.join(", ")}; found ${[...new Set(wrong)].join(", ")}`] : [];
  return verdictMark("J", "J4", problems, `accounts permitted for kind ${proposal.kind}`, refs);
}

export function judgmentMarks(
  proposal: Proposal,
  ctx: KernelContext,
  adjustment: number,
  j3: readonly Mark[],
): Mark[] {
  return [checkJ1(proposal, ctx, adjustment), checkJ2(proposal, ctx, adjustment), checkJ4(proposal, ctx), ...j3];
}
