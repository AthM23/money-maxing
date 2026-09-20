import { describe, expect, it } from "vitest";
import { applyCreditBody, centsToAmount, centsToDecimal, creditMemoBody, creditMemoDocNumber, paymentBody, sourceEmailText, workpaperText } from "../payloads.js";
import { attachableMetadata } from "../types.js";
import { CHAT_TRACE, EMAIL_TRACE, openSeeded, postCreditMemo, postPayment } from "./fixture.js";

describe("cents to decimal", () => {
  it("converts awkward values by string operations", () => {
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(50)).toBe("0.50");
    expect(centsToDecimal(120000)).toBe("1200.00");
    expect(centsToDecimal(1234567)).toBe("12345.67");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(100)).toBe("1.00");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(-120050)).toBe("-1200.50");
  });

  it("gives the JSON number whose text is the same decimal", () => {
    expect(JSON.stringify([5, 50, 120000, 1234567, 1080000].map(centsToAmount))).toBe("[0.05,0.5,1200,12345.67,10800]");
    // values where cents / 100 style arithmetic is known to drift
    for (const c of [29, 57, 1005, 110, 4350, 999999999]) expect(centsToAmount(c).toFixed(2)).toBe(centsToDecimal(c));
  });

  it("refuses anything that is not integer cents", () => {
    expect(() => centsToDecimal(12.5)).toThrow(/integer cents/);
    expect(() => centsToDecimal(Number.NaN)).toThrow(/integer cents/);
  });
});

describe("payload builders", () => {
  it("paymentBody", () => {
    expect(paymentBody({ decision_id: "dec_1", customer_id: "64", entry_date: "2026-07-12", bank_txn_id: "BTX-0070", lines: [{ qbo_invoice_id: "150", amount_cents: 1080000 }] })).toEqual({
      CustomerRef: { value: "64" }, TotalAmt: 10800, TxnDate: "2026-07-12", PaymentRefNum: "BTX-0070", PrivateNote: "fn:dec_1",
      Line: [{ Amount: 10800, LinkedTxn: [{ TxnId: "150", TxnType: "Invoice" }] }],
    });
  });

  it("paymentBody totals several invoices in integer cents, trims the reference to 21 characters, omits a missing one", () => {
    const body = paymentBody({
      decision_id: "dec_1", customer_id: "64", entry_date: "2026-07-12", bank_txn_id: "BTX-0123456789012345678901234",
      lines: [{ qbo_invoice_id: "150", amount_cents: 10 }, { qbo_invoice_id: "151", amount_cents: 20 }],
    });
    expect(body.TotalAmt).toBe(0.3); // 0.1 + 0.2 in floats would be 0.30000000000000004
    expect(body.PaymentRefNum).toBe("BTX-01234567890123456");
    expect(String(body.PaymentRefNum)).toHaveLength(21);
    expect(paymentBody({ decision_id: "d", customer_id: "1", entry_date: "2026-07-12", bank_txn_id: null, lines: [{ qbo_invoice_id: "1", amount_cents: 1 }] })).not.toHaveProperty("PaymentRefNum");
  });

  it("creditMemoBody", () => {
    expect(creditMemoBody({ decision_id: "dec_2", customer_id: "64", entry_date: "2026-07-14", invoice_id: "INV-1042", item_id: "19", memo_cents: 120000, claim: "CEO granted 10% off through renewal" })).toEqual({
      CustomerRef: { value: "64" }, TxnDate: "2026-07-14", DocNumber: "CM-INV-1042", PrivateNote: "fn:dec_2 CEO granted 10% off through renewal",
      Line: [{ DetailType: "SalesItemLineDetail", Amount: 1200, Description: "Credit against INV-1042", SalesItemLineDetail: { ItemRef: { value: "19" }, Qty: 1, UnitPrice: 1200 } }],
    });
    expect(creditMemoDocNumber("INV-0123456789012345678")).toHaveLength(21);
    expect(creditMemoBody({ decision_id: "dec_2", customer_id: "64", entry_date: "2026-07-14", invoice_id: "INV-1", item_id: "19", memo_cents: 5, claim: null }).PrivateNote).toBe("fn:dec_2");
    expect(() => creditMemoBody({ decision_id: "d", customer_id: "64", entry_date: "2026-07-14", invoice_id: "INV-1", item_id: "19", memo_cents: 0, claim: null })).toThrow(/positive/);
  });

  it("applyCreditBody is a zero Payment with one Invoice line and one CreditMemo line of the same amount", () => {
    expect(applyCreditBody({ decision_id: "dec_2", customer_id: "64", entry_date: "2026-07-14", invoice_id: "INV-1042", credit_memo_id: "900", lines: [{ qbo_invoice_id: "150", amount_cents: 120000 }] })).toEqual({
      CustomerRef: { value: "64" }, TotalAmt: 0, TxnDate: "2026-07-14", PaymentRefNum: "CM-INV-1042", PrivateNote: "fn:dec_2 credit memo applied",
      Line: [
        { Amount: 1200, LinkedTxn: [{ TxnId: "150", TxnType: "Invoice" }] },
        { Amount: 1200, LinkedTxn: [{ TxnId: "900", TxnType: "CreditMemo" }] },
      ],
    });
  });

  it("attachableMetadata", () => {
    expect(attachableMetadata({ entity_type: "CreditMemo", entity_id: "900", file_name: "workpaper-dec_2.txt", content_type: "text/plain", content: "x" })).toEqual({
      AttachableRef: [{ EntityRef: { type: "CreditMemo", value: "900" } }], FileName: "workpaper-dec_2.txt", ContentType: "text/plain",
    });
  });
});

