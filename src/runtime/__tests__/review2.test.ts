import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal } from "../../contract/types.js";
import { seedDemoWorld } from "../../demo/seed.js";
import { openDb, type Db } from "../db.js";
import { proposeEntry } from "../proposeEntry.js";
import { fixedClock } from "./seed.js";

function world(): Db {
  const db = openDb();
  seedDemoWorld(db);
  for (const kind of ["credit_memo", "write_off"]) {
    db.prepare("INSERT INTO autonomy (function, kind, agree, n, covered, level, updated_at) VALUES ('ar', ?, 6, 6, 1, 'auto', '2026-07-01T00:00:00Z')").run(kind);
  }
  return db;
}

/** A small goodwill credit to deferred revenue on Umbrella's invoice: a model's free inference, nothing on file says so. */
function goodwillCredit(over: Partial<Proposal> = {}): Proposal {
  return {
    intent_id: "int_umbrella", function: "ar", kind: "credit_memo", party_id: "umbrella", entry_date: "2026-07-15",
    applications: [{ doc_id: "INV-1060", amount_cents: 2000 }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: 2000, credit_cents: 0, memo: "Goodwill credit" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 2000, memo: "Goodwill credit" },
    ],
    evidence: [{ claim: "the wire arrived short", trace_id: "tr_bank_2", quote: "WIRE UMBRELLA CORP" }],
    policy_refs: [], fact_refs: [], judgment: [], ...over,
  };
}

const features = { function: "ar", party_id: "umbrella", shortfall_cents: 2000, expected_cents: 2000000, received_cents: 1998000, method: "wire" };
const model = { actor: "agent:ar:sonnet", mode: "live" as const, autonomy_level: "earned" as const, tier: 2, features };

describe("second review: free inference cannot borrow cover from a rule that says something else", () => {
  it("stapling the approved wire-fee rule onto a revenue concession is rejected, not auto-posted", () => {
    const db = world();
    const r = proposeEntry(db, goodwillCredit({ policy_refs: ["pol_wire_fee"] }), model, { clock: fixedClock });
    expect(r.status).toBe("rejected");
    expect(r.status === "rejected" && r.failed.map((m) => m.check)).toEqual(["J1"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });

  it("the same entry with no citation is held for a person even though the kind has earned auto", () => {
    const db = world();
    const r = proposeEntry(db, goodwillCredit(), model, { clock: fixedClock });
    expect(r).toMatchObject({ status: "pending_approval", route: "PROPOSE" });
  });

  it("the rule still covers the entry it was written for", () => {
    const db = world();
    const writeOff = goodwillCredit({
      kind: "write_off", policy_refs: ["pol_wire_fee"],
      entries: [
        { account: ACCOUNTS.bank_charges, debit_cents: 2000, credit_cents: 0, memo: "Per policy pol_wire_fee" },
        { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 2000, memo: "Per policy pol_wire_fee" },
      ],
    });
    expect(proposeEntry(db, writeOff, model, { clock: fixedClock })).toMatchObject({ status: "posted", route: "AUTO" });
  });
});
