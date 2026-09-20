import { ACCOUNTS } from "../../src/contract/accounts.js";
import type { Proposal } from "../../src/contract/types.js";
import { APP_CONFIG } from "../../src/packs/index.js";
import type { Db } from "../../src/runtime/db.js";
import { proposeEntry } from "../../src/runtime/proposeEntry.js";
import {
  DEPS,
  fromProposeResult,
  insertApBill,
  insertIntent,
  insertParty,
  insertPeriod,
  newDb,
  postOpeningBalance,
  type Outcome,
} from "./kernelPackFixtures.js";

/** Four cases about paying a vendor twice, or not paying into a closed period, driven straight
 *  through proposeEntry. No approval round trip: each rule is stage-independent, so the real system
 *  is expected to catch it (or wave it through) on the proposal itself.
 *
 *  Every proposal here is function "ap", which src/runtime/kernelContext.ts requires pack checks
 *  for (NEEDS_PACK_CHECKS): without APP_CONFIG the entry fails closed on check X2 ("no pack checks
 *  configured") before the rule under test ever gets a chance to run. */
const AP_DEPS = { ...DEPS, config: APP_CONFIG };

function scheduleBill(db: Db, billId: string, partyId: string, amount: number): Proposal {
  const memo = `Schedule payment ${billId}`;
  return {
    intent_id: `int_${billId}`, function: "ap", kind: "schedule_payment", party_id: partyId, entry_date: "2026-07-14",
    applications: [{ doc_id: billId, amount_cents: amount }],
    entries: [
      { account: ACCOUNTS.ap, debit_cents: amount, credit_cents: 0, memo },
      { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: amount, memo },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  };
}

/** An approved bill already booked to AP, so the control account ties before the payment posts. */
function openApBalance(db: Db, id: string, billId: string, amount: number): void {
  postOpeningBalance(db, {
    id, period: "2026-07", date: "2026-07-01", memo: `Opening AP for ${billId}`,
    lines: [{ account: ACCOUNTS.misc_expense, debit_cents: amount, credit_cents: 0 }, { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: amount }],
  });
}

/** B-13: the exact same invoice number submitted twice. P7 (obligation duplicate) catches it at
 *  approve_bill, one step before the kernel's own DUPLICATE_PAYMENT rule would ever see it. */
export function caseB13(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_b13", "vendor", "Repeat Invoice Co");
  insertApBill(db, { id: "BILL-B13-OLD", partyId: "vendor_b13", vendorInvoiceNo: "VB13-1001", totalCents: 40000 });
  insertApBill(db, { id: "BILL-B13-NEW", partyId: "vendor_b13", vendorInvoiceNo: "vb13 1001", totalCents: 40000 });
  insertIntent(db, "int_BILL-B13-NEW", "ap", "Approve the exact-duplicate invoice");
  const proposal: Proposal = {
    intent_id: "int_BILL-B13-NEW", function: "ap", kind: "approve_bill", party_id: "vendor_b13", entry_date: "2026-07-14",
    applications: [{ doc_id: "BILL-B13-NEW", amount_cents: 40000 }],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: 40000, credit_cents: 0, memo: "Approve BILL-B13-NEW" },
      { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: 40000, memo: "Approve BILL-B13-NEW" },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  };
  const r = proposeEntry(db, proposal, { actor: "agent:ap_b13", mode: "live", autonomy_level: "auto", tier: 0 }, AP_DEPS);
  return fromProposeResult(r);
}

/** A-13: same vendor, same amount, a new invoice number three days later — the kernel's
 *  DUPLICATE_PAYMENT rule (stage-independent) is expected to block the proposal itself, before
 *  anyone is ever asked to approve it. */
export function caseA13(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_a13", "vendor", "Northwind Supply A13");
  insertApBill(db, { id: "BILL-A13-PAID", partyId: "vendor_a13", vendorInvoiceNo: "NWA13-1001", totalCents: 125000, status: "paid" });
  insertApBill(db, { id: "BILL-A13-NEW", partyId: "vendor_a13", vendorInvoiceNo: "NWA13-1002", totalCents: 125000, status: "approved" });
  openApBalance(db, "je_open_a13", "BILL-A13-NEW", 125000);
  insertIntent(db, "int_BILL-A13-NEW", "ap", "Schedule payment for the duplicate bill");
  const r = proposeEntry(db, scheduleBill(db, "BILL-A13-NEW", "vendor_a13", 125000), { actor: "agent:ap_a13", mode: "live", autonomy_level: "auto", tier: 2 }, AP_DEPS);
  return fromProposeResult(r);
}

/** A-14: same vendor, same amount, same day, but two legitimate invoices for different service
 *  periods. A naive vendor+amount duplicate rule would wrongly block this; ours must not. */
export function caseA14(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_a14", "vendor", "Northwind Supply A14");
  insertApBill(db, { id: "BILL-A14-OLD", partyId: "vendor_a14", vendorInvoiceNo: "NWA14-9001", servicePeriod: "2026-06", totalCents: 125000, status: "paid" });
  insertApBill(db, { id: "BILL-A14-NEW", partyId: "vendor_a14", vendorInvoiceNo: "NWA14-9002", servicePeriod: "2026-07", totalCents: 125000, status: "approved" });
  openApBalance(db, "je_open_a14", "BILL-A14-NEW", 125000);
  insertIntent(db, "int_BILL-A14-NEW", "ap", "Schedule payment for the second, legitimate bill");
  const r = proposeEntry(db, scheduleBill(db, "BILL-A14-NEW", "vendor_a14", 125000), { actor: "agent:ap_a14", mode: "live", autonomy_level: "auto", tier: 2 }, DEPS);
  return fromProposeResult(r);
}

/** B-23: an invoice approved for payment dated inside a period the books have already locked. */
export function caseB23(): Outcome {
  const db = newDb();
  insertPeriod(db, "2026-06", "locked");
  insertParty(db, "vendor_b23", "vendor", "Late Close Co");
  insertApBill(db, { id: "BILL-B23", partyId: "vendor_b23", vendorInvoiceNo: "VB23-1001", totalCents: 40000 });
  insertIntent(db, "int_BILL-B23", "ap", "Approve a bill dated into a locked period");
  const proposal: Proposal = {
    intent_id: "int_BILL-B23", function: "ap", kind: "approve_bill", party_id: "vendor_b23", entry_date: "2026-06-15",
    applications: [{ doc_id: "BILL-B23", amount_cents: 40000 }],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: 40000, credit_cents: 0, memo: "Approve BILL-B23" },
      { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: 40000, memo: "Approve BILL-B23" },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  };
  const r = proposeEntry(db, proposal, { actor: "agent:ap_b23", mode: "live", autonomy_level: "auto", tier: 0 }, DEPS);
  return fromProposeResult(r);
}
