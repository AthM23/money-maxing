import { describe, expect, it } from "vitest";
import type { CaseRow } from "../cases.js";
import { computeMetrics } from "../metrics.js";
import type { CaseOutcome } from "../sut.js";

function makeRow(overrides: Partial<CaseRow> & Pick<CaseRow, "id" | "expected_route">): CaseRow {
  return {
    section: "bank-rec",
    title: "test case",
    route_qualifier: undefined,
    tier: "T1",
    pack: "bank-rec",
    min_fixture: false,
    in_spec_scope: true,
    status: "todo",
    ...overrides,
  };
}

describe("computeMetrics: empty input never produces NaN", () => {
  it("returns null ratios and a null cost, not NaN", () => {
    const metrics = computeMetrics([], new Map());
    expect(metrics.cases_total).toBe(0);
    expect(metrics.cases_run).toBe(0);
    expect(metrics.auto_clear_rate).toEqual({ k: 0, n: 0, value: null });
    expect(metrics.auto_clear_precision).toEqual({ k: 0, n: 0, value: null });
    expect(metrics.exception_recall).toEqual({ k: 0, n: 0, value: null });
    expect(metrics.false_auto_posts).toBe(0);
    expect(metrics.cost_per_1000_usd).toBeNull();
    expect(metrics.out_of_scope.accuracy).toEqual({ k: 0, n: 0, value: null });
    expect(metrics.accuracy_by_route).toEqual({});
    expect(JSON.stringify(metrics)).not.toMatch(/NaN/);
  });
});

describe("computeMetrics: a small hand-checked scenario", () => {
  const rows: CaseRow[] = [
    makeRow({ id: "R1", expected_route: "AUTO", tier: "T1", pack: "ap", in_spec_scope: true }),
    makeRow({ id: "R2", expected_route: "AUTO", tier: "T1", pack: "ap", in_spec_scope: true }),
    makeRow({ id: "R3", expected_route: "ESCALATE", tier: "T2", pack: "bank-rec", in_spec_scope: true }),
    makeRow({ id: "R4", expected_route: "ESCALATE", tier: "T2", pack: "bank-rec", in_spec_scope: false }),
    makeRow({ id: "R5", expected_route: "PROPOSE", tier: "T1", pack: "ar", in_spec_scope: true }),
    makeRow({ id: "R6", expected_route: "INVARIANT", tier: "T1", pack: "platform", in_spec_scope: true }),
  ];

  const outcomes = new Map<string, CaseOutcome>([
    ["R1", { case_id: "R1", route: "AUTO", auto_posted_entry_matches_key: true, cost_micros: 1000 }],
    ["R2", { case_id: "R2", route: "PROPOSE", cost_micros: 2000 }],
    ["R3", { case_id: "R3", route: "ESCALATE", escalate_unknown: "vendor", cost_micros: 3000 }],
    ["R4", { case_id: "R4", route: "AUTO", cost_micros: 500 }], // expected ESCALATE -> false auto-post
    ["R5", { case_id: "R5", route: "NOT_RUN" }],
    // R6 is INVARIANT: no outcome needed, excluded from grading entirely.
  ]);

  const metrics = computeMetrics(rows, outcomes);

  it("counts total and run cases, excluding the invariant", () => {
    expect(metrics.cases_total).toBe(5);
    expect(metrics.cases_run).toBe(4);
  });

  it("computes auto-clear rate over cases that ran", () => {
    expect(metrics.auto_clear_rate).toEqual({ k: 2, n: 4, value: 0.5 });
  });

  it("computes auto-clear precision over AUTO outcomes that ran", () => {
    expect(metrics.auto_clear_precision).toEqual({ k: 1, n: 2, value: 0.5 });
  });

  it("flags exactly the one false auto-post", () => {
    expect(metrics.false_auto_posts).toBe(1);
  });

  it("computes exception recall over ran exceptions", () => {
    expect(metrics.exception_recall).toEqual({ k: 1, n: 2, value: 0.5 });
  });

  it("computes cost per 1000 in dollars, 2 decimals", () => {
    expect(metrics.cost_per_1000_usd).toBe(1.63);
  });

  it("breaks accuracy down by route, pack and tier over all graded cases", () => {
    expect(metrics.accuracy_by_route.AUTO).toEqual({ k: 1, n: 2, value: 0.5 });
    expect(metrics.accuracy_by_route.ESCALATE).toEqual({ k: 1, n: 2, value: 0.5 });
    expect(metrics.accuracy_by_route.PROPOSE).toEqual({ k: 0, n: 1, value: 0 });
    expect(metrics.accuracy_by_pack.ap).toEqual({ k: 1, n: 2, value: 0.5 });
    expect(metrics.accuracy_by_pack["bank-rec"]).toEqual({ k: 1, n: 2, value: 0.5 });
    expect(metrics.accuracy_by_pack.ar).toEqual({ k: 0, n: 1, value: 0 });
    expect(metrics.accuracy_by_tier.T1).toEqual({ k: 1, n: 3, value: 1 / 3 });
    expect(metrics.accuracy_by_tier.T2).toEqual({ k: 1, n: 2, value: 0.5 });
  });

  it("builds a confusion matrix that includes a NOT_RUN column", () => {
    const { counts } = metrics.confusion_matrix;
    expect(counts.AUTO.AUTO).toBe(1);
    expect(counts.AUTO.PROPOSE).toBe(1);
    expect(counts.ESCALATE.ESCALATE).toBe(1);
    expect(counts.ESCALATE.AUTO).toBe(1);
    expect(counts.PROPOSE.NOT_RUN).toBe(1);
    expect(counts.BLOCK.AUTO).toBe(0);
  });

  it("reports the out-of-scope row separately", () => {
    expect(metrics.out_of_scope.accuracy).toEqual({ k: 0, n: 1, value: 0 });
    expect(metrics.out_of_scope.cases).toHaveLength(1);
    expect(metrics.out_of_scope.cases[0]?.case_id).toBe("R4");
  });

  it("reports the invariant row separately, not scored", () => {
    expect(metrics.invariants).toHaveLength(1);
    expect(metrics.invariants[0]?.case_id).toBe("R6");
  });
});
