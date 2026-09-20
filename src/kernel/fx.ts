import type { Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { isControlAccount, sumDebits, verdictMark } from "./util.js";

const PPM = 1_000_000;

/** The USD lost (positive) or gained (negative) because the cash settled at a different rate from the booking. */
export function realizedFxCents(foreignAmountCents: number, bookedRatePpm: number, settledRatePpm: number): number {
  return Math.round((foreignAmountCents * (bookedRatePpm - settledRatePpm)) / PPM);
}

/** A rate as banks print it: four decimals. */
const rateText = (ppm: number): string => (ppm / PPM).toFixed(4);
const amountText = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * F9 — realized FX is arithmetic, so it is re-performed, not believed: the foreign amount of the receipt times the
 * difference between the invoice's booked rate and the bank's settlement rate, from the two FX records, with the
 * bank's own advice cited and stating that amount and that rate. One receipt realizes FX once. Only a loss is
 * supported: a gain would increase the receivable, which this ledger's posting does not do yet.
 */
export function checkFxRealized(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [proposal.bank_txn_id ?? "no bank line", ...proposal.applications.map((a) => a.doc_id)];
  const problems: string[] = [];
  const app = proposal.applications.length === 1 ? proposal.applications[0] : undefined;
  const bankFx = proposal.bank_txn_id ? ctx.getBankFx?.(proposal.bank_txn_id) : undefined;
  const docFx = app ? ctx.getDocFx?.(app.doc_id) : undefined;
  if (!app) problems.push("realized FX settles exactly one invoice");
  if (!bankFx) problems.push("the receipt has no foreign-currency record");
  if (app && !docFx) problems.push(`${app.doc_id} has no foreign-currency record`);
  if (!app || !bankFx || !docFx) return verdictMark("F", "F9", problems, "", refs);

  if (bankFx.currency !== docFx.currency) problems.push(`the receipt is in ${bankFx.currency}, the invoice in ${docFx.currency}`);
  // The booked rate comes from the invoice, so which invoice is cited decides the answer: it has to be the one this
  // receipt's cash was applied to, and a receipt cannot settle more foreign currency than the invoice was for.
  const paid = proposal.bank_txn_id ? ctx.bankTxnAppliedDocs?.(proposal.bank_txn_id) : undefined;
  if (paid && !paid.includes(app.doc_id)) problems.push(`the receipt's cash has not been applied to ${app.doc_id}`);
  if (bankFx.foreign_amount_cents > docFx.foreign_total_cents) problems.push(`the receipt is ${bankFx.currency} ${amountText(bankFx.foreign_amount_cents)}, more than the invoice's ${amountText(docFx.foreign_total_cents)}`);
  const expected = realizedFxCents(bankFx.foreign_amount_cents, docFx.booked_rate_ppm, bankFx.rate_ppm);
  if (expected <= 0) problems.push(`the rates give ${expected}: only a realized loss can be booked this way`);
  if (app.amount_cents !== expected) problems.push(`the entry books ${app.amount_cents}, the rates give ${expected}`);
  const outside = sumDebits(proposal.entries.filter((l) => !isControlAccount(l.account, ctx)));
  if (outside !== expected) problems.push(`the entry debits ${outside} outside the control accounts, the rates give ${expected}`);
  if ((ctx.fxRealizedCents?.(proposal.bank_txn_id ?? "") ?? 0) > 0) problems.push("realized FX was already booked for this receipt");
  problems.push(...adviceProblems(proposal, ctx, bankFx.advice_trace_id, bankFx.foreign_amount_cents, bankFx.rate_ppm));
  const ok = `${bankFx.currency} ${amountText(bankFx.foreign_amount_cents)} × (${rateText(docFx.booked_rate_ppm)} − ${rateText(bankFx.rate_ppm)}) = ${expected}, agreed to the bank's advice`;
  return verdictMark("F", "F9", problems, ok, refs);
}

/** The numbers have to be the bank's, in the bank's words: the advice is cited, current, and states the amount and the rate. */
function adviceProblems(proposal: Proposal, ctx: KernelContext, adviceId: string | null, foreignCents: number, ratePpm: number): string[] {
  if (!adviceId) return ["the receipt's foreign-currency record names no bank advice"];
  const trace = ctx.getTrace(adviceId);
  if (!trace) return [`bank advice ${adviceId} does not resolve`];
  const problems: string[] = [];
  if (!proposal.evidence.some((e) => e.trace_id === adviceId)) problems.push(`bank advice ${adviceId} must be cited in the workpaper`);
  if (!states(trace.payload_text, amountText(foreignCents))) problems.push(`bank advice ${adviceId} does not state ${amountText(foreignCents)}`);
  if (!states(trace.payload_text, rateText(ratePpm))) problems.push(`bank advice ${adviceId} does not state the rate ${rateText(ratePpm)}`);
  return problems;
}

/** The figure as a whole number of its own: "98,000.00" is not stated by "198,000.00", nor "1.0800" by "11.0800". */
function states(text: string, figure: string): boolean {
  const escaped = figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.,])${escaped}(?!\\d)`).test(text);
}
