import type { CaseFile } from "../../contract/types.js";

/**
 * How the AP pack reads the shared CaseFile.
 *
 * `CaseFile` (src/contract/types.ts) was written for AR, where a customer under-pays an invoice.
 * AP reuses it rather than forking the contract, and reads the same fields this way:
 *
 *   function         "ap"
 *   party_id         the vendor
 *   doc_ids          the bill id(s) this case is about
 *   received_cents   what the vendor billed us: the bill total
 *   expected_cents   what the purchase order and the goods receipts support
 *   shortfall_cents  expected minus received, so a NEGATIVE shortfall means the vendor billed MORE
 *                    than was ordered and received. That is the direction that costs real money.
 *   bank_txn_id      present only when a payment has already cleared the bank
 *
 * Nothing here changes the contract. These are read helpers, so the rest of the pack never has to
 * remember which way round the AR field names point.
 */

/** The vendor this case is about. */
export function apVendorId(c: CaseFile): string {
  return c.party_id;
}

/** The bills this case is about, in the order the drift monitor listed them. */
export function apBillIds(c: CaseFile): readonly string[] {
  return c.doc_ids;
}

/** What the vendor asked for. */
export function apBilledCents(c: CaseFile): number {
  return c.received_cents;
}

/** What the purchase order and the goods receipts stand behind. */
export function apSupportedCents(c: CaseFile): number {
  return c.expected_cents;
}

/** How much more the vendor billed than the PO and receipts support. Zero when nothing is over-billed. */
export function apOverbilledCents(c: CaseFile): number {
  return Math.max(0, -c.shortfall_cents);
}

/** How much less the vendor billed than was ordered and received. Favourable, so never a reason to hold. */
export function apUnderbilledCents(c: CaseFile): number {
  return Math.max(0, c.shortfall_cents);
}

/** True once money has already left the bank: a duplicate here costs cash, not just a wrong accrual. */
export function apHasCleared(c: CaseFile): boolean {
  return Boolean(c.bank_txn_id);
}

/**
 * The flat record a compiled policy condition may test, and the features the kernel sees at J1.
 * Same job as `caseFeatures` in src/router/tier0.ts, with the AP reading of the fields spelled out
 * so a policy author never has to invert `shortfall_cents` in their head.
 */
export function apFeatures(c: CaseFile): Record<string, string | number | boolean> {
  return {
    function: c.function,
    party_id: c.party_id,
    vendor_id: apVendorId(c),
    shortfall_cents: c.shortfall_cents,
    expected_cents: c.expected_cents,
    received_cents: c.received_cents,
    billed_cents: apBilledCents(c),
    supported_cents: apSupportedCents(c),
    overbilled_cents: apOverbilledCents(c),
    underbilled_cents: apUnderbilledCents(c),
    bill_count: c.doc_ids.length,
    has_cleared: apHasCleared(c),
    method: c.method ?? "other",
  };
}
