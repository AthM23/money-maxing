import { describe, expect, it } from "vitest";
import { MATERIALITY_CENTS } from "../../contract/types.js";
import type { Db } from "../../runtime/db.js";
import { drawSample } from "../sample.js";
import { bareDb, insertPostedDecision, postApplyPayment, postCreditMemo, postSmallMemos, seedAudit } from "./helpers.js";

const base = { period: "2026-07", size: 2, materiality_cents: MATERIALITY_CENTS };
const ids = (db: Db, seed: string): string[] => drawSample(db, { ...base, seed }).random.map((item) => item.decision_id);

/** Six sub-materiality items on review, so the random stratum has something to choose between. */
const SPECS = [
  { id: "dec_a", amount_cents: 10_000 },
  { id: "dec_b", amount_cents: 11_000 },
  { id: "dec_c", amount_cents: 12_000 },
  { id: "dec_d", amount_cents: 13_000 },
  { id: "dec_e", amount_cents: 14_000 },
  { id: "dec_f", amount_cents: 15_000 },
];

function syntheticDb(order: "asc" | "desc"): Db {
  const db = bareDb();
  const specs = order === "asc" ? SPECS : [...SPECS].reverse();
  for (const spec of specs) insertPostedDecision(db, spec);
  insertPostedDecision(db, { id: "dec_big", amount_cents: 900_000 });
  return db;
}

describe("audit sample: risk-weighted and reproducible", () => {
  it("draws the same sample from the same seed, and a different seed can draw a different one", () => {
    const db = syntheticDb("asc");
    expect(ids(db, "q3-review")).toEqual(ids(db, "q3-review"));
    const drawn = new Set(["s1", "s2", "s3", "s4", "s5"].map((seed) => ids(db, seed).join(",")));
    expect(drawn.size).toBeGreaterThan(1);
  });

  it("does not depend on the order the rows sit in the database", () => {
    expect(drawSample(syntheticDb("asc"), { ...base, seed: "q3-review" }))
      .toEqual(drawSample(syntheticDb("desc"), { ...base, seed: "q3-review" }));
  });

  it("always includes the must-test stratum, whatever the seed, and never samples it twice", () => {
    const db = syntheticDb("asc");
    for (const seed of ["s1", "s2", "s3"]) {
      const sample = drawSample(db, { ...base, seed });
      expect(sample.must_test.map((item) => item.decision_id)).toEqual(["dec_big"]);
      expect(sample.random.map((item) => item.decision_id)).not.toContain("dec_big");
      expect(sample.random).toHaveLength(2);
      expect(sample.population_size).toBe(7);
    }
  });

  it("names why each must-test item was picked", () => {
    const db = seedAudit();
    const payment = postApplyPayment(db);
    const memo = postCreditMemo(db);
    postSmallMemos(db, 3);
    const sample = drawSample(db, { ...base, seed: "q3-review" });
    const reasons = new Map(sample.must_test.map((item) => [item.decision_id, item.reasons]));
    expect([...reasons.keys()].sort()).toEqual([payment, memo].sort());
    expect(reasons.get(payment)?.join(" ")).toContain("model tier 2");
    expect(reasons.get(memo)?.join(" ")).toContain("at or above materiality");
    expect(sample.random.map((item) => item.decision_id)).toHaveLength(2);
  });

  it("must-test picks up an agent-approved decision and a judgment mark below materiality", () => {
    const db = bareDb();
    insertPostedDecision(db, { id: "dec_agent", amount_cents: 1_000 });
    insertPostedDecision(db, { id: "dec_judged", amount_cents: 1_000 });
    insertPostedDecision(db, { id: "dec_plain", amount_cents: 1_000 });
    db.prepare("INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, approved_at) VALUES ('apr_1','dec_agent','agent:controller','controller_agent','approved','2026-07-16T12:00:00Z')").run();
    const marks = JSON.stringify({ stage: "proposal", marks: [{ cls: "J", check: "J3", status: "judgment", detail: "left standing", refs: [] }] });
    db.prepare("INSERT INTO workpaper (id, decision_id, marks_json, kernel_verdict, checkable_num, checkable_den, created_at) VALUES ('wp_1','dec_judged',?,'accept',1,2,'2026-07-16T12:00:00Z')").run(marks);
    const sample = drawSample(db, { ...base, seed: "q3-review", size: 1 });
    expect(sample.must_test.map((item) => item.decision_id)).toEqual(["dec_agent", "dec_judged"]);
    expect(sample.random.map((item) => item.decision_id)).toEqual(["dec_plain"]);
  });
});
