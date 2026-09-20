import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { routeTier0 } from "../../router/route.js";
import { fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import type { Db } from "../../runtime/db.js";
import { autonomyFor, levelFor, rebuildLadder } from "../autonomy.js";
import { approvePolicy, compilePolicies } from "../compile.js";
import { replay } from "../replay.js";

/** Six Q2 wire shortfalls: five written off to bank charges, one to misc expense. Plus one the humans disputed. */
function seedQ2(db: Db, extra: Array<{ id: string; cents: number; kind: string; account?: string }> = []): void {
  const points = [
    { id: "dp1", cents: 1500, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp2", cents: 2500, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp3", cents: 3500, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp4", cents: 2000, kind: "write_off", account: ACCOUNTS.misc_expense },
    { id: "dp5", cents: 4500, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp6", cents: 1000, kind: "write_off", account: ACCOUNTS.bank_charges },
    ...extra,
  ];
  const insert = db.prepare(
    "INSERT INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json) VALUES (?, 'ar', '2026-05', 'short_pay', '[]', ?, ?, ?)",
  );
  points.forEach((p, i) => {
    const doc = `Q2-INV-${i}`;
    const day = String(10 + i).padStart(2, "0");
    const caseFile = {
      intent_id: `int_replay_${p.id}`, function: "ar", party_id: "initech", entry_date: `2026-05-${day}`, doc_ids: [doc],
      expected_cents: 2000000, received_cents: 0, shortfall_cents: p.cents, method: "wire", trace_ids: ["tr_email_1"],
      docs_snapshot: [{ id: doc, kind: "invoice", party_id: "initech", total_cents: 2000000, open_cents: p.cents, date: "2026-05-01" }],
    };
    insert.run(p.id, `2026-05-${day}T12:00:00Z`, JSON.stringify(caseFile),
      JSON.stringify({ kind: p.kind, account: p.account, amount_cents: p.cents, doc_ids: [doc] }));
  });
  db.exec("INSERT OR IGNORE INTO period (id, status) VALUES ('2026-05','locked')");
}

describe("compile: repeated judgment becomes a policy draft, in code", () => {
  it("drafts the bank-charges rule with a ceiling no wider than what the humans did, and shows the outlier", () => {
    const db = seedInitech();
    seedQ2(db);
    const drafts = compilePolicies(db, fixedClock, "ar");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ action: { kind: "write_off", account: ACCOUNTS.bank_charges }, backtest: { n: 6, agree: 5, account_outliers: ["dp4"], regressions: [] } });
    expect(JSON.stringify(drafts[0]!.condition)).toContain('"value":4500');
    expect(db.prepare("SELECT status FROM policy").get()).toEqual({ status: "proposed" });
  });

  it("refuses a draft that would have mis-cleared a case the humans disputed", () => {
    const db = seedInitech();
    seedQ2(db, [{ id: "dp7", cents: 3000, kind: "dispute_hold" }]);
    const drafts = compilePolicies(db, fixedClock, "ar");
    expect(drafts[0]!.policy_id).toBeNull();
    expect(drafts[0]!.refused_reason).toContain("dp7");
    expect(db.prepare("SELECT COUNT(*) AS n FROM policy").get()).toEqual({ n: 0 });
  });

  it("a proposed policy does nothing until approved; approved, it clears the next case with no model call", () => {
    const db = seedInitech();
    seedQ2(db);
    const [draft] = compilePolicies(db, fixedClock, "ar");
    const july = {
      intent_id: "int_1", function: "ar", party_id: "initech", entry_date: "2026-07-20", doc_ids: ["INV-1042"],
      expected_cents: 1200000, received_cents: 0, shortfall_cents: 2000, method: "wire", trace_ids: ["tr_email_1"],
    };
    const before = routeTier0(db, july, { mode: "live", autonomy_level: "auto" }, { clock: fixedClock });
    expect(before.status).toBe("needs_agent");
    expect(approvePolicy(db, fixedClock, draft!.policy_id!, "nobody").status).toBe("unauthorised");
    expect(approvePolicy(db, fixedClock, draft!.policy_id!, "U_CTRL")).toMatchObject({ status: "approved", max_amount_cents: 1000000 });
    const after = routeTier0(db, july, { mode: "live", autonomy_level: "auto" }, { clock: fixedClock });
    expect(after).toMatchObject({ status: "done", routes: ["AUTO"], model_calls: 0 });
  });
});

describe("replay: answers hidden, scored in code, humans' inconsistency not held against the agent", () => {
  it("with the policy approved, tier 0 reproduces 5 of 6 human decisions and the sixth is triaged as human_inconsistent", async () => {
    const db = seedInitech();
    seedQ2(db);
    const [draft] = compilePolicies(db, fixedClock, "ar");
    approvePolicy(db, fixedClock, draft!.policy_id!, "U_CTRL");
    const rows = await replay(db, { investigators: [], function: "ar", clock: fixedClock });
    expect(rows.filter((r) => r.diff.agrees)).toHaveLength(5);
    expect(rows.find((r) => r.decision_point_id === "dp4")?.triage).toBe("human_inconsistent");
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM replay_result").get()).toEqual({ n: 6 });

    const ladder = rebuildLadder(db, fixedClock);
    expect(ladder).toEqual([{ function: "ar", kind: "short_pay", agree: 6, n: 6, covered: true, level: "auto" }]);
    expect(autonomyFor(db, "ar", "short_pay")).toBe("auto");
    expect(autonomyFor(db, "ar", "never_seen")).toBe("shadow");
  });

  it("without any policy, tier 0 proposes nothing and every point is a miss, not a guess", async () => {
    const db = seedInitech();
    seedQ2(db);
    const rows = await replay(db, { investigators: [], function: "ar", clock: fixedClock });
    expect(rows.every((r) => !r.diff.agrees)).toBe(true);
  });

  it("the ladder needs rate, count and coverage together for auto", () => {
    expect(levelFor(5, 5, true)).toBe("auto");
    expect(levelFor(5, 5, false)).toBe("review");
    expect(levelFor(4, 4, true)).toBe("review");
    expect(levelFor(7, 10, true)).toBe("shadow");
    expect(levelFor(0, 0, true)).toBe("shadow");
  });
});
