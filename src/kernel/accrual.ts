import { ACCOUNTS } from "../contract/accounts.js";
import type { Mark, Proposal } from "../contract/types.js";
import type { KernelContext } from "./types.js";
import { isControlAccount, mark, statesFigure, sumCredits, sumDebits, verdictMark } from "./util.js";

const amountText = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * F11 — an accrual is an estimate, so the kernel re-performs the estimate. It must be for a vendor the ledger shows
 * billing us in each of the last three months, with nothing booked yet for the month being closed (so it cannot be
 * accrued twice, or on top of a bill that arrived). Its amount is either the median of those three months, which is
 * arithmetic the kernel redoes from the ledger, or a figure the vendor put in writing, quoted in the workpaper; then
 * it is marked judgment, because a person should read that document. Anything else is a number from nowhere.
 */
export function checkAccrual(proposal: Proposal, ctx: KernelContext): Mark {
  const refs = [proposal.party_id];
  const expense = proposal.entries.filter((l) => l.debit_cents > 0 && !isControlAccount(l.account, ctx) && l.account !== ACCOUNTS.accrued_liabilities);
  const accrued = proposal.entries.filter((l) => l.account === ACCOUNTS.accrued_liabilities);
  const amount = sumDebits(expense);
  const problems: string[] = [];
  if (expense.length !== 1) problems.push("an accrual debits exactly one expense account");
  if (accrued.length !== 1 || sumCredits(accrued) !== amount || amount <= 0) problems.push(`an accrual credits accrued liabilities (${ACCOUNTS.accrued_liabilities}) for the same amount it expenses`);
  if (proposal.applications.length > 0) problems.push("an accrual settles no document: there is no bill yet");
  const account = expense[0]?.account;
  const period = proposal.entry_date.slice(0, 7);
  const history = account ? ctx.expenseHistory?.(proposal.party_id, account, period) : undefined;
  if (!history) problems.push("no ledger history to estimate from");
  if (problems.length > 0 || !history) return verdictMark("F", "F11", problems, "", refs);

  const missing = history.prior.filter((p) => p.cents <= 0).map((p) => p.period);
  if (missing.length > 0) problems.push(`${proposal.party_id} has nothing booked to ${account} in ${missing.join(", ")}: three consecutive months are needed to call an expense recurring`);
  if (history.booked_cents !== 0) problems.push(`${amountText(history.booked_cents)} is already booked to ${account} for ${proposal.party_id} in ${period}: it would be counted twice`);
  if (problems.length > 0) return verdictMark("F", "F11", problems, "", refs);

  const sorted = history.prior.map((p) => p.cents).sort((a, b) => a - b);
  const median = sorted[1]!;
  const basis = history.prior.map((p) => `${p.period} ${amountText(p.cents)}`).join(", ");
  if (amount === median && sorted[2]! - sorted[0]! <= Math.floor(median / 100)) {
    return verdictMark("F", "F11", [], `re-performed from the ledger: ${basis}; median ${amountText(median)}, nothing booked for ${period}`, refs);
  }
  const stated = proposal.evidence.some((e) => e.quote !== undefined && statesFigure(e.quote, amountText(amount)) && ctx.getTrace(e.trace_id)?.party_id === proposal.party_id);
  if (stated) return mark("F", "F11", "judgment", `${amountText(amount)} is not the ledger's median (${basis}); it is a figure ${proposal.party_id} stated in a cited document, which a person should read`, refs);
  return verdictMark("F", "F11", [`${amountText(amount)} is neither the median of the last three months (${basis}) nor a figure quoted from a document of ${proposal.party_id}`], "", refs);
}
