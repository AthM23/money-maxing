import { describe, expect, it } from "vitest";
import type { CaseRow } from "../cases.js";
import { gradeAll, gradeCase, isFalseAutoPost } from "../grade.js";
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

describe("gradeCase: route matching", () => {
  it("is correct when a no-obligation route matches (AUTO)", () => {
    const row = makeRow({ id: "X-1", expected_route: "AUTO" });
    expect(gradeCase(row, { case_id: "X-1", route: "AUTO" }).verdict).toBe("correct");
  });

  it("is incorrect when the route doesn't match", () => {
    const row = makeRow({ id: "X-2", expected_route: "PROPOSE" });
    const grade = gradeCase(row, { case_id: "X-2", route: "ESCALATE" });
    expect(grade.verdict).toBe("incorrect");
    expect(grade.reason).toMatch(/expected PROPOSE, got ESCALATE/);
  });

  it("throws if asked to grade an INVARIANT row directly", () => {
    const row = makeRow({ id: "X-3", expected_route: "INVARIANT" });
    expect(() => gradeCase(row, { case_id: "X-3", route: "NOT_RUN" })).toThrow(/INVARIANT/);
  });
});

describe("gradeCase: a false auto-post is never correct", () => {
  it("grades a matching AUTO as incorrect when the posted entry differs from the key", () => {
    const row = makeRow({ id: "X-9", expected_route: "AUTO" });
    const grade = gradeCase(row, { case_id: "X-9", route: "AUTO", auto_posted_entry_matches_key: false });
    expect(grade.verdict).toBe("incorrect");
    expect(grade.is_false_auto_post).toBe(true);
    expect(grade.reason).toContain("differs from the answer key");
  });
});

describe("gradeCase: route obligations", () => {
  it("BLOCK requires a non-empty block_rule", () => {
    const row = makeRow({ id: "X-4", expected_route: "BLOCK" });
    expect(gradeCase(row, { case_id: "X-4", route: "BLOCK" }).verdict).toBe("incorrect");
    expect(gradeCase(row, { case_id: "X-4", route: "BLOCK", block_rule: "DUPLICATE_PAYMENT" }).verdict).toBe(
      "correct",
    );
  });

  it("REFUSE requires a non-empty refuse_places_looked", () => {
    const row = makeRow({ id: "X-5", expected_route: "REFUSE" });
    expect(gradeCase(row, { case_id: "X-5", route: "REFUSE" }).verdict).toBe("incorrect");
    expect(gradeCase(row, { case_id: "X-5", route: "REFUSE", refuse_places_looked: [] }).verdict).toBe("incorrect");
    expect(
      gradeCase(row, { case_id: "X-5", route: "REFUSE", refuse_places_looked: ["bank portal"] }).verdict,
    ).toBe("correct");
  });

  it("ESCALATE requires a non-empty escalate_unknown", () => {
    const row = makeRow({ id: "X-6", expected_route: "ESCALATE" });
    expect(gradeCase(row, { case_id: "X-6", route: "ESCALATE" }).verdict).toBe("incorrect");
    expect(
      gradeCase(row, { case_id: "X-6", route: "ESCALATE", escalate_unknown: "vendor identity" }).verdict,
    ).toBe("correct");
  });
});

describe("isFalseAutoPost", () => {
  it("flags an AUTO where expected is not AUTO", () => {
    expect(isFalseAutoPost("ESCALATE", { case_id: "x", route: "AUTO" })).toBe(true);
  });

  it("flags a matching AUTO whose posted entry doesn't match the key", () => {
    const outcome: CaseOutcome = { case_id: "x", route: "AUTO", auto_posted_entry_matches_key: false };
    expect(isFalseAutoPost("AUTO", outcome)).toBe(true);
  });

  it("does not flag a matching AUTO when the key check is merely absent", () => {
    expect(isFalseAutoPost("AUTO", { case_id: "x", route: "AUTO" })).toBe(false);
  });

  it("never flags a non-AUTO actual route", () => {
    expect(isFalseAutoPost("AUTO", { case_id: "x", route: "PROPOSE" })).toBe(false);
    expect(isFalseAutoPost("AUTO", { case_id: "x", route: "NOT_RUN" })).toBe(false);
  });
});

describe("gradeCase: NOT_RUN", () => {
  it("is neither correct nor a false auto-post", () => {
    const row = makeRow({ id: "X-7", expected_route: "AUTO" });
    const grade = gradeCase(row, { case_id: "X-7", route: "NOT_RUN" });
    expect(grade.verdict).toBe("not_run");
    expect(grade.is_false_auto_post).toBe(false);
  });
});

describe("gradeAll", () => {
  it("reports INVARIANT rows separately and never grades them as routes", () => {
    const rows = [makeRow({ id: "INV-1", expected_route: "INVARIANT" }), makeRow({ id: "R-1", expected_route: "AUTO" })];
    const outcomes = new Map<string, CaseOutcome>([["R-1", { case_id: "R-1", route: "AUTO" }]]);
    const { graded, invariants } = gradeAll(rows, outcomes);
    expect(invariants.map((r) => r.id)).toEqual(["INV-1"]);
    expect(graded.map((g) => g.case_id)).toEqual(["R-1"]);
  });

  it("defaults a missing outcome to NOT_RUN", () => {
    const rows = [makeRow({ id: "R-2", expected_route: "PROPOSE" })];
    const { graded } = gradeAll(rows, new Map());
    expect(graded[0]?.verdict).toBe("not_run");
  });
});
