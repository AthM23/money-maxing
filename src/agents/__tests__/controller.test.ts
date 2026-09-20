import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { creditMemo, fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import { controllerReview, type Controller } from "../controller.js";

const agent = { actor: "agent:ar", mode: "live" as const, autonomy_level: "review" as const };
const agreeing: Controller = { id: "controller:gpt", review: async () => ({ agrees: true, note: "Quote matches the email; treatment is right.", concerns: [] }) };
const doubting: Controller = { id: "controller:gpt", review: async (p) => ({ agrees: false, note: `Source ${p.sources[0]?.trace_id} does not state an amount.`, concerns: ["amount unsupported"] }) };

function smallWriteOff() {
  return {
    ...creditMemo(), kind: "write_off" as const, terms_change: undefined,
    applications: [{ doc_id: "INV-1042", amount_cents: 2000 }],
    entries: [
      { account: ACCOUNTS.bank_charges, debit_cents: 2000, credit_cents: 0, memo: "Bank fee" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 2000, memo: "Bank fee" },
    ],
  };
}

describe("controller agent: independent review, never the last word on a material entry", () => {
  it("can approve a sub-materiality entry planned by code at review level, and the entry posts", async () => {
    const db = seedInitech();
    // The approval matrix lists the controller agent with a ceiling just under materiality. Without the row it approves nothing.
    db.prepare("INSERT INTO approver (id, name, role, limit_cents) VALUES ('controller:gpt','Controller agent','controller_agent',49999)").run();
    const parked = proposeEntry(db, smallWriteOff(), { ...agent, actor: "router:tier0", tier: 0 }, { clock: fixedClock });
    expect(parked.status).toBe("pending_approval");
    const out = await controllerReview(db, agreeing, parked.status === "pending_approval" ? parked.decision_id : "", { clock: fixedClock });
    expect(out.status).toBe("approved_by_controller");
    expect(db.prepare("SELECT approver_kind FROM approval").get()).toEqual({ approver_kind: "controller_agent" });
  });

  it("cannot approve what a model reached by free inference, however small: two models agreeing is not a person", async () => {
    const db = seedInitech();
    db.prepare("INSERT INTO approver (id, name, role, limit_cents) VALUES ('controller:gpt','Controller agent','controller_agent',49999)").run();
    const parked = proposeEntry(db, smallWriteOff(), { ...agent, actor: "agent:ar:haiku", tier: 1 }, { clock: fixedClock });
    expect(parked.status).toBe("pending_approval");
    const out = await controllerReview(db, agreeing, parked.status === "pending_approval" ? parked.decision_id : "", { clock: fixedClock });
    expect(out.status).toBe("needs_human");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM approval WHERE outcome = 'approved'").get()).toEqual({ n: 0 });
  });

  it("agreeing on a $1,200 credit memo still leaves it for a person: the kernel will not take the controller's approval", async () => {
    const db = seedInitech();
    const parked = proposeEntry(db, creditMemo(), agent, { clock: fixedClock });
    const out = await controllerReview(db, agreeing, parked.status === "pending_approval" ? parked.decision_id : "", { clock: fixedClock });
    expect(out.status).toBe("needs_human");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT tool FROM decision_step WHERE kind = 'model_turn'").get()).toEqual({ tool: "controller:controller:gpt" });
  });

  it("a disagreement posts nothing and carries the concern, and it sees the full source text", async () => {
    const db = seedInitech();
    const parked = proposeEntry(db, creditMemo(), agent, { clock: fixedClock });
    const out = await controllerReview(db, doubting, parked.status === "pending_approval" ? parked.decision_id : "", { clock: fixedClock });
    expect(out).toMatchObject({ status: "disagreed", verdict: { concerns: ["amount unsupported"] } });
    expect(out.status === "disagreed" && out.verdict.note).toContain("tr_email_1");
  });
});
