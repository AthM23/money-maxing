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
 * A standing fact can say that ONE named payer pays for this party (a parent company, a payment agent).
 * It opens the door for that payer's bank line only. Documents must always belong to the proposal's party.
 */
function aliasedPayer(proposal: Proposal, ctx: KernelContext, payerPartyId: string): string | undefined {
  for (const id of proposal.fact_refs) {
    const fact = ctx.getFact(id);
    if (!fact || fact.status !== "active" || fact.party_id !== proposal.party_id) continue;
    if (fact.predicate !== "payer_alias" && fact.predicate !== "parent_pays") continue;
    if (fact.value?.payer_party_id === payerPartyId) return fact.id;
  }
  return undefined;
}

/** E3 — the documents belong to the party the proposal names, and so does the bank line unless a fact names its payer. */
export function checkE3(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [...proposal.applications.map((a) => a.doc_id), ...(proposal.bank_txn_id ? [proposal.bank_txn_id] : [])];
  if (refs.length === 0) return naMark("E", "E3", "nothing to tie to a party", [proposal.intent_id]);
  const problems = partyProblems(proposal, ctx);
  return verdictMark("E", "E3", problems, `${refs.length} reference(s) tie to ${proposal.party_id}`, refs);
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
  if (txn?.party_id && txn.party_id !== proposal.party_id && !aliasedPayer(proposal, ctx, txn.party_id)) {
    problems.push(`bank transaction ${txn.id} party ${txn.party_id} != proposal party ${proposal.party_id}, and no active fact names it as the payer`);
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
  const covered = proposal.policy_refs.length > 0 || proposal.fact_refs.length > 0;
  const onPoint = proposal.evidence.filter((e) => Boolean(e.quote) && aboutThisParty(ctx.getTrace(e.trace_id)?.party_id, proposal.party_id));
  if (!covered && onPoint.length === 0) {
    const detail = `${accounts.join(", ")}: no quoted evidence from a source about ${proposal.party_id}, and no policy or fact cited`;
    return failMark("E", "E5", detail, accounts);
  }
  const ok = covered
    ? `judgment on ${accounts.join(", ")} rests on cited policy or fact (checked at J1/J2) with ${proposal.evidence.length} evidence item(s)`
    : `judgment on ${accounts.join(", ")} rests on ${onPoint.length} quoted source(s) about ${proposal.party_id}`;
  return verdictMark("E", "E5", [], ok, accounts);
}

/** A source counts for a party if it is filed under that party, or under nobody (a company-wide memo). */
function aboutThisParty(tracePartyId: string | null | undefined, partyId: string): boolean {
  return tracePartyId === partyId || tracePartyId === null || tracePartyId === undefined;
}

export function evidenceMarks(proposal: Proposal, ctx: KernelContext): Mark[] {
  return [checkE1(proposal, ctx), checkE2(proposal, ctx), checkE3(proposal, ctx), checkE5(proposal, ctx)];
}
