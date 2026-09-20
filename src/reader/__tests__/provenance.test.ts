import { describe, expect, it } from "vitest";
import { remittanceProvenanceProblems } from "../../contract/remittance.js";

const OCR = `SCANNED DOC (OCR)
REMITTANCE ADVICE
From: Initech Ho1dings
Date: 2026-06-16
We have initiated payment of $15955.59 via ACH for the fo11owing: INV-6685 ($996.35); INV-8564 ($14959.24)
Ref: RMT38600`;
const TERSE = "2026-07-22 WIRE RMT76314 INITECH SYSTEMS USD 26,627.87 INV-1891:5,494.98 INV-1233:3,016.32 INV-5187:18,116.57";
const PROSE = `Hi team,
Just a heads up, we sent Acme Systems's payment today (2026-07-03) — total $10,459.39 covering invoice INV-4292 for $10,459.39.
It should show as ref RMT21764 on your end.`;

describe("a remittance read by a model is checked against the customer's own words", () => {
  it("accepts a correct reading of OCR, terse and prose remittances", () => {
    expect(remittanceProvenanceProblems(OCR, [{ doc_id: "INV-6685", amount_cents: 99635 }, { doc_id: "INV-8564", amount_cents: 1495924 }], 1595559)).toEqual([]);
    expect(remittanceProvenanceProblems(TERSE, [{ doc_id: "INV-1891", amount_cents: 549498 }, { doc_id: "INV-1233", amount_cents: 301632 }, { doc_id: "INV-5187", amount_cents: 1811657 }], 2662787)).toEqual([]);
    expect(remittanceProvenanceProblems(PROSE, [{ doc_id: "INV-4292", amount_cents: 1045939 }], 1045939)).toEqual([]);
  });

  it("a correct total cannot hide amounts swapped between invoices", () => {
    const swapped = [{ doc_id: "INV-6685", amount_cents: 1495924 }, { doc_id: "INV-8564", amount_cents: 99635 }];
    const problems = remittanceProvenanceProblems(OCR, swapped, 1595559);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("not stated next to INV-6685");
  });

  it("rejects an invented invoice, an amount the customer never wrote, a total that is not stated, and allocations that do not foot", () => {
    expect(remittanceProvenanceProblems(OCR, [{ doc_id: "INV-6685", amount_cents: 99635 }, { doc_id: "INV-9999", amount_cents: 1495924 }], 1595559).join(" ")).toContain("INV-9999 is not named");
    expect(remittanceProvenanceProblems(OCR, [{ doc_id: "INV-6685", amount_cents: 99600 }, { doc_id: "INV-8564", amount_cents: 1495959 }], 1595559).join(" ")).toContain("not stated next to");
    expect(remittanceProvenanceProblems(PROSE, [{ doc_id: "INV-4292", amount_cents: 1045900 }], 1045900).join(" ")).toContain("is not stated in the remittance");
    expect(remittanceProvenanceProblems(OCR, [{ doc_id: "INV-6685", amount_cents: 99635 }], 1595559).join(" ")).toContain("foot to 99635");
  });

  it("does not match an invoice number inside a longer one, and refuses duplicates and empty readings", () => {
    expect(remittanceProvenanceProblems("paid INV-66850 ($996.35) total $996.35", [{ doc_id: "INV-6685", amount_cents: 99635 }], 99635).join(" ")).toContain("INV-6685 is not named");
    expect(remittanceProvenanceProblems(OCR, [{ doc_id: "INV-6685", amount_cents: 99635 }, { doc_id: "INV-6685", amount_cents: 1495924 }], 1595559).join(" ")).toContain("allocated twice");
    expect(remittanceProvenanceProblems(OCR, [], 1595559)).toEqual(["the remittance allocates nothing"]);
  });
});
