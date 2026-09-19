import type { Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { failMark, isAfterAsOf, isControlAccount, naMark, normalizeWs, truncate, verdictMark } from "./util.js";

/** E1 — every cited trace resolves, and in replay nothing recorded after as_of may be cited. */
export function checkE1(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = proposal.evidence.map((item) => item.trace_id);
  if (refs.length === 0) return naMark("E", "E1", "proposal cites no evidence", [proposal.intent_id]);
  const problems: string[] = [];
  for (const item of proposal.evidence) {
    const trace = ctx.getTrace(item.trace_id);
    if (!trace) {
      problems.push(`trace ${item.trace_id} does not resolve`);
      continue;
    }
    if (isAfterAsOf(ctx, trace.recorded_time)) {
      problems.push(`trace ${trace.id} recorded ${trace.recorded_time} is after as_of ${ctx.as_of}`);
    }
  }
  return verdictMark("E", "E1", problems, `${refs.length} cited trace(s) resolve within the replay window`, refs);
}

/** E2 — every quote is a whitespace-normalised, case-sensitive substring of its trace payload. */
export function checkE2(proposal: Proposal, ctx: KernelContext): Mark {
  const quoted = proposal.evidence.filter((item) => item.quote !== undefined);
  const refs = quoted.map((item) => item.trace_id);
  if (quoted.length === 0) return naMark("E", "E2", "no evidence carries a quote", [proposal.intent_id]);
  const problems: string[] = [];
  for (const item of quoted) {
    const trace = ctx.getTrace(item.trace_id);
    if (!trace) {
      problems.push(`trace ${item.trace_id} does not resolve, so its quote cannot be agreed`);
      continue;
    }
    const needle = normalizeWs(item.quote ?? "");
    if (!normalizeWs(trace.payload_text).includes(needle)) {
      problems.push(`quote "${truncate(needle)}" is not in trace ${trace.id} payload (${trace.payload_text.length} chars)`);
    }
  }
  return verdictMark("E", "E2", problems, `${quoted.length} quote(s) agreed to source text`, refs);
}

/**
 * A standing fact can say that a different party pays for this one. Only an ACTIVE
 * payer_alias or parent_pays fact for this party opens that door.
 */
function aliasAllowed(proposal: Proposal, ctx: KernelContext): string | undefined {
  for (const id of proposal.fact_refs) {
    const fact = ctx.getFact(id);
    if (!fact || fact.status !== "active" || fact.party_id !== proposal.party_id) continue;
    if (fact.predicate === "payer_alias" || fact.predicate === "parent_pays") return fact.id;
  }
  return undefined;
}

/** E3 — the documents and the bank line belong to the party the proposal names. */
export function checkE3(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [...proposal.applications.map((a) => a.doc_id), ...(proposal.bank_txn_id ? [proposal.bank_txn_id] : [])];
  if (refs.length === 0) return naMark("E", "E3", "nothing to tie to a party", [proposal.intent_id]);
  const alias = aliasAllowed(proposal, ctx);
  const problems = alias === undefined ? partyProblems(proposal, ctx) : [];
  const ok = alias === undefined
    ? `${refs.length} reference(s) belong to ${proposal.party_id}`
    : `party mismatches permitted by active fact ${alias} for ${proposal.party_id}`;
  return verdictMark("E", "E3", problems, ok, refs);
}

function partyProblems(proposal: Proposal, ctx: KernelContext): string[] {
  const problems: string[] = [];
  for (const app of proposal.applications) {
    const doc = ctx.getDoc(app.doc_id);
    if (!doc) continue; // F2 reports the missing document; E3 does not double-report it.
    if (doc.party_id !== proposal.party_id) {
      problems.push(`document ${doc.id} party ${doc.party_id} != proposal party ${proposal.party_id}`);
    }
  }
  if (!proposal.bank_txn_id) return problems;
  const txn = ctx.getBankTxn(proposal.bank_txn_id);
  if (txn?.party_id && txn.party_id !== proposal.party_id) {
    problems.push(`bank transaction ${txn.id} party ${txn.party_id} != proposal party ${proposal.party_id}`);
  }
  return problems;
}

/** E5 — an account outside the routine set for this kind is a judgment, and needs evidence. */
export function checkE5(proposal: Proposal, ctx: KernelContext): Mark {
  const standard = new Set(ctx.standardAccounts(proposal.kind));
  const nonStandard = proposal.entries.filter(
    (line) => !standard.has(line.account) && !isControlAccount(line.account, ctx),
  );
  if (nonStandard.length === 0) {
    return naMark("E", "E5", "every line is a control or standard account for this kind", [proposal.intent_id]);
  }
  const accounts = [...new Set(nonStandard.map((line) => line.account))];
  if (proposal.evidence.length === 0) {
    const detail = `${nonStandard.length} non-standard line(s) on ${accounts.join(", ")} with 0 evidence items`;
    return failMark("E", "E5", detail, accounts);
  }
  const ok = `${nonStandard.length} non-standard line(s) on ${accounts.join(", ")} carry ${proposal.evidence.length} evidence item(s)`;
  return verdictMark("E", "E5", [], ok, accounts);
}

export function evidenceMarks(proposal: Proposal, ctx: KernelContext): Mark[] {
  return [checkE1(proposal, ctx), checkE2(proposal, ctx), checkE3(proposal, ctx), checkE5(proposal, ctx)];
}
