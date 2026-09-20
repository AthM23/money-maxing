import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { ingest } from "../../ingest/ingest.js";
import { approveDecision } from "../approve.js";
import { bankTxnAppliedCents } from "../kernelContext.js";
import { proposeEntry } from "../proposeEntry.js";
import { settleIntent } from "../intentStatus.js";
import { applyPayment, creditMemo, fixedClock, seedInitech } from "./seed.js";

const meta = { actor: "agent:ar", mode: "live" as const, autonomy_level: "auto" as const, tier: 0 };
const deps = { clock: fixedClock };
const approval = { approver_id: "U_CTRL", approver_kind: "human" as const, outcome: "approved" as const };

describe("audit: posting boundaries", () => {
  it("holds legacy generated policies that lack a customer scope until a scoped replacement is approved", () => {
    const db = seedInitech();
    db.prepare(`INSERT INTO policy (id,function,name,condition_json,action_json,intent_text,tier,status,code)
      VALUES ('legacy','ar','Legacy rule',?,?,'learned','company','approved','SHORT-PAY-01')`)
      .run(JSON.stringify({ all: [] }), JSON.stringify({ kind: "credit_memo", account: ACCOUNTS.deferred_revenue }));
    const result = proposeEntry(db, { ...creditMemo(), policy_refs: ["legacy"] }, meta, deps);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.failed.some(m => m.check === "J_SCOPE")).toBe(true);
  });
  it("counts all received cash, including cash held entirely unapplied, exactly once", () => {
    const db = seedInitech();
    db.prepare("UPDATE approver SET limit_cents = 2000000 WHERE id = 'U_CTRL'").run();
    const p = { ...applyPayment(), applications: [], entries: [
      { account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "unapplied" },
      { account: ACCOUNTS.customer_credits, debit_cents: 0, credit_cents: 1080000, memo: "unapplied" },
    ], evidence: creditMemo().evidence };
    const first = proposeEntry(db, p, meta, deps);
    expect(first.status).toBe("pending_approval");
    if (first.status !== "pending_approval") return;
    expect(approveDecision(db, first.decision_id, approval, deps).status).toBe("posted");
    expect(bankTxnAppliedCents(db, "BTX-1")).toBe(1080000);
    const again = proposeEntry(db, { ...p, entries: p.entries.map(l => ({ ...l, memo: "second attempt" })) }, meta, deps);
    expect(again.status).toBe("rejected");
  });

  it("does not reuse a live posting as a replay result", () => {
    const db = seedInitech();
    expect(proposeEntry(db, applyPayment(), meta, deps).status).toBe("posted");
    const result = proposeEntry(db, applyPayment(), { ...meta, mode: "replay", as_of: fixedClock.now(), replay_docs: [
      { id: "INV-1042", kind: "invoice", party_id: "initech", total_cents: 1200000, open_cents: 1200000, date: "2026-07-01" },
    ] }, deps);
    expect(result.status).toBe("replay_recorded");
  });

  it("a declined decision cannot later be approved", () => {
    const db = seedInitech();
    const r = proposeEntry(db, creditMemo(), meta, deps);
    if (r.status !== "pending_approval") throw new Error(r.status);
    expect(approveDecision(db, r.decision_id, { ...approval, outcome: "rejected" }, deps).status).toBe("declined");
    expect(approveDecision(db, r.decision_id, approval, deps).status).toBe("not_pending");
  });

  it("an unauthorised identity cannot decline a proposal", () => {
    const db = seedInitech();
    const r = proposeEntry(db, creditMemo(), meta, deps);
    if (r.status !== "pending_approval") throw new Error(r.status);
    expect(approveDecision(db, r.decision_id, { ...approval, approver_id: "stranger", outcome: "rejected" }, deps).status).toBe("rejected");
    expect(db.prepare("SELECT COUNT(*) AS n FROM approval").get()).toEqual({ n: 0 });
  });

  it("runs the kernel under the same write transaction as the posting", () => {
    const db = seedInitech();
    const inTransaction: boolean[] = [];
    proposeEntry(db, applyPayment(), { ...meta, extra_checks: [() => { inTransaction.push(db.inTransaction); return []; }] }, deps);
    expect(inTransaction.length).toBeGreaterThan(0);
    expect(inTransaction.every(Boolean)).toBe(true);
  });

  it("rejects a parked decision when its cited evidence has a newer version", () => {
    const db = seedInitech();
    const r = proposeEntry(db, creditMemo(), meta, deps);
    if (r.status !== "pending_approval") throw new Error(r.status);
    ingest(db, [{ source: "gmail", kind: "email", external_id: "msg-1", event_time: "2026-06-28T15:00:00Z",
      recorded_time: "2026-07-14T15:00:00Z", payload: { body: "Concession withdrawn. Invoice remains due in full." } }], fixedClock);
    const out = approveDecision(db, r.decision_id, approval, deps);
    expect(out.status).toBe("rejected");
    expect(settleIntent(db, fixedClock, "int_1")).toBe("waiting_on_human");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });
  it("a changed source holds a posted entry for review without silently reversing the books", () => {
    const db = seedInitech();
    const first = proposeEntry(db, creditMemo(), meta, deps);
    if (first.status !== "pending_approval") throw new Error(first.status);
    expect(approveDecision(db, first.decision_id, approval, deps).status).toBe("posted");
    ingest(db, [{ source: "gmail", kind: "email", external_id: "msg-1", event_time: "2026-07-14T15:00:00Z",
      recorded_time: "2026-07-14T15:00:00Z", payload: { body: "Concession withdrawn" } }], fixedClock);
    expect(settleIntent(db, fixedClock, "int_1")).toBe("waiting_on_human");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM workpaper WHERE decision_id = ? AND stale = 1").get(first.decision_id)).toEqual({ n: 2 });
  });
});