describe("attachment text", () => {
  it("workpaperText prints the decision, the approval, the entry, the LATEST workpaper's marks by class, and the evidence", () => {
    const db = openSeeded();
    const id = postCreditMemo(db);
    const text = workpaperText(db, id);
    expect(text).toContain(`WORKPAPER ${id}`);
    expect(text).toContain("Kind:       credit_memo");
    expect(text).toContain("Route:      PROPOSE");
    expect(text).toContain("Actor:      agent:ar (autonomy review, tier 1)");
    expect(text).toContain("Approval:   approved by U_CTRL (human) at 2026-07-14T16:00:00.000Z: ok per CEO email");
    expect(text).toMatch(/2400\s+1200\.00\n/);
    expect(text).toMatch(/1200\s+1200\.00\n/);
    expect(text).toContain("stage post_gate, verdict accept, 3/4 re-performed");
    expect(text).not.toContain("stage proposal");
    const order = ["F  footed", "[pass] entry_balances", "E  agreed", "[pass] quote_in_source", "P  approved", "[pass] approver_within_limit", "J  per policy", "[judgment] materiality"].map((s) => text.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("1. CEO granted 10% off through renewal");
    expect(text).toContain(`trace ${EMAIL_TRACE}`);
    expect(text).toContain('"Initech gets 10% off the platform fee through renewal on 2027-06-30"');
    expect(text).toContain(`trace ${CHAT_TRACE}`);
  });

  it("workpaperText says so when nobody approved", () => {
    const db = openSeeded();
    expect(workpaperText(db, postPayment(db))).toContain("Approval:   none recorded");
    expect(() => workpaperText(db, "dec_missing")).toThrow(/not found/);
  });

  it("sourceEmailText is headers then body", () => {
    const db = openSeeded();
    expect(sourceEmailText(db, EMAIL_TRACE)).toBe([
      "From: morgan.hale@northwind.test", "To: pat.lindqvist@initech.test", "Cc: dana.reyes@northwind.test", "Subject: Re: Renewal pricing",
      "Date: 2026-06-28T15:00:00Z", "Thread: t-initech-pricing", `Trace: ${EMAIL_TRACE} (gmail m-initech-2)`, "",
      "Pat,\n\nConfirmed: Initech gets 10% off the platform fee through renewal on 2027-06-30.\n\nMorgan", "",
    ].join("\n"));
    expect(() => sourceEmailText(db, "tr_missing")).toThrow(/not found/);
  });
});
