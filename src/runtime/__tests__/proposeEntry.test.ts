import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { approveDecision } from "../approve.js";
import { readControlTotals } from "../kernelContext.js";
import { proposeEntry } from "../proposeEntry.js";
import { applyPayment, creditMemo, fixedClock, seedInitech } from "./seed.js";

const deps = { clock: fixedClock };
const agent = { actor: "agent:ar", mode: "live" as const, autonomy_level: "auto" as const, tier: 2 };

describe("propose_entry: the only write path", () => {
  it("posts an exact-match cash application with no human (AUTO) and keeps AR tied", () => {
    const db = seedInitech();
    const r = proposeEntry(db, applyPayment(), agent, deps);
    expect(r.status).toBe("posted");
    const totals = readControlTotals(db);
    expect(totals.ar_gl_cents).toBe(totals.ar_subledger_cents);
    expect(totals.ar_gl_cents).toBe(4500000 - 1080000);
    const inv = db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1042'").get() as { open_cents: number; status: string };
    expect(inv).toEqual({ open_cents: 120000, status: "open" });
    const topics = (db.prepare("SELECT topic FROM event ORDER BY id").all() as { topic: string }[]).map((e) => e.topic);
    expect(topics).toEqual(["entry.posted", "ar.payment.applied"]);
  });

  it("parks a $1,200 credit memo for a person (PROPOSE), then posts after a human approves", () => {
    const db = seedInitech();
    proposeEntry(db, applyPayment(), agent, deps);
    const parked = proposeEntry(db, creditMemo(), agent, deps);
    expect(parked.status).toBe("pending_approval");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 2 });

    const done = approveDecision(db, parked.status === "pending_approval" ? parked.decision_id : "", { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps);
    expect(done.status).toBe("posted");
    const inv = db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1042'").get();
    expect(inv).toEqual({ open_cents: 0, status: "paid" });
    const dr = db.prepare("SELECT SUM(debit_cents) AS n FROM gl_line WHERE account = ?").get(ACCOUNTS.deferred_revenue);
    expect(dr).toEqual({ n: 120000 });
    const topics = (db.prepare("SELECT topic FROM event ORDER BY id").all() as { topic: string }[]).map((e) => e.topic);
    expect(topics).toContain("ar.credit_memo.posted");
    expect(topics).toContain("billing.expectation.changed");
  });

  it("rejects when one character of the quoted evidence does not match the source (mutation test)", () => {
    const db = seedInitech();
    const r = proposeEntry(db, creditMemo("Initech gets 15% off the platform fee through renewal on 2027-06-30"), agent, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("E2");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });

  it("does not let the controller agent approve at or above materiality", () => {
    const db = seedInitech();
    const parked = proposeEntry(db, creditMemo(), agent, deps);
    const id = parked.status === "pending_approval" ? parked.decision_id : "";
    const r = approveDecision(db, id, { approver_id: "agent:controller", approver_kind: "controller_agent", outcome: "approved" }, deps);
    expect(r.status).toBe("rejected");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });

  it("BLOCKs when the preparer approves their own entry, and persists the rule", () => {
    const db = seedInitech();
    db.prepare("INSERT INTO approver (id, name, role, limit_cents) VALUES ('agent:ar','AR agent','agent',99999999)").run();
    const parked = proposeEntry(db, creditMemo(), agent, deps);
    const id = parked.status === "pending_approval" ? parked.decision_id : "";
    const r = approveDecision(db, id, { approver_id: "agent:ar", approver_kind: "human", outcome: "approved" }, deps);
    expect(r).toMatchObject({ status: "blocked", rule: "PREPARER_EQUALS_APPROVER" });
    expect(db.prepare("SELECT rule, approver_id FROM blocked_attempt").get()).toEqual({ rule: "PREPARER_EQUALS_APPROVER", approver_id: "agent:ar" });
    expect((db.prepare("SELECT route FROM decision WHERE id = ?").get(id) as { route: string }).route).toBe("BLOCK");
  });

  it("BLOCKs an approver whose limit is below the adjustment", () => {
    const db = seedInitech();
    const parked = proposeEntry(db, creditMemo(), agent, deps);
    const id = parked.status === "pending_approval" ? parked.decision_id : "";
    const r = approveDecision(db, id, { approver_id: "U_AP", approver_kind: "human", outcome: "approved" }, deps);
    expect(r).toMatchObject({ status: "blocked", rule: "OVER_APPROVER_LIMIT" });
  });

  it("BLOCKs a post into a locked period", () => {
    const db = seedInitech();
    const r = proposeEntry(db, { ...applyPayment(), entry_date: "2026-06-30" }, agent, deps);
    expect(r).toMatchObject({ status: "blocked", rule: "PERIOD_LOCKED" });
  });

  it("never posts in replay mode, and records the route it would have taken", () => {
    const db = seedInitech();
    const r = proposeEntry(db, applyPayment(), { ...agent, mode: "replay", as_of: "2026-07-13T00:00:00Z" }, deps);
    expect(r).toMatchObject({ status: "replay_recorded", route: "AUTO" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });

  it("is idempotent: the same proposal on the same intent posts once", () => {
    const db = seedInitech();
    const a = proposeEntry(db, applyPayment(), agent, deps);
    const b = proposeEntry(db, applyPayment(), agent, deps);
    expect(a.status).toBe("posted");
    expect(b).toMatchObject({ status: "posted", decision_id: a.status === "posted" ? a.decision_id : "" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 2 });
  });

  it("returns invalid for a float amount or an unknown intent, and writes nothing", () => {
    const db = seedInitech();
    const bad = applyPayment();
    bad.entries[0]!.debit_cents = 10800.5;
    expect(proposeEntry(db, bad, agent, deps).status).toBe("invalid");
    expect(proposeEntry(db, { ...applyPayment(), intent_id: "nope" }, agent, deps).status).toBe("invalid");
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision").get()).toEqual({ n: 1 });
  });
});
