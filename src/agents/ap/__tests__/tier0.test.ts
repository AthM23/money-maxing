import { describe, expect, it } from "vitest";
import type { CaseFile } from "../../../contract/types.js";
import type { Db } from "../../../runtime/db.js";
import { readControlTotals } from "../../../runtime/kernelContext.js";
import { apFeatures } from "../caseFile.js";
import { planApTier0 } from "../tier0.js";
import { approveBillProposal, proposeAp } from "./helpers.js";
import { addBill, apCase, BILL_ID, PO_ID, seedAp } from "./seed.js";

/** What `routeTier0` does for AR, done here for AP: plan in code, then through the one write path. */
function runPlan(db: Db, c: CaseFile) {
  const plan = planApTier0(db, c);
  const results = plan.proposals.map((proposal) => proposeAp(db, proposal, apFeatures(c)));
  return { plan, results };
}

function modelCalls(db: Db): number {
  const row = db.prepare("SELECT COALESCE(SUM(model_calls), 0) AS n FROM decision").get() as { n: number };
  return row.n;
}

describe("AP tier 0: code settles the bill, or says what did not tie", () => {
  it("approves a bill that ties to its purchase order and receipt, with no model call", () => {
    const db = seedAp();
    const { plan, results } = runPlan(db, apCase());
    expect(plan.proposals.map((p) => p.kind)).toEqual(["approve_bill"]);
    expect(plan.unexplained_cents).toBe(0);
    expect(results[0]).toMatchObject({ status: "posted", route: "AUTO" });
    expect(modelCalls(db)).toBe(0);
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "approved" });
    const totals = readControlTotals(db);
    expect(totals.ap_gl_cents).toBe(totals.ap_subledger_cents);
  });

  it("holds a bill for more than was received, where a naive approval is rejected", () => {
    const db = seedAp({ bill_total_cents: 50000 });
    expect(proposeAp(db, approveBillProposal(db)).status).toBe("rejected");

    const { plan, results } = runPlan(db, apCase({ received_cents: 50000, expected_cents: 40000 }));
    expect(plan.proposals.map((p) => p.kind)).toEqual(["hold_bill"]);
    expect(plan.unexplained_cents).toBe(10000);
    expect(plan.notes.join(" ")).toContain("10000 cents over");
    expect(results[0]).toMatchObject({ status: "posted" });
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "held" });
  });

  it("carries the hold reason and the bill's own source on the proposal", () => {
    const db = seedAp({ bill_total_cents: 50000 });
    const { plan } = runPlan(db, apCase({ received_cents: 50000, expected_cents: 40000 }));
    const held = plan.proposals[0];
    expect(held?.evidence[0]?.claim).toContain("Hold reason:");
    expect(held?.evidence[0]?.trace_id).toBe(`tr_${BILL_ID}`);
    expect(held?.entries).toEqual([]);
  });

  it("holds a re-numbered duplicate instead of approving it", () => {
    const db = seedAp();
    addBill(db, { id: "BILL-0", vendor_invoice_no: "ACME-0990", total_cents: 40000, po_id: PO_ID, status: "approved" });
    const { plan, results } = runPlan(db, apCase());
    expect(plan.proposals.map((p) => p.kind)).toEqual(["hold_bill"]);
    expect(plan.notes.join(" ")).toContain("BILL-0");
    expect(plan.unexplained_cents).toBe(40000);
    expect(results[0]).toMatchObject({ status: "posted" });
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "held" });
  });

  it("proposes nothing for a bill with no purchase order, and says a named approver is needed", () => {
    const db = seedAp({ bill_po_id: null });
    const { plan } = runPlan(db, apCase());
    expect(plan.proposals).toEqual([]);
    expect(plan.unexplained_cents).toBe(40000);
    expect(plan.notes.join(" ")).toContain("needs a named approver");
  });

  it("proposes nothing when the purchase order lines cannot be read", () => {
    const db = seedAp({ po_lines_json: "not json at all" });
    const { plan } = runPlan(db, apCase());
    expect(plan.proposals).toEqual([]);
    expect(plan.notes.join(" ")).toContain("lines_json is not valid JSON");
  });

  it("proposes nothing on a bill that is already held, and nothing on a case that is not AP", () => {
    const db = seedAp();
    db.prepare("UPDATE bill SET status = 'held' WHERE id = ?").run(BILL_ID);
    expect(planApTier0(db, apCase()).notes.join(" ")).toContain("already held");

    const wrongFunction = planApTier0(db, apCase({ function: "ar" }));
    expect(wrongFunction.proposals).toEqual([]);
    expect(wrongFunction.notes.join(" ")).toContain("not ap");
  });
});
