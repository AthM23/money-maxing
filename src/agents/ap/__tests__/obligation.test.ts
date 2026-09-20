import { describe, expect, it } from "vitest";
import { normalizeInvoiceNo, normalizeServicePeriod, obligationKey } from "../obligation.js";
import { approveBillProposal, decisionIdOf, findMark, marksOf, proposeAp } from "./helpers.js";
import { addBill, addPo, addReceipt, BILL_ID, DEFAULT_PO_LINES, PO_ID, seedAp, VENDOR } from "./seed.js";

function p7(db: ReturnType<typeof seedAp>, result: ReturnType<typeof proposeAp>) {
  return findMark(marksOf(db, decisionIdOf(result)), "P7");
}

describe("AP obligation key", () => {
  it("is vendor, service period and purchase order: the amount is compared with a tolerance, not keyed", () => {
    const bill = { party_id: VENDOR, service_period: "2026-07", po_id: null };
    expect(obligationKey(bill)).toBe("acme|2026-07|-");
    expect(obligationKey({ ...bill, po_id: "PO-1" })).toBe("acme|2026-07|PO-1");
    expect(obligationKey({ ...bill, service_period: null })).toBe("acme|-|-");
  });

  it("reads one service period through a day that was left on it", () => {
    expect(normalizeServicePeriod("2026-07-01")).toBe("2026-07");
    expect(normalizeServicePeriod("2026-07")).toBe("2026-07");
    expect(normalizeServicePeriod(" 2026-07-31 ")).toBe("2026-07");
    expect(normalizeServicePeriod(null)).toBe("-");
  });

  it("reads one invoice number through punctuation, case and leading zeros", () => {
    expect(normalizeInvoiceNo("inv-0042")).toBe("INV42");
    expect(normalizeInvoiceNo("INV 42")).toBe("INV42");
    expect(normalizeInvoiceNo("0001042")).toBe("1042");
  });
});

describe("AP duplicate defence (P7)", () => {
  it("catches a re-numbered duplicate at approve_bill, which the payment block rule never sees", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-0", vendor_invoice_no: "ACME-0990", total_cents: 40000, po_id: PO_ID, status: "approved" });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    const mark = p7(db, result);
    expect(mark?.status).toBe("fail");
    expect(mark?.detail).toContain("bill BILL-0 (ACME-0990)");
    expect(mark?.detail).toContain("already approved");
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "open" });
  });

  it("catches a re-numbered duplicate defeated by one cent: the amount is inside E4's own tolerance", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-CENT", vendor_invoice_no: "ACME-0991", total_cents: 40001, po_id: PO_ID, status: "approved" });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    expect(p7(db, result)?.status).toBe("fail");
    expect(p7(db, result)?.detail).toContain("bill BILL-CENT (ACME-0991)");
    expect(p7(db, result)?.detail).toContain("within 200 cents");
  });

  it("catches a duplicate whose service period is the same month written with a day on it", () => {
    const db = seedAp();
    addBill(db, {
      id: "BILL-DAY", vendor_invoice_no: "ACME-0992", total_cents: 40000, po_id: PO_ID,
      service_period: "2026-07-01", status: "approved",
    });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    expect(p7(db, result)?.detail).toContain("bill BILL-DAY (ACME-0992)");
  });

  it("leaves an amount well outside the tolerance to E4: a different charge is not a duplicate", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-BIG", vendor_invoice_no: "ACME-3003", total_cents: 45000, po_id: PO_ID, status: "approved" });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result).toMatchObject({ status: "posted" });
    expect(p7(db, result)?.status).toBe("pass");
  });

  it("catches the same vendor invoice number on a second bill", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-SAMENO", vendor_invoice_no: "acme 1001", total_cents: 12345, po_id: null });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    expect(p7(db, result)?.detail).toContain("already on bill BILL-SAMENO");
  });

  it("does not over-block: same vendor, period and amount against a different purchase order is a second obligation", () => {
    const db = seedAp();
    addPo(db, { id: "PO-2", party_id: VENDOR, lines_json: DEFAULT_PO_LINES });
    addReceipt(db, { id: "RCPT-2", po_id: "PO-2", qty: 10, received_date: "2026-07-05" });
    addBill(db, { id: "BILL-2", vendor_invoice_no: "ACME-2002", total_cents: 40000, po_id: "PO-2", status: "approved" });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result).toMatchObject({ status: "posted" });
    expect(p7(db, result)?.status).toBe("pass");
  });

  it("does not flag a bill that is only open: nothing has been taken on yet", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-9", vendor_invoice_no: "ACME-0777", total_cents: 40000, po_id: PO_ID });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("posted");
    expect(p7(db, result)?.status).toBe("pass");
  });
});
