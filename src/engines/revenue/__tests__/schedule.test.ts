import { describe, expect, it } from "vitest";
import { ratableMonthly, reduceOne, revisePct, sumLines, usd } from "../schedule.js";

const TOTALS = [0, 1, 2, 7, 11, 12, 13, 97, 100, 101, 999, 1_000, 99_991, 1_200_000, 14_400_000, 14_400_001, 12_345_679, 2_147_483_647, 900_000_000_007];
const TERMS: [string, string][] = [
  ["2026-07-01", "2027-06-30"], // 12 whole months
  ["2026-07-01", "2027-07-31"], // 13 whole months
  ["2026-01-01", "2026-01-31"], // one month
  ["2026-01-01", "2026-07-31"], // 7 months (prime)
  ["2026-01-01", "2026-11-30"], // 11 months (prime)
  ["2026-07-15", "2027-07-14"], // mid-month start, a year of days
  ["2026-07-15", "2026-07-20"], // inside one month
  ["2026-03-31", "2026-05-01"], // one-day first and last months
  ["2024-02-01", "2024-02-29"], // leap February, whole
  ["2024-02-10", "2024-03-09"], // leap February, partial
  ["2023-12-17", "2024-03-02"], // across a year end and a leap February
  ["2026-02-01", "2029-01-31"], // 36 months
];

