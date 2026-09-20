import type { Mark, Proposal } from "../contract/types.js";
import { remittanceProvenanceProblems, parseRemittance } from "../contract/remittance.js";
import type { BankTxnLite, KernelContext, TraceLite } from "./types.js";
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
    if (trace.superseded_by) problems.push(`trace ${trace.id} was superseded by ${trace.superseded_by}; re-investigate the current evidence`);
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
  return [checkE1(proposal, ctx), checkE2(proposal, ctx), checkE3(proposal, ctx), checkE5(proposal, ctx),
    ...(proposal.remittance_trace_id ? [checkRemittance(proposal, ctx)] : [])];
}

/** Re-extract the instructions independently of the router; a correct total cannot hide wrong allocations. */
function checkRemittance(proposal: Proposal, ctx: KernelContext): Mark {
  const id = proposal.remittance_trace_id!;
  const trace = ctx.getTrace(id);
  const remit = trace ? parseRemittance(trace.payload_text) : null;
  const bank = proposal.bank_txn_id ? ctx.getBankTxn(proposal.bank_txn_id) : undefined;
  const problems: string[] = [];
  if (!trace || trace.superseded_by || isAfterAsOf(ctx, trace.recorded_time) || trace.party_id !== proposal.party_id) problems.push("remittance source is missing, stale, outside the replay window or belongs to another party");
  if (!proposal.evidence.some(e => e.trace_id === id)) problems.push("remittance must be cited in the workpaper");
  if (trace && !remit) return freeFormRemittance(proposal, trace, bank, problems);
  if (proposal.kind !== "apply_payment" || !remit || !bank || remit.amount_cents !== bank.amount_cents || remit.date !== bank.posted_date
    || !bank.descriptor?.split(/[^A-Za-z0-9-]+/).includes(remit.reference)) problems.push("remittance reference, date and total must agree to the bank receipt");
  const sorted = (apps: Proposal["applications"]) => JSON.stringify([...apps].sort((a, b) => a.doc_id.localeCompare(b.doc_id)));
  if (!remit || sorted(remit.applications) !== sorted(proposal.applications)) problems.push("per-invoice allocations differ from the remittance");
  return verdictMark("E", "E_REMIT", problems, "remittance source, bank reference, total and every invoice allocation agree", [id]);
}

/** A remittance advice travels with its payment: up to ten days ahead of the bank line, or a few days behind it. */
const REMIT_DAYS_BEFORE = 10;
const REMIT_DAYS_AFTER = 3;
const DAY_MS = 86_400_000;

/**
 * A remittance written as ordinary mail cannot be re-parsed by rule, so whoever read it (a small model, usually) is
 * not believed either. The allocation is checked against the customer's own words instead: every invoice named,
 * each amount next to its invoice, the receipt total stated, and the allocations footing to the bank line. Ordinary
 * mail carries no bank reference, so what ties it to this receipt is the customer, the total to the cent and the date.
 */
function freeFormRemittance(proposal: Proposal, trace: TraceLite, bank: BankTxnLite | undefined, problems: string[]): Mark {
  if (proposal.kind !== "apply_payment" || !bank) problems.push("a remittance can only direct a cash application against a bank receipt");
  else {
    const days = (Date.parse(trace.recorded_time) - Date.parse(`${bank.posted_date}T00:00:00Z`)) / DAY_MS;
    if (!(days >= -REMIT_DAYS_BEFORE && days <= REMIT_DAYS_AFTER + 1)) problems.push(`the remittance is dated ${trace.recorded_time.slice(0, 10)}, the receipt ${bank.posted_date}: too far apart to be the same payment`);
    problems.push(...remittanceProvenanceProblems(trace.payload_text, proposal.applications, bank.amount_cents));
  }
  return verdictMark("E", "E_REMIT", problems, "free-form remittance: every invoice and amount agrees to the customer's own words and foots to the receipt", [trace.id]);
}
