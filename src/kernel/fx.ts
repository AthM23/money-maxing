import type { Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { isControlAccount, normalizeWs, statesFigure, sumDebits, verdictMark } from "./util.js";

const PPM = 1_000_000;

/** The USD lost (positive) or gained (negative) because the cash settled at a different rate from the booking. */
export function realizedFxCents(foreignAmountCents: number, bookedRatePpm: number, settledRatePpm: number): number {
  return Math.round((foreignAmountCents * (bookedRatePpm - settledRatePpm)) / PPM);
}

/** Foreign cents at a rate in parts per million, rounded half up, in integers throughout: what the bank credited before its fee. */
export function convertedCents(foreignAmountCents: number, ratePpm: number): number {
  return Number((BigInt(foreignAmountCents) * BigInt(ratePpm) + 500_000n) / BigInt(PPM));
}

/** A rate as banks print it: four decimals. */
const rateText = (ppm: number): string => (ppm / PPM).toFixed(4);
const amountText = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * F9 — realized FX is arithmetic, so it is re-performed, not believed: the foreign amount of the receipt times the
 * difference between the invoice's booked rate and the bank's settlement rate, from the two FX records, with the
 * bank's own advice cited and stating that amount and that rate. The foreign-currency record itself has to tie to the
 * bank line (foreign amount at the settlement rate, less the bank's fee, is the cash that arrived), so a record nobody
 * checked cannot drive the arithmetic. One receipt realizes FX once. Only a loss is supported: a gain would increase
 * the receivable, which this ledger's posting does not do yet.
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
  const bank = proposal.bank_txn_id ? ctx.getBankTxn(proposal.bank_txn_id) : undefined;
  const credited = convertedCents(bankFx.foreign_amount_cents, bankFx.rate_ppm) - bankFx.fee_cents;
  if (!bank || credited !== bank.amount_cents) {
    problems.push(`${bankFx.currency} ${amountText(bankFx.foreign_amount_cents)} at ${rateText(bankFx.rate_ppm)} less a fee of ${amountText(bankFx.fee_cents)} is ${credited}, the bank line is ${bank?.amount_cents ?? "missing"}`);
  }
  if (bankFx.foreign_amount_cents > docFx.foreign_total_cents) problems.push(`the receipt is ${bankFx.currency} ${amountText(bankFx.foreign_amount_cents)}, more than the invoice's ${amountText(docFx.foreign_total_cents)}`);
  const expected = realizedFxCents(bankFx.foreign_amount_cents, docFx.booked_rate_ppm, bankFx.rate_ppm);
  if (expected <= 0) problems.push(`the rates give ${expected}: only a realized loss can be booked this way`);
  if (app.amount_cents !== expected) problems.push(`the entry books ${app.amount_cents}, the rates give ${expected}`);
  const outside = sumDebits(proposal.entries.filter((l) => !isControlAccount(l.account, ctx)));
  if (outside !== expected) problems.push(`the entry debits ${outside} outside the control accounts, the rates give ${expected}`);
  if ((ctx.fxRealizedCents?.(proposal.bank_txn_id ?? "") ?? 0) > 0) problems.push("realized FX was already booked for this receipt");
  problems.push(...adviceProblems(proposal, ctx, bankFx.advice_trace_id, bankFx.currency, bankFx.foreign_amount_cents, bankFx.rate_ppm));
  const ok = `${bankFx.currency} ${amountText(bankFx.foreign_amount_cents)} × (${rateText(docFx.booked_rate_ppm)} − ${rateText(bankFx.rate_ppm)}) = ${expected}, agreed to the bank's advice`;
  return verdictMark("F", "F9", problems, ok, refs);
}

/**
 * F10 — on an invoice paid by a converted receipt, a rule can write off the bank's own fee and nothing else. A fee and
 * a rate effect cancel into a figure that looks like a small short-pay (a 25.00 fee and a 10.00 gain look like 15.00
 * short); a short-pay rule tested on that net figure would hide both. An entry that rests on a person's answer is
 * theirs to size, so only a write-off that cites a rule and no fact is held to this. Null when it does not apply.
 */
export function checkFeeOnConvertedReceipt(proposal: Proposal, ctx: KernelContext): Mark | null {
  if (proposal.kind !== "write_off" || proposal.policy_refs.length === 0 || proposal.fact_refs.length > 0) return null;
  const problems: string[] = [];
  const refs: string[] = [];
  for (const app of proposal.applications) {
    const receipts = ctx.bankFxForDoc?.(app.doc_id) ?? [];
    if (receipts.length === 0) continue;
    refs.push(app.doc_id);
    if (!receipts.some((r) => r.fee_cents === app.amount_cents)) {
      const fees = receipts.map((r) => amountText(r.fee_cents)).join(" or ");
      problems.push(`${app.doc_id} was paid by a converted receipt: a rule can write off the bank's fee (${fees}) and nothing else, this entry writes off ${amountText(app.amount_cents)}. The rest is a rate effect or the customer's: book realized FX, or leave it to a person`);
    }
  }
  if (refs.length === 0) return null;
  return verdictMark("F", "F10", problems, "the write-off is exactly the bank's fee on the converted receipt", refs);
}

/**
 * The numbers have to be the bank's, in the bank's words: the advice is cited, current, and states the amount and the
 * rate as figures of their own. The workpaper has to show them with their meaning, so each figure is quoted from the
 * advice in a span that also names the currency ("Amount received: EUR 98,000.00", "1.0800 USD per EUR"); E2 agrees
 * every quote to the source, so a bare number lifted from somewhere else in the advice does not do.
 */
function adviceProblems(proposal: Proposal, ctx: KernelContext, adviceId: string | null, currency: string, foreignCents: number, ratePpm: number): string[] {
  if (!adviceId) return ["the receipt's foreign-currency record names no bank advice"];
  const trace = ctx.getTrace(adviceId);
  if (!trace) return [`bank advice ${adviceId} does not resolve`];
  const problems: string[] = [];
  const quotes = proposal.evidence.filter((e) => e.trace_id === adviceId).map((e) => normalizeWs(e.quote ?? ""));
  if (quotes.length === 0) problems.push(`bank advice ${adviceId} must be cited in the workpaper`);
  const text = normalizeWs(trace.payload_text);
  for (const [what, figure] of [["the amount received", amountText(foreignCents)], ["the rate", rateText(ratePpm)]] as const) {
    if (!statesFigure(text, figure)) problems.push(`bank advice ${adviceId} does not state ${figure}`);
    else if (quotes.length > 0 && !quotes.some((q) => statesFigure(q, figure) && q.includes(currency))) {
      problems.push(`the workpaper does not quote ${what} (${figure}) from bank advice ${adviceId} together with its currency ${currency}`);
    }
  }
  return problems;
}
