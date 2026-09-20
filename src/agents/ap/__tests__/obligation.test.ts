import { describe, expect, it } from "vitest";
import { normalizeInvoiceNo, obligationKey } from "../obligation.js";
import { approveBillProposal, decisionIdOf, findMark, marksOf, proposeAp } from "./helpers.js";
import { addBill, addPo, addReceipt, BILL_ID, DEFAULT_PO_LINES, PO_ID, seedAp, VENDOR } from "./seed.js";

function p7(db: ReturnType<typeof seedAp>, result: ReturnType<typeof proposeAp>) {
  return findMark(marksOf(db, decisionIdOf(result)), "P7");
}

describe("AP obligation key", () => {
  it("is vendor, service period and amount, plus the purchase order when there is one", () => {
    const bill = { party_id: VENDOR, service_period: "2026-07", total_cents: 40000, po_id: null };
    expect(obligationKey(bill)).toBe("acme|2026-07|40000");
    expect(obligationKey({ ...bill, po_id: "PO-1" })).toBe("acme|2026-07|40000|PO-1");
    expect(obligationKey({ ...bill, service_period: null })).toBe("acme|-|40000");
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
