import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../../packs/index.js";
import { approveDecision } from "../../../runtime/approve.js";
import type { Db } from "../../../runtime/db.js";
import { proposeEntry } from "../../../runtime/proposeEntry.js";
import { ACTIONS } from "../../../../workspace/actions.js";
import { buildAwaitingYou } from "../../../readmodel/awaitingYou.js";
import { reviewUploadedBill } from "../uploadedBill.js";
import { approveBillProposal } from "./helpers.js";
import { apClock, seedAp } from "./seed.js";

const deps = { clock: apClock, config: APP_CONFIG };
const UPLOAD = { vendor: "Totally Real Consulting LLC", ref: "TRC-0001", bill_date: "2026-07-28", amount_cents: 4_800_000, raw: "INVOICE Totally Real Consulting LLC No TRC-0001 Total USD 48,000.00" };
const BILL = "BILL-UP-TRC-0001";

async function fileUpload(db: Db): Promise<void> {
  expect(await ACTIONS.upload_bill!(db, UPLOAD)).toMatchObject({ status: "filed", bill_id: BILL });
}

/** The kernel is the judge of whether the month still works: the seeded bill's approval has to park, then post. */
function nextApprovalPosts(db: Db): string {
  const next = proposeEntry(db, approveBillProposal(db), { actor: "agent:ap:x", mode: "live", autonomy_level: "earned", tier: 1 }, deps);
  if (next.status !== "pending_approval") return `${next.status}: ${next.status === "rejected" ? next.failed.map((m) => `${m.check} ${m.detail}`).join("; ") : ""}`;
  return approveDecision(db, next.decision_id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps).status;
}

describe("accepting an uploaded bill", () => {
  it("leaves payables tied to the ledger, so the month still works: the next bill approval posts", async () => {
    const db = seedAp();
    await fileUpload(db);
    expect(await ACTIONS.bill_review!(db, { bill_id: BILL, as: "U_CTRL", outcome: "approved" })).toMatchObject({ status: "reviewed", now: "accepted", by: "U_CTRL" });
    // Accepted is not approved: the status moves only through the kernel, so the control accounts stay tied.
    expect(db.prepare("SELECT status, open_cents FROM bill WHERE id = ?").get(BILL)).toEqual({ status: "open", open_cents: 4_800_000 });
    expect(nextApprovalPosts(db)).toBe("posted");
  });

  it("what it replaces: a status set to approved by hand unties payables, and the kernel then refuses every entry", async () => {
    const db = seedAp();
    await fileUpload(db);
    db.prepare("UPDATE bill SET status = 'approved' WHERE id = ?").run(BILL);
    expect(nextApprovalPosts(db)).toContain("F3 control accounts were not tied before the proposal");
  });

  it("is recorded with who and when, and the bill leaves the queue", async () => {
    const db = seedAp();
    await fileUpload(db);
    expect(buildAwaitingYou(db).uploaded_bills.map((b) => b.bill_id)).toEqual([BILL]);
    reviewUploadedBill(db, apClock, BILL, "U_CTRL", "approved");
    expect(db.prepare("SELECT outcome, approver_id, reviewed_at FROM bill_review WHERE bill_id = ?").get(BILL)).toEqual({ outcome: "accepted", approver_id: "U_CTRL", reviewed_at: apClock.now() });
    expect(buildAwaitingYou(db).uploaded_bills).toEqual([]);
    expect(reviewUploadedBill(db, apClock, BILL, "U_AP", "rejected")).toMatchObject({ status: "already_decided", bill: "accepted" });
  });

  it("is refused for someone who is not on the approval matrix, and for a person whose limit does not cover it", async () => {
    const db = seedAp();
    await fileUpload(db);
    expect(await ACTIONS.bill_review!(db, { bill_id: BILL, as: "nobody_at_all", outcome: "approved" })).toMatchObject({ status: "blocked", rule: "UNKNOWN_APPROVER" });
    db.exec("UPDATE approver SET limit_cents = 10000 WHERE id = 'U_AP';");
    const clerk = reviewUploadedBill(db, apClock, BILL, "U_AP", "approved");
    expect(clerk).toMatchObject({ status: "blocked", rule: "OVER_APPROVER_LIMIT" });
    expect(clerk.status === "blocked" ? clerk.detail : "").toContain("may approve up to $100.00; this bill is $48,000.00");
    expect(db.prepare("SELECT COUNT(*) AS n FROM bill_review").get()).toEqual({ n: 0 });
    expect(buildAwaitingYou(db).uploaded_bills.map((b) => b.bill_id)).toEqual([BILL]);
  });

  it("rejecting voids the bill, which takes it out of payables, and says who", async () => {
    const db = seedAp();
    await fileUpload(db);
    expect(reviewUploadedBill(db, apClock, BILL, "U_CTRL", "rejected")).toMatchObject({ status: "reviewed", now: "void", by: "U_CTRL" });
    expect(db.prepare("SELECT status, open_cents FROM bill WHERE id = ?").get(BILL)).toEqual({ status: "void", open_cents: 0 });
    expect(nextApprovalPosts(db)).toBe("posted");
  });

  it("reviews nothing but an upload: a seeded bill cannot be voided from here", async () => {
    const db = seedAp();
    const { BILL_ID } = await import("./seed.js");
    expect(reviewUploadedBill(db, apClock, BILL_ID, "U_CTRL", "rejected")).toEqual({ status: "not_an_upload", bill_id: BILL_ID });
    expect((db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID) as { status: string }).status).toBe("open");
  });
});
