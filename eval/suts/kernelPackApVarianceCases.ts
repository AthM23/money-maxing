import type { CaseFile } from "../../src/contract/types.js";
import { APP_CONFIG } from "../../src/packs/index.js";
import type { Db } from "../../src/runtime/db.js";
import { routeTier0 } from "../../src/router/route.js";
import {
  DEPS,
  fromApRouteOutcome,
  insertApBill,
  insertIntent,
  insertParty,
  insertPeriod,
  insertPo,
  insertReceipt,
  newDb,
  type Outcome,
} from "./kernelPackFixtures.js";

/** Four cases where the AP three-way match (E4) cannot tie a bill to its purchase order and
 *  receipts, plus one where it repeats an obligation under a reissued invoice number. Real
 *  routeTier0, real planApTier0, real matchBill — no model call, nothing hard-coded.
 *
 *  The AP pack's checks only run when the caller configures them (src/runtime/kernelContext.ts
 *  NEEDS_PACK_CHECKS): every case here passes APP_CONFIG, the same configuration every real AP
 *  entry point uses (src/packs/index.ts), so an unconfigured entry never reads as a false pass. */
const AP_DEPS = { ...DEPS, config: APP_CONFIG };

function runApRoute(db: Db, c: CaseFile): Outcome {
  return fromApRouteOutcome(routeTier0(db, c, { mode: "live", autonomy_level: "auto" }, AP_DEPS));
}

function baseCase(over: Partial<CaseFile> & Pick<CaseFile, "intent_id" | "party_id" | "doc_ids">): CaseFile {
  return {
    function: "ap", entry_date: "2026-07-14", expected_cents: 0, received_cents: 0, shortfall_cents: 0,
    trace_ids: [], ...over,
  };
}

/** B-01: short ship. Ten widgets ordered, only six received, but the vendor bills for all ten. */
export function caseB01(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b01", "vendor", "Short Ship Supply");
  insertPo(db, "PO-B01", "vendor_b01", JSON.stringify([{ sku: "WIDGET", qty: 10, unit_cents: 4000 }]), 40000);
  insertReceipt(db, "RCPT-B01", "PO-B01", "2026-07-05", JSON.stringify([{ sku: "WIDGET", qty: 6 }]));
  insertApBill(db, { id: "BILL-B01", partyId: "vendor_b01", poId: "PO-B01", vendorInvoiceNo: "VB01-1001", totalCents: 40000 });
  insertIntent(db, "int_b01", "ap", "Clear the short-ship bill");
  return runApRoute(db, baseCase({ intent_id: "int_b01", party_id: "vendor_b01", doc_ids: ["BILL-B01"], expected_cents: 24000, received_cents: 40000, shortfall_cents: -16000 }));
}

/** B-02: price variance. Ten widgets ordered and fully received, but billed above the PO's price. */
export function caseB02(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b02", "vendor", "Price Variance Supply");
  insertPo(db, "PO-B02", "vendor_b02", JSON.stringify([{ sku: "WIDGET", qty: 10, unit_cents: 4000 }]), 40000);
  insertReceipt(db, "RCPT-B02", "PO-B02", "2026-07-05", JSON.stringify([{ sku: "WIDGET", qty: 10 }]));
  insertApBill(db, { id: "BILL-B02", partyId: "vendor_b02", poId: "PO-B02", vendorInvoiceNo: "VB02-1001", totalCents: 45000 });
  insertIntent(db, "int_b02", "ap", "Clear the over-priced bill");
  return runApRoute(db, baseCase({ intent_id: "int_b02", party_id: "vendor_b02", doc_ids: ["BILL-B02"], expected_cents: 40000, received_cents: 45000, shortfall_cents: -5000 }));
}

/** B-05: a bill that cites no purchase order at all. Three-way match has nothing to check against. */
export function caseB05(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b05", "vendor", "No PO Consulting");
  insertApBill(db, { id: "BILL-B05", partyId: "vendor_b05", poId: null, vendorInvoiceNo: "VB05-1001", totalCents: 30000 });
  insertIntent(db, "int_b05", "ap", "Clear the no-PO bill");
  return runApRoute(db, baseCase({ intent_id: "int_b05", party_id: "vendor_b05", doc_ids: ["BILL-B05"], received_cents: 30000, shortfall_cents: -30000 }));
}

/** B-06: services with no goods receipt note. The PO exists; nothing was ever logged as received
 *  against it, so the three-way match is structurally impossible, not merely short. */
export function caseB06(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b06", "vendor", "Consulting Services LLC");
  insertPo(db, "PO-B06", "vendor_b06", JSON.stringify([{ sku: "CONSULT", qty: 1, unit_cents: 40000 }]), 40000);
  insertApBill(db, { id: "BILL-B06", partyId: "vendor_b06", poId: "PO-B06", vendorInvoiceNo: "VB06-1001", totalCents: 40000 });
  insertIntent(db, "int_b06", "ap", "Clear the no-GRN consulting bill");
  return runApRoute(db, baseCase({ intent_id: "int_b06", party_id: "vendor_b06", doc_ids: ["BILL-B06"], received_cents: 40000, shortfall_cents: -40000 }));
}

/** B-14: the vendor reissues an unpaid charge under a new invoice number. Same vendor, service
 *  period and amount as an already-approved bill — an invoice-number index alone would miss it. */
export function caseB14(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b14", "vendor", "Reissue Partners");
  insertApBill(db, {
    id: "BILL-B14-OLD", partyId: "vendor_b14", poId: null, servicePeriod: "2026-07",
    vendorInvoiceNo: "VB14-1001", totalCents: 40000, status: "paid",
  });
  insertApBill(db, {
    id: "BILL-B14-NEW", partyId: "vendor_b14", poId: null, servicePeriod: "2026-07",
    vendorInvoiceNo: "VB14-2002", totalCents: 40000,
  });
  insertIntent(db, "int_b14", "ap", "Clear the reissued bill");
  return runApRoute(db, baseCase({ intent_id: "int_b14", party_id: "vendor_b14", doc_ids: ["BILL-B14-NEW"], received_cents: 40000, shortfall_cents: -40000 }));
}
