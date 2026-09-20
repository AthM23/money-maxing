import { describe, expect, it } from "vitest";
import type { Proposal } from "../../../contract/types.js";
import { approveBillProposal, decisionIdOf, findMark, marksOf, proposeAp } from "./helpers.js";
import { BILL_ID, INTENT_ID, OTHER_VENDOR, seedAp, VENDOR } from "./seed.js";

/** E4 goes through the real write path every time: proposeEntry, the kernel, then the ledger. */
function e4(db: ReturnType<typeof seedAp>, result: ReturnType<typeof proposeAp>) {
  return findMark(marksOf(db, decisionIdOf(result)), "E4");
}

describe("AP three-way match (E4)", () => {
  it("passes a bill that ties to its purchase order and receipt, and states billed, ordered and received", () => {
    const db = seedAp();
    const result = proposeAp(db, approveBillProposal(db));
    expect(result).toMatchObject({ status: "posted", route: "AUTO" });
    const mark = e4(db, result);
    expect(mark?.status).toBe("pass");
    expect(mark?.detail).toContain("billed 40000 cents");
    expect(mark?.detail).toContain("ordered 40000 cents");
    expect(mark?.detail).toContain("received 40000 cents");
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "approved" });
  });

  it("rejects a bill for more than was received, naming the cents over", () => {
    const db = seedAp({ bill_total_cents: 50000 });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    expect(e4(db, result)?.status).toBe("fail");
    expect(e4(db, result)?.detail).toContain("10000 cents over");
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "open" });
  });

  it("partial receipt: ordered 10, received 6, billed for 10 fails and billed for 6 passes", () => {
    const short = seedAp({ receipt_qtys: [6], bill_total_cents: 40000 });
    const rejected = proposeAp(short, approveBillProposal(short));
    expect(rejected.status).toBe("rejected");
    expect(e4(short, rejected)?.detail).toContain("24000 cents supported");

    const honest = seedAp({ receipt_qtys: [6], bill_total_cents: 24000 });
    const accepted = proposeAp(honest, approveBillProposal(honest));
    expect(accepted.status).toBe("posted");
    expect(e4(honest, accepted)?.status).toBe("pass");
  });

  it("accumulates split deliveries: one order, three goods receipts", () => {
    const db = seedAp({ receipt_qtys: [4, 3, 3] });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("posted");
    expect(e4(db, result)?.detail).toContain("received 40000 cents");
  });

  it("passes inside the tolerance band and fails one cent outside it", () => {
    const inside = seedAp({ bill_total_cents: 40200 });
    expect(proposeAp(inside, approveBillProposal(inside)).status).toBe("posted");

    const outside = seedAp({ bill_total_cents: 40201 });
    const result = proposeAp(outside, approveBillProposal(outside));
    expect(result.status).toBe("rejected");
    expect(e4(outside, result)?.detail).toContain("tolerance 200");
  });

  it("fails when the purchase order belongs to another vendor", () => {
    const db = seedAp({ po_party_id: OTHER_VENDOR });
    const result = proposeAp(db, approveBillProposal(db));
    expect(result.status).toBe("rejected");
    expect(e4(db, result)?.detail).toContain(`belongs to ${OTHER_VENDOR}`);
  });

  it("fails when more is applied to the bill than it has open", () => {
    const db = seedAp();
    const result = proposeAp(db, approveBillProposal(db, { amount_cents: 45000 }));
    expect(result.status).toBe("rejected");
    expect(e4(db, result)?.detail).toContain("exceeds its open amount of 40000 cents");
  });

  it("fails with a readable detail when lines_json does not parse, and never throws", () => {
    const broken = seedAp({ po_lines_json: "not json at all" });
    const result = proposeAp(broken, approveBillProposal(broken));
    expect(result.status).toBe("rejected");
    expect(e4(broken, result)?.detail).toContain("lines_json is not valid JSON");
    // A throwing extra check would surface as the kernel's X0 mark instead of a real E4 finding.
    expect(findMark(marksOf(broken, decisionIdOf(result)), "X0")).toBeUndefined();

    const mistyped = seedAp({ po_lines_json: '{"lines":[{"sku":"WIDGET","qty":"ten","unit_cents":4000}]}' });
    const second = proposeAp(mistyped, approveBillProposal(mistyped));
    expect(second.status).toBe("rejected");
    expect(e4(mistyped, second)?.detail).toContain("sku, qty and unit_cents");
    expect(e4(mistyped, second)?.detail).toContain("0.qty");
  });

  it("leaves a bill with no purchase order as a judgment mark, and a judgment mark parks the entry for a person", () => {
    const db = seedAp({ bill_po_id: null, bill_total_cents: 30000 });
    const result = proposeAp(db, approveBillProposal(db));
    const mark = e4(db, result);
    expect(mark?.status).toBe("judgment");
    expect(mark?.detail).toContain("needs a named approver");
    // Any judgment mark, the kernel's own or a pack's, forces approval: what code cannot re-perform is a person's call.
    expect(result).toMatchObject({ status: "pending_approval", route: "PROPOSE" });
  });

  it("marks nothing on a kind that moves no money to a vendor", () => {
    const db = seedAp();
    const noAction: Proposal = {
      intent_id: INTENT_ID, function: "ap", kind: "no_action", party_id: VENDOR, entry_date: "2026-07-12",
      applications: [], entries: [], evidence: [], policy_refs: [], fact_refs: [], judgment: [],
    };
    const result = proposeAp(db, noAction);
    expect(result.status).toBe("posted");
    const marks = marksOf(db, decisionIdOf(result));
    expect(findMark(marks, "E4")).toBeUndefined();
    expect(findMark(marks, "P7")).toBeUndefined();
  });
});