describe("ratableMonthly", () => {
  it("always sums exactly to the total, never goes negative, and has one line per calendar month", () => {
    for (const total of TOTALS) {
      for (const [start, end] of TERMS) {
        const lines = ratableMonthly(total, start, end);
        expect(sumLines(lines), `${total} over ${start}..${end}`).toBe(total);
        expect(lines.every((l) => Number.isSafeInteger(l.amount_cents) && l.amount_cents >= 0)).toBe(true);
        expect(lines[0]!.period).toBe(start.slice(0, 7));
        expect(lines[lines.length - 1]!.period).toBe(end.slice(0, 7));
        expect(new Set(lines.map((l) => l.period)).size).toBe(lines.length);
      }
    }
  });

  it("whole-month terms: equal months, lines differ by at most a cent, the residual lands late", () => {
    expect(ratableMonthly(14_400_000, "2026-07-01", "2027-06-30")).toEqual(
      Array.from({ length: 12 }, (_, i) => ({ period: i < 6 ? `2026-${String(i + 7).padStart(2, "0")}` : `2027-${String(i - 5).padStart(2, "0")}`, amount_cents: 1_200_000 })),
    );
    const odd = ratableMonthly(100, "2026-01-01", "2026-03-31").map((l) => l.amount_cents);
    expect(odd).toEqual([33, 33, 34]);
    const thirteen = ratableMonthly(1_000_000, "2026-07-01", "2027-07-31").map((l) => l.amount_cents);
    expect(thirteen).toHaveLength(13);
    expect(Math.max(...thirteen) - Math.min(...thirteen)).toBeLessThanOrEqual(1);
    expect(ratableMonthly(1, "2026-07-01", "2027-06-30").map((l) => l.amount_cents)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("a partial first or last month prorates by days of service", () => {
    // 17 Jul..16 Aug 2026 is 31 days: 15 in July, 16 in August
    expect(ratableMonthly(3_100, "2026-07-17", "2026-08-16")).toEqual([{ period: "2026-07", amount_cents: 1_500 }, { period: "2026-08", amount_cents: 1_600 }]);
    // leap February: 10 Feb..9 Mar 2024 is 29 days, 20 of them in February
    expect(ratableMonthly(2_900, "2024-02-10", "2024-03-09").map((l) => l.amount_cents)).toEqual([2_000, 900]);
    expect(ratableMonthly(1_000, "2026-07-15", "2026-07-20")).toEqual([{ period: "2026-07", amount_cents: 1_000 }]);
  });

  it("refuses floats, negatives, bad dates, a reversed term, and an amount too large to multiply safely", () => {
    expect(() => ratableMonthly(10.5, "2026-01-01", "2026-12-31")).toThrow(/safe integer/);
    expect(() => ratableMonthly(-1, "2026-01-01", "2026-12-31")).toThrow(/non-negative/);
    expect(() => ratableMonthly(Number.NaN, "2026-01-01", "2026-12-31")).toThrow();
    expect(() => ratableMonthly(100, "2026-02-30", "2026-12-31")).toThrow(/calendar date/);
    expect(() => ratableMonthly(100, "2026-1-1", "2026-12-31")).toThrow(/ISO date/);
    expect(() => ratableMonthly(100, "2026-12-31", "2026-01-01")).toThrow(/before/);
    expect(() => ratableMonthly(Number.MAX_SAFE_INTEGER, "2026-01-01", "2026-12-31")).toThrow(/overflows/);
  });
});

describe("revisePct and reduceOne", () => {
  const lines = ratableMonthly(14_400_000, "2026-07-01", "2027-06-30");

  it("10% off every open month: 12 x $10,800 = $129,600", () => {
    const v2 = revisePct(lines, "2026-07", "2027-06", 1_000, new Set());
    expect(v2.every((l) => l.amount_cents === 1_080_000)).toBe(true);
    expect(sumLines(v2)).toBe(12_960_000);
    expect(lines.every((l) => l.amount_cents === 1_200_000)).toBe(true); // the input is not mutated
  });

  it("never touches a recognised month or a month outside the window", () => {
    const v2 = revisePct(lines, "2026-08", "2026-12", 1_000, ["2026-09"]);
    expect(v2.map((l) => l.amount_cents)).toEqual([1_200_000, 1_080_000, 1_200_000, 1_080_000, 1_080_000, 1_080_000, 1_200_000, 1_200_000, 1_200_000, 1_200_000, 1_200_000, 1_200_000]);
  });

  it("the reduction is floored per line, so a revised line is never negative for any bps", () => {
    for (const total of TOTALS.filter((t) => t < 1e11)) {
      const base = ratableMonthly(total, "2026-07-01", "2027-07-31");
      for (const bps of [0, 1, 333, 1_000, 9_999, 10_000]) {
        const v2 = revisePct(base, "2026-07", "2027-07", bps, new Set());
        expect(v2.every((l, i) => l.amount_cents >= 0 && l.amount_cents <= base[i]!.amount_cents)).toBe(true);
        if (bps === 0) expect(sumLines(v2)).toBe(total);
        if (bps === 10_000) expect(sumLines(v2)).toBe(0);
      }
    }
    expect(revisePct([{ period: "2026-07", amount_cents: 999 }], "2026-07", "2026-07", 1_000, [])[0]!.amount_cents).toBe(900); // floor(99.9) = 99 off
    expect(() => revisePct(lines, "2026-07", "2027-06", 10.5, [])).toThrow(/bps/);
    expect(() => revisePct(lines, "2026-07", "2027-06", 10_001, [])).toThrow(/bps/);
  });

  it("reduceOne takes cents off one month only, and refuses to go below zero or to invent a month", () => {
    const v2 = reduceOne(lines, "2026-07", 120_000);
    expect(v2[0]).toEqual({ period: "2026-07", amount_cents: 1_080_000 });
    expect(sumLines(v2)).toBe(14_280_000);
    expect(() => reduceOne(lines, "2026-07", 1_200_001)).toThrow(/only/);
    expect(() => reduceOne(lines, "2025-01", 1)).toThrow(/no line/);
    expect(() => reduceOne(lines, "2026-07", 0.5)).toThrow(/safe integer/);
  });

  it("formats cents without a float", () => {
    expect(usd(14_400_000)).toBe("$144,000.00");
    expect(usd(-120_005)).toBe("-$1,200.05");
    expect(usd(7)).toBe("$0.07");
  });
});
