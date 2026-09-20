import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Db } from "../../runtime/db.js";
import { runControlTests } from "../controls.js";
import { rerunDecision } from "../rerun.js";
import type { FindingType } from "../types.js";
import { postApplyPayment, postCreditMemo, postPolicyCreditMemo, seedAudit } from "./helpers.js";

const types = (findings: { type: FindingType }[]): FindingType[] => findings.map((f) => f.type);

/** Lock July after the entries went out, the way a real close does. */
function lockJuly(db: Db): void {
  db.prepare("UPDATE period SET status = 'locked', locked_at = '2026-07-31T23:59:00Z' WHERE id = '2026-07'").run();
}

describe("re-performance: no finding for what the entry itself changed", () => {
  it("re-performs a clean cash application with zero findings, through settlement, the applied bank line and a later lock", () => {
    const db = seedAudit();
    const decisionId = postApplyPayment(db);
    lockJuly(db);
    const result = rerunDecision(db, decisionId);
    expect(result.findings).toEqual([]);
    expect(result.fresh_verdict).toBe("accept");
    expect(result.stored_verdict).toBe("accept");
    const said = result.neutralised.join(" | ");
    expect(said).toContain("INV-1042 open balance restored");
    expect(said).toContain("bank line BTX-1");
    expect(said).toContain("period 2026-07 locked at");
  });

  it("re-performs a clean approved credit memo with zero findings", () => {
    const db = seedAudit();
    postApplyPayment(db);
    const decisionId = postCreditMemo(db);
    lockJuly(db);
    expect(rerunDecision(db, decisionId).findings).toEqual([]);
  });

  it("re-tests a cited policy on the case features the workpaper stored, not on today's world", () => {
    const db = seedAudit();
    postApplyPayment(db);
    const decisionId = postPolicyCreditMemo(db);
    const result = rerunDecision(db, decisionId);
    expect(result.findings).toEqual([]);
    expect(result.neutralised.join(" | ")).toContain("case features read from the workpaper: shortfall_cents");
  });

  it("reads document balances from the case file snapshot when the intent carries one", () => {
    const db = seedAudit();
    postApplyPayment(db);
    const decisionId = postCreditMemo(db);
    db.prepare("UPDATE intent SET case_json = ? WHERE id = 'int_1'").run(JSON.stringify({
      intent_id: "int_1", function: "ar", party_id: "initech", entry_date: "2026-07-14", doc_ids: ["INV-1042"],
      expected_cents: 1_200_000, received_cents: 1_080_000, shortfall_cents: 120_000, trace_ids: ["tr_email_1"],
      docs_snapshot: [{ id: "INV-1042", kind: "invoice", party_id: "initech", total_cents: 1_200_000, open_cents: 120_000, date: "2026-07-01" }],
    }));
    const result = rerunDecision(db, decisionId);
    expect(result.findings).toEqual([]);
    expect(result.neutralised.join(" | ")).toContain("case file snapshot");
  });
});

describe("re-performance: the four ways an entry stops holding up", () => {
  it("raises evidence_invalidated when a cited trace is edited after posting", () => {
    const db = seedAudit();
    postApplyPayment(db);
    const decisionId = postCreditMemo(db);
    db.prepare("UPDATE trace SET payload_json = ? WHERE id = 'tr_email_1'")
      .run(JSON.stringify({ from: "ceo@northwind.test", body: "Initech gets 25% off, actually." }));
    const result = rerunDecision(db, decisionId);
    expect(types(result.findings)).toContain("evidence_invalidated");
    const details = result.findings.filter((f) => f.type === "evidence_invalidated");
    expect(details.map((f) => f.detail).join(" ")).toContain("content_hash on file");
    expect(details.every((f) => f.refs.trace_id === "tr_email_1" && f.refs.decision_id === decisionId)).toBe(true);
  });

  it("raises ledger_mismatch when a posted gl_line amount is edited", () => {
    const db = seedAudit();
    const decisionId = postApplyPayment(db);
    const entry = db.prepare("SELECT id FROM gl_entry WHERE source_decision_id = ?").get(decisionId) as { id: string };
    db.prepare("UPDATE gl_line SET debit_cents = 9999999 WHERE entry_id = ? AND account = ?").run(entry.id, ACCOUNTS.cash);
    const result = rerunDecision(db, decisionId);
    const mismatch = result.findings.filter((f) => f.type === "ledger_mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.detail).toContain("9999999");
    expect(mismatch[0]?.refs).toMatchObject({ decision_id: decisionId, entry_id: entry.id });
  });

  it("raises approval_defect when the approver on file is the preparer, and the control test catches it too", () => {
    const db = seedAudit();
    const decisionId = postApplyPayment(db);
    db.prepare(
      "INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, approved_at) VALUES ('apr_x', ?, 'agent:ar', 'human', 'approved', '2026-07-14T17:00:00Z')",
    ).run(decisionId);
    const result = rerunDecision(db, decisionId);
    const defects = result.findings.filter((f) => f.type === "approval_defect");
    expect(defects.map((f) => f.detail).join(" ")).toContain("is the preparer");
    expect(types(result.findings)).toContain("kernel_disagrees");

    const control = runControlTests(db, { period: "2026-07", materiality_cents: 50_000 });
    const selfApproved = control.findings.filter((f) => f.type === "self_approval");
    expect(selfApproved).toHaveLength(1);
    expect(selfApproved[0]?.refs).toMatchObject({ decision_id: decisionId, approver_id: "agent:ar" });
  });

  it("raises kernel_disagrees when the period was already locked at the moment the entry posted", () => {
    const db = seedAudit();
    const decisionId = postApplyPayment(db);
    db.prepare("UPDATE period SET status = 'locked', locked_at = '2026-07-01T00:00:00Z' WHERE id = '2026-07'").run();
    const result = rerunDecision(db, decisionId);
    expect(result.fresh_verdict).toBe("block");
    expect(result.findings.map((f) => f.detail).join(" ")).toContain("period 2026-07 is locked");
  });

  it("reports a decision it cannot examine rather than passing it", () => {
    const db = seedAudit();
    const result = rerunDecision(db, "dec_nope");
    expect(result.fresh_verdict).toBe("unreadable");
    expect(result.findings).toHaveLength(1);
  });
});
