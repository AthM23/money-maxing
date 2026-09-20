import type { Mark, MarkClass, MarkStatus } from "../../contract/types.js";

/**
 * Tick marks this pack adds to the workpaper. The kernel builds its own marks with its own helpers;
 * a pack has no business reaching into those, so it builds the same plain shape here.
 *
 *   E4 — three-way match: bill agreed to purchase order and goods receipt.
 *   P7 — duplicate defence on the obligation, not on the invoice number.
 */
export const AP_MATCH_CHECK = "E4";
export const AP_DUPLICATE_CHECK = "P7";

function apMark(cls: MarkClass, check: string, status: MarkStatus, detail: string, refs: string[]): Mark {
  return { cls, check, status, detail, refs };
}

export function matchPass(detail: string, refs: string[]): Mark {
  return apMark("E", AP_MATCH_CHECK, "pass", detail, refs);
}

export function matchFail(detail: string, refs: string[]): Mark {
  return apMark("E", AP_MATCH_CHECK, "fail", detail, refs);
}

/**
 * Left for a person: the pack re-performed what it could and stopped short of a verdict.
 * A judgment mark neither rejects the entry nor, today, forces an approval — see run.ts.
 */
export function matchJudgment(detail: string, refs: string[]): Mark {
  return apMark("E", AP_MATCH_CHECK, "judgment", detail, refs);
}

export function duplicatePass(detail: string, refs: string[]): Mark {
  return apMark("P", AP_DUPLICATE_CHECK, "pass", detail, refs);
}

export function duplicateFail(detail: string, refs: string[]): Mark {
  return apMark("P", AP_DUPLICATE_CHECK, "fail", detail, refs);
}
