import { describe, expect, it } from "vitest";
import { evaluateCondition } from "../index.js";
import type { Condition } from "../types.js";

const features = {
  shortfall_cents: 120_000,
  method: "credit_memo",
  party_id: "cust:initech",
  escalated: false,
};

describe("evaluateCondition leaf operators", () => {
  const cases: Array<[Condition, boolean, string]> = [
    [{ field: "method", op: "==", value: "credit_memo" }, true, "== on a matching string"],
    [{ field: "method", op: "==", value: "write_off" }, false, "== on a different string"],
    [{ field: "escalated", op: "==", value: false }, true, "== on a boolean"],
    [{ field: "method", op: "!=", value: "write_off" }, true, "!= on a different string"],
    [{ field: "method", op: "!=", value: "credit_memo" }, false, "!= on a matching string"],
    [{ field: "shortfall_cents", op: "<=", value: 120_000 }, true, "<= at the boundary"],
    [{ field: "shortfall_cents", op: "<", value: 120_000 }, false, "< at the boundary"],
    [{ field: "shortfall_cents", op: ">=", value: 120_000 }, true, ">= at the boundary"],
    [{ field: "shortfall_cents", op: ">", value: 119_999 }, true, "> just under"],
    [{ field: "shortfall_cents", op: ">", value: 120_000 }, false, "> at the boundary"],
    [{ field: "method", op: "in", value: ["credit_memo", "write_off"] }, true, "in a list that contains it"],
    [{ field: "method", op: "in", value: ["write_off"] }, false, "in a list that does not"],
    [{ field: "party_id", op: "<=", value: "cust:z" }, true, "string ordering"],
  ];

  for (const [cond, expected, label] of cases) {
    it(`${expected ? "holds" : "does not hold"}: ${label}`, () => {
      expect(evaluateCondition(cond, features)).toBe(expected);
    });
  }
});

describe("evaluateCondition combinators", () => {
  const holds: Condition = { field: "method", op: "==", value: "credit_memo" };
  const fails: Condition = { field: "method", op: "==", value: "write_off" };

  it("all requires every child", () => {
    expect(evaluateCondition({ all: [holds, holds] }, features)).toBe(true);
    expect(evaluateCondition({ all: [holds, fails] }, features)).toBe(false);
  });

  it("any requires one child", () => {
    expect(evaluateCondition({ any: [fails, holds] }, features)).toBe(true);
    expect(evaluateCondition({ any: [fails, fails] }, features)).toBe(false);
  });

  it("nests all inside any", () => {
    const cond: Condition = {
      any: [{ all: [holds, { field: "shortfall_cents", op: "<=", value: 200_000 }] }, fails],
    };
    expect(evaluateCondition(cond, features)).toBe(true);
  });

  it("treats an empty all as true and an empty any as false", () => {
    expect(evaluateCondition({ all: [] }, features)).toBe(true);
    expect(evaluateCondition({ any: [] }, features)).toBe(false);
  });
});

describe("evaluateCondition on input it cannot evaluate", () => {
  it("returns false for an unknown field rather than throwing", () => {
    expect(evaluateCondition({ field: "nope", op: "==", value: 1 }, features)).toBe(false);
    expect(evaluateCondition({ field: "nope", op: "!=", value: 1 }, features)).toBe(false);
    expect(evaluateCondition({ field: "nope", op: ">", value: 1 }, features)).toBe(false);
    expect(evaluateCondition({ field: "nope", op: "in", value: [1, 2] }, features)).toBe(false);
  });

  it("returns false on an empty feature set", () => {
    expect(evaluateCondition({ field: "method", op: "==", value: "credit_memo" }, {})).toBe(false);
  });

  it("returns false when the two sides are not comparable", () => {
    expect(evaluateCondition({ field: "method", op: "<", value: 5 }, features)).toBe(false);
    expect(evaluateCondition({ field: "shortfall_cents", op: ">", value: "big" }, features)).toBe(false);
    expect(evaluateCondition({ field: "escalated", op: ">=", value: false }, features)).toBe(false);
  });

  it("returns false rather than throwing on shapes outside the rule language", () => {
    const junk = [
      { field: "method", op: "==", value: ["credit_memo"] },
      { field: 7, op: "==", value: 7 },
      { field: "method", op: "~=", value: "credit_memo" },
      null,
    ];
    for (const cond of junk) {
      expect(evaluateCondition(cond as unknown as Condition, features)).toBe(false);
    }
  });

  it("does not read inherited object properties as features", () => {
    expect(evaluateCondition({ field: "toString", op: "!=", value: "x" }, features)).toBe(false);
  });
});
