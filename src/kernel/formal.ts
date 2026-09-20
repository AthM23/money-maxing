import { NON_CASH_SETTLEMENT_KINDS, REDUCES_INVOICE_KINDS, type Mark, type Proposal, type ProposalKind } from "../contract/types.js";
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
  isControlAccount,
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
  const perDoc = new Map<string, number>();
  for (const app of proposal.applications) {
    if (app.amount_cents <= 0) problems.push(`application to ${app.doc_id} is ${app.amount_cents}, must be > 0`);
    perDoc.set(app.doc_id, (perDoc.get(app.doc_id) ?? 0) + app.amount_cents);
  }
  for (const [docId, total] of perDoc) {
    const doc = ctx.getDoc(docId);
    if (!doc) problems.push(`document ${docId} not found`);
    else if (total > doc.open_cents) problems.push(`applications ${total} exceed ${docId} open balance ${doc.open_cents}`);
  }
  return problems;
}

function bankProblems(proposal: Proposal, ctx: KernelContext): string[] {
  if (!proposal.bank_txn_id) {
    return proposal.kind === "apply_payment" ? ["apply_payment has no bank_txn_id: cash cannot be applied without a bank line"] : [];
  }
  const txn = ctx.getBankTxn(proposal.bank_txn_id);
  if (!txn) return [`bank transaction ${proposal.bank_txn_id} not found`];
  const problems: string[] = [];
  // Realized FX moves no cash but belongs to one receipt: it names the bank line for its rate, and spends none of it.
  if (proposal.kind === "fx_realized") return problems;
  if (NO_CASH_KINDS.has(proposal.kind)) problems.push(`kind ${proposal.kind} moves no cash and must not cite bank line ${txn.id}`);
  if (INBOUND_KINDS.has(proposal.kind) && txn.amount_cents <= 0) problems.push(`kind ${proposal.kind} needs money in, but bank line ${txn.id} is ${txn.amount_cents}`);
  if (proposal.kind === "schedule_payment" && txn.amount_cents >= 0) problems.push(`a payment out needs a debit, but bank line ${txn.id} is ${txn.amount_cents}`);
  const total = applicationsTotal(proposal);
  const spent = ctx.bankTxnAppliedCents?.(txn.id) ?? 0;
  const available = Math.abs(txn.amount_cents) - spent;
  if (total > available) problems.push(`applications ${total} exceed what is left of bank line ${txn.id}: ${available} (already applied ${spent})`);
  if (proposal.kind === "apply_payment") {
    const cashDebit = sumDebits(linesOn(proposal, ctx.control.cash_account));
    if (cashDebit !== txn.amount_cents) problems.push(`cash debit ${cashDebit} != bank amount ${txn.amount_cents} on ${txn.id}`);
    if (spent > 0) problems.push(`bank line ${txn.id} was already applied (${spent} cents)`);
  }
  return problems;
}

const INBOUND_KINDS: ReadonlySet<string> = new Set(["apply_payment", "customer_credit"]);
const NO_CASH_KINDS: ReadonlySet<string> = new Set([...NON_CASH_SETTLEMENT_KINDS, "dispute_hold", "accrual", "payroll_accrual", "amortization", "rev_recognition"]);

/** F8 — the entry has the shape its kind claims. A concession or write-off moves no cash; only a cash application does. */
export function checkF8(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [proposal.intent_id];
  const cashLines = linesOn(proposal, ctx.control.cash_account);
  const problems: string[] = [];
  if (NO_CASH_KINDS.has(proposal.kind) && cashLines.length > 0) {
    problems.push(`kind ${proposal.kind} must not touch the cash account ${ctx.control.cash_account}`);
  }
  // Said in so many words because a model that gets only F3's arithmetic back sends the same lines again.
  if (proposal.kind === "dispute_hold" && proposal.entries.length > 0) {
    problems.push("a dispute_hold posts no entry: it only marks the amount as disputed and leaves the invoice open. Send it with entries empty");
  }
  if (NON_CASH_SETTLEMENT_KINDS.includes(proposal.kind) && proposal.entries.length > 0) {
    const outside = proposal.entries.filter((l) => !isControlAccount(l.account, ctx));
    const debitOutside = sumDebits(outside);
    const applied = applicationsTotal(proposal);
    if (debitOutside !== applied) problems.push(`${proposal.kind} debits ${debitOutside} outside the control accounts but applies ${applied}`);
  }
  return verdictMark("F", "F8", problems, `entry shape fits kind ${proposal.kind}`, refs);
}

/** GL movement on the AR control account, as a receivable (debit increases it). */
export function arGlDelta(proposal: Proposal, ctx: KernelContext): number {
  return linesOn(proposal, ctx.control.ar_account).reduce((sum, l) => sum + l.debit_cents - l.credit_cents, 0);
}

/** GL movement on the AP control account, stated as a positive liability (credit increases it). */
export function apGlDelta(proposal: Proposal, ctx: KernelContext): number {
  return linesOn(proposal, ctx.control.ap_account).reduce((sum, l) => sum + l.credit_cents - l.debit_cents, 0);
}

/**
 * Kinds that actually retire receivable. dispute_hold is deliberately not one of them: it only
 * marks an invoice as disputed, posts no entry, and leaves the balance where it was.
 */
const AR_REDUCING_KINDS: readonly ProposalKind[] = REDUCES_INVOICE_KINDS;

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
  return [checkF1(proposal), checkF2(proposal, ctx), checkF3(proposal, ctx), checkF7(proposal), checkF8(proposal, ctx)];
}
