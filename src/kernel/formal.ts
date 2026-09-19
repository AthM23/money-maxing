import type { Mark, Proposal, ProposalKind } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import {
  appliedToDocKind,
  applicationsTotal,
  failMark,
  linesOn,
  naMark,
  sumCredits,
  sumDebits,
  verdictMark,
} from "./util.js";

/** Kinds that legitimately post no entry lines. Anything else with no lines is unfooted. */
const NO_ENTRY_KINDS: readonly ProposalKind[] = [
  "no_action",
  "dispute_hold",
  "hold_bill",
  "forecast_artifact",
  "report_artifact",
];

/** F1 — footed: debits equal credits over the entry. */
export function checkF1(proposal: Proposal): Mark {
  const refs = [proposal.intent_id];
  if (proposal.entries.length === 0) {
    if (NO_ENTRY_KINDS.includes(proposal.kind)) {
      return naMark("F", "F1", `kind ${proposal.kind} posts no entry lines`, refs);
    }
    return failMark("F", "F1", `kind ${proposal.kind} must post entry lines, found 0`, refs);
  }
  const debits = sumDebits(proposal.entries);
  const credits = sumCredits(proposal.entries);
  const shape = `over ${proposal.entries.length} line(s)`;
  if (debits !== credits) {
    return failMark("F", "F1", `debits ${debits} != credits ${credits} ${shape}`, refs);
  }
  return verdictMark("F", "F1", [], `debits ${debits} = credits ${credits} ${shape}`, refs);
}

/** F2 — applications fit the documents and the bank transaction they claim. */
export function checkF2(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [...proposal.applications.map((app) => app.doc_id), ...(proposal.bank_txn_id ? [proposal.bank_txn_id] : [])];
  if (refs.length === 0) return naMark("F", "F2", "no applications and no bank transaction", [proposal.intent_id]);
  const problems = [...applicationProblems(proposal, ctx), ...bankProblems(proposal, ctx)];
  const total = applicationsTotal(proposal);
  return verdictMark("F", "F2", problems, `${proposal.applications.length} application(s) totalling ${total} fit`, refs);
}

function applicationProblems(proposal: Proposal, ctx: KernelContext): string[] {
  const problems: string[] = [];
  for (const app of proposal.applications) {
    if (app.amount_cents <= 0) problems.push(`application to ${app.doc_id} is ${app.amount_cents}, must be > 0`);
    const doc = ctx.getDoc(app.doc_id);
    if (!doc) {
      problems.push(`document ${app.doc_id} not found`);
      continue;
    }
    if (app.amount_cents > doc.open_cents) {
      problems.push(`application ${app.amount_cents} exceeds ${app.doc_id} open balance ${doc.open_cents}`);
    }
  }
  return problems;
}

function bankProblems(proposal: Proposal, ctx: KernelContext): string[] {
  if (!proposal.bank_txn_id) return [];
  const txn = ctx.getBankTxn(proposal.bank_txn_id);
  if (!txn) return [`bank transaction ${proposal.bank_txn_id} not found`];
  const problems: string[] = [];
  const total = applicationsTotal(proposal);
  const available = Math.abs(txn.amount_cents);
  if (total > available) problems.push(`applications ${total} exceed bank amount ${available}`);
  if (proposal.kind === "apply_payment") {
    const cashDebit = sumDebits(linesOn(proposal, ctx.control.cash_account));
    if (cashDebit !== txn.amount_cents) {
      problems.push(`cash debit ${cashDebit} != bank amount ${txn.amount_cents} on ${txn.id}`);
    }
  }
  return problems;
}

/** GL movement on the AR control account, as a receivable (debit increases it). */
export function arGlDelta(proposal: Proposal, ctx: KernelContext): number {
  return linesOn(proposal, ctx.control.ar_account).reduce((sum, l) => sum + l.debit_cents - l.credit_cents, 0);
}

