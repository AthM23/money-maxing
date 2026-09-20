import { describe, expect, it } from "vitest";
import { loadCases, loadCasesFromText } from "../cases.js";

const HEADER_LINE = "id,section,title,expected_route,route_qualifier,tier,pack,min_fixture,in_spec_scope,status";

describe("loadCases (real corpus)", () => {
  it("loads all 115 rows", () => {
    expect(loadCases()).toHaveLength(115);
  });

  it("matches the documented expected_route distribution", () => {
    const counts: Record<string, number> = {};
    for (const row of loadCases()) {
      counts[row.expected_route] = (counts[row.expected_route] ?? 0) + 1;
    }
    expect(counts).toEqual({
      ESCALATE: 39,
      PROPOSE: 26,
      AUTO: 18,
      BLOCK: 15,
      REFUSE: 12,
      INVARIANT: 5,
    });
  });

  it("has exactly 22 min_fixture rows", () => {
    expect(loadCases().filter((row) => row.min_fixture)).toHaveLength(22);
  });

  it("turns yes/no columns into booleans", () => {
    const a01 = loadCases().find((row) => row.id === "A-01");
    expect(a01?.min_fixture).toBe(true);
    expect(a01?.in_spec_scope).toBe(true);
  });
});

describe("loadCasesFromText (malformed input)", () => {
  it("rejects a row with the wrong number of fields, naming the line", () => {
    const text = `${HEADER_LINE}\nA-01,bank-rec,"Deposit in transit",AUTO,,T1,bank-rec,yes,yes\n`;
    expect(() => loadCasesFromText(text)).toThrow(/line 2/);
  });

  it("rejects an unknown expected_route value, naming the line", () => {
    const text = `${HEADER_LINE}\nA-01,bank-rec,"Deposit in transit",MAYBE,,T1,bank-rec,yes,yes,todo\n`;
    expect(() => loadCasesFromText(text)).toThrow(/line 2/);
  });

  it("rejects a header that doesn't match the expected columns", () => {
    const text = "id,title\nA-01,Deposit\n";
    expect(() => loadCasesFromText(text)).toThrow(/header/i);
  });
});
