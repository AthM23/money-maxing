import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { approveDecision } from "../../runtime/approve.js";
import { openDb } from "../../runtime/db.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { DEMO_CASES, seedDemoWorld } from "../../demo/seed.js";
import type { Controller } from "../controller.js";
import type { Investigator } from "../investigator.js";
import { reviewAndRevise } from "../review.js";
import { runCase } from "../runCase.js";

const QUOTE = "Initech gets 10% off the platform fee through renewal on 2027-06-30";
const drafts = (account: string): Investigator => ({
  name: `books-to-${account}`,
  async investigate(task, call) {
    call("propose_entry", {
      intent_id: task.case_file.intent_id, function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
      applications: [{ doc_id: "INV-1042", amount_cents: 120000 }],
      entries: [{ account, debit_cents: 120000, credit_cents: 0, memo: "Concession" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "Concession" }],
      evidence: [{ claim: "CEO granted 10% off", trace_id: "tr_mail_2", quote: QUOTE }], policy_refs: [], fact_refs: [], judgment: [],
    });
    return { outcome: "proposed", summary: task.notes.join(" | "), places_looked: ["mail"] };
  },
});
/** Disagrees with contra-revenue while the service is still being delivered; agrees with deferred revenue. */
const strict: Controller = {
  id: "controller:test",
  review: async (p) => (p.proposal.entries[0]?.account === ACCOUNTS.deferred_revenue
    ? { agrees: true, note: "Treatment is right.", concerns: [] }
    : { agrees: false, note: "Unearned portion: use deferred revenue 2400.", concerns: ["wrong account"] }),
};

describe("preparer, reviewer, one revision", () => {
  it("a disagreement declines the draft on the record, a stronger tier revises with the concerns, and a person approves the revision", async () => {
    const db = openDb();
    seedDemoWorld(db);
    const initech = DEMO_CASES.find((c) => c.party_id === "initech")!;
    const tiers = [drafts(ACCOUNTS.concessions), drafts(ACCOUNTS.deferred_revenue)];
    const firstRun = await runCase(db, initech, { mode: "live", autonomy_level: "auto", investigators: tiers, clock: fixedClock });
    expect(firstRun.final_route).toBe("PROPOSE");

    const loop = await reviewAndRevise(db, strict, firstRun.decision_id!, tiers, { clock: fixedClock });
    expect(loop.first.status).toBe("disagreed");
    expect(loop.second?.status).toBe("needs_human");
    expect(approveDecision(db, firstRun.decision_id!, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("not_pending");
    expect(approveDecision(db, loop.revised_decision_id!, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT SUM(debit_cents) AS n FROM gl_line WHERE account = ?").get(ACCOUNTS.deferred_revenue)).toEqual({ n: 120000 });
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 0 });
  });
});