/** GL movement on the AP control account, stated as a positive liability (credit increases it). */
export function apGlDelta(proposal: Proposal, ctx: KernelContext): number {
  return linesOn(proposal, ctx.control.ap_account).reduce((sum, l) => sum + l.credit_cents - l.debit_cents, 0);
}

const AR_REDUCING_KINDS: readonly ProposalKind[] = ["apply_payment", "credit_memo", "write_off", "dispute_hold"];

/** What the same proposal does to the subledgers, derived from its applications, not from its entry. */
export function subledgerDeltas(proposal: Proposal, ctx: KernelContext): { ar: number; ap: number } {
  if (AR_REDUCING_KINDS.includes(proposal.kind)) {
    return { ar: -appliedToDocKind(proposal, ctx, "invoice"), ap: 0 };
  }
  if (proposal.kind === "schedule_payment") return { ar: 0, ap: -appliedToDocKind(proposal, ctx, "bill") };
  if (proposal.kind === "approve_bill") return { ar: 0, ap: appliedToDocKind(proposal, ctx, "bill") };
  return { ar: 0, ap: 0 };
}

/** F3 — control accounts stay tied to their subledgers across the proposal. */
export function checkF3(proposal: Proposal, ctx: KernelContext): Mark {
  const c = ctx.control;
  const refs = [c.ar_account, c.ap_account];
  if (c.ar_gl_cents !== c.ar_subledger_cents || c.ap_gl_cents !== c.ap_subledger_cents) {
    const detail =
      `control accounts were not tied before the proposal: ` +
      `AR gl ${c.ar_gl_cents} vs subledger ${c.ar_subledger_cents}, ` +
      `AP gl ${c.ap_gl_cents} vs subledger ${c.ap_subledger_cents}`;
    return failMark("F", "F3", detail, refs);
  }
  const sub = subledgerDeltas(proposal, ctx);
  const ar = { gl: c.ar_gl_cents + arGlDelta(proposal, ctx), sub: c.ar_subledger_cents + sub.ar };
  const ap = { gl: c.ap_gl_cents + apGlDelta(proposal, ctx), sub: c.ap_subledger_cents + sub.ap };
  const problems: string[] = [];
  if (ar.gl !== ar.sub) problems.push(`AR gl ${ar.gl} != subledger ${ar.sub} after the proposal`);
  if (ap.gl !== ap.sub) problems.push(`AP gl ${ap.gl} != subledger ${ap.sub} after the proposal`);
  const ok = `AR ${ar.gl} = ${ar.sub} and AP ${ap.gl} = ${ap.sub} after the proposal`;
  return verdictMark("F", "F3", problems, ok, refs);
}

/** F7 — integer cents. A float on a money path is a bug; it is never rounded away. */
export function checkF7(proposal: Proposal): Mark {
  const problems: string[] = [];
  for (const app of proposal.applications) {
    if (!Number.isSafeInteger(app.amount_cents)) {
      problems.push(`application to ${app.doc_id} is ${app.amount_cents}, not a safe integer of cents`);
    }
  }
  problems.push(...entryAmountProblems(proposal));
  const count = proposal.applications.length + proposal.entries.length * 2;
  return verdictMark("F", "F7", problems, `all ${count} amount(s) are safe integers of cents`, [proposal.intent_id]);
}

function entryAmountProblems(proposal: Proposal): string[] {
  const problems: string[] = [];
  proposal.entries.forEach((line, index) => {
    if (!Number.isSafeInteger(line.debit_cents)) {
      problems.push(`line ${index} ${line.account} debit ${line.debit_cents} is not a safe integer of cents`);
    }
    if (!Number.isSafeInteger(line.credit_cents)) {
      problems.push(`line ${index} ${line.account} credit ${line.credit_cents} is not a safe integer of cents`);
    }
  });
  return problems;
}

export function formalMarks(proposal: Proposal, ctx: KernelContext): Mark[] {
  return [checkF1(proposal), checkF2(proposal, ctx), checkF3(proposal, ctx), checkF7(proposal)];
}
