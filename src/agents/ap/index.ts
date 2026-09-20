import type { ExtraCheck } from "../../kernel/types.js";
import type { Db } from "../../runtime/db.js";
import { duplicateObligationCheck } from "./obligation.js";
import { matchTolerance, threeWayMatchCheck, type ThreeWayMatchOptions } from "./threeWayMatch.js";

/**
 * The accounts payable pack: how an AP case is read, what the code tier settles on its own, and the
 * two checks the kernel re-performs on every AP entry before it is allowed through.
 */

/** Pass as `extra_checks` in the meta argument of `proposeEntry` for any AP proposal. */
export function apExtraChecks(db: Db, opts: ThreeWayMatchOptions = {}): ExtraCheck[] {
  // One tolerance for both checks: what E4 forgives on the amount, P7 must forgive too, or a
  // re-numbered bill a cent apart passes P7 as a new obligation and E4 as a rounding difference.
  return [threeWayMatchCheck(db, opts), duplicateObligationCheck(db, matchTolerance(opts))];
}

export {
  apBilledCents, apBillIds, apFeatures, apHasCleared, apOverbilledCents, apSupportedCents,
  apUnderbilledCents, apVendorId,
} from "./caseFile.js";
export { AP_DUPLICATE_CHECK, AP_MATCH_CHECK } from "./marks.js";
export {
  ApLine, ApReceiptLine, DEFAULT_TOLERANCE, getBill, matchBill, toleranceCents,
  type BillRow, type MatchNumbers, type MatchResult, type Tolerance,
} from "./match.js";
export {
  duplicateObligationCheck, findDuplicateObligation, normalizeInvoiceNo, normalizeServicePeriod,
  obligationKey, type DuplicateHit,
} from "./obligation.js";
export { AP_SYSTEM_PROMPT, apTaskMessage } from "./prompt.js";
export { matchTolerance, threeWayMatchCheck, type ThreeWayMatchOptions } from "./threeWayMatch.js";
export { AP_EXPENSE_ACCOUNT, planApTier0 } from "./tier0.js";
