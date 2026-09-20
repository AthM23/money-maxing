import type { EntryLine, Mark, MarkClass, MarkStatus, Proposal } from "../contract/types.js";
import type { DocLite, KernelContext } from "./types.js";

/** Build one audit tick mark. Every check goes through here so the shape is uniform. */
export function mark(cls: MarkClass, check: string, status: MarkStatus, detail: string, refs: string[] = []): Mark {
  return { cls, check, status, detail, refs };
}

export function passMark(cls: MarkClass, check: string, detail: string, refs: string[] = []): Mark {
  return mark(cls, check, "pass", detail, refs);
}

export function failMark(cls: MarkClass, check: string, detail: string, refs: string[] = []): Mark {
  return mark(cls, check, "fail", detail, refs);
}

/** A check that does not apply to this proposal. Passes, but says so in the detail. */
export function naMark(cls: MarkClass, check: string, detail: string, refs: string[] = []): Mark {
  return mark(cls, check, "pass", `n/a: ${detail}`, refs);
}

/** Post-gate-only checks say this on the proposal pass. */
export function postGateMark(cls: MarkClass, check: string, refs: string[] = []): Mark {
  return naMark(cls, check, "evaluated at post gate", refs);
}

/** Collapse every run of whitespace to one space and trim. Case is preserved on purpose. */
export function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}

export function sumDebits(lines: readonly EntryLine[]): number {
  return lines.reduce((total, line) => total + line.debit_cents, 0);
}

export function sumCredits(lines: readonly EntryLine[]): number {
  return lines.reduce((total, line) => total + line.credit_cents, 0);
}

export function applicationsTotal(proposal: Proposal): number {
  return proposal.applications.reduce((total, app) => total + app.amount_cents, 0);
}

/** Cash, AR control and AP control. Movement on these is mechanical, not judgment. */
export function isControlAccount(account: string, ctx: KernelContext): boolean {
  const { cash_account, ar_account, ap_account } = ctx.control;
  return account === cash_account || account === ar_account || account === ap_account;
}

export function linesOn(proposal: Proposal, account: string): EntryLine[] {
  return proposal.entries.filter((line) => line.account === account);
}

/** Kinds that reduce a receivable or a payable WITHOUT money moving. Whatever they apply is judgment, however it is booked. */
const NON_CASH_REDUCING: ReadonlySet<string> = new Set(["credit_memo", "write_off", "customer_credit", "bank_adjustment"]);

/**
 * The judgment amount: what this entry moves outside the control accounts (credit memo, write-off, accrual).
 * An exact-match cash application has an adjustment of 0. For a kind that reduces a balance without cash, the
 * amount applied counts too, so booking a write-off against cash or AR cannot make it read as zero.
 */
export function adjustmentCents(proposal: Proposal, ctx: KernelContext): number {
  const lines = proposal.entries.filter((line) => !isControlAccount(line.account, ctx));
  const outsideControl = Math.max(sumDebits(lines), sumCredits(lines));
  if (!NON_CASH_REDUCING.has(proposal.kind)) return outsideControl;
  const applied = proposal.applications.reduce((n, a) => n + a.amount_cents, 0);
  return Math.max(outsideControl, applied);
}

/** Sum of applications landing on documents of one kind. Unknown documents contribute nothing. */
export function appliedToDocKind(proposal: Proposal, ctx: KernelContext, kind: DocLite["kind"]): number {
  return proposal.applications.reduce((total, app) => {
    const doc = ctx.getDoc(app.doc_id);
    return doc?.kind === kind ? total + app.amount_cents : total;
  }, 0);
}

/** Replay guard: nothing recorded after as_of may be cited. ISO timestamps compare as strings. */
export function isAfterAsOf(ctx: KernelContext, recorded: string): boolean {
  if (ctx.mode !== "replay" || !ctx.as_of) return false;
  return recorded > ctx.as_of;
}

/** Turn a list of complaints into one mark: failing when there are any, passing when there are none. */
export function verdictMark(
  cls: MarkClass,
  check: string,
  problems: readonly string[],
  okDetail: string,
  refs: string[] = [],
): Mark {
  if (problems.length > 0) return failMark(cls, check, problems.join("; "), refs);
  return passMark(cls, check, okDetail, refs);
}
