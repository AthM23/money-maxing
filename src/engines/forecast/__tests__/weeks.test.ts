import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayInPeriod, horizon, horizonEnd, periodsBetween, weekOf } from "../weeks.js";

describe("weeks", () => {
  it("starts weeks on Monday, in UTC", () => {
    expect(weekOf("2026-07-14")).toBe("2026-07-13"); // a Tuesday
    expect(weekOf("2026-07-13")).toBe("2026-07-13"); // the Monday itself
    expect(weekOf("2026-07-19")).toBe("2026-07-13"); // Sunday closes the week
    expect(weekOf("2026-07-20")).toBe("2026-07-20");
    expect(weekOf("2027-01-01")).toBe("2026-12-28"); // across a year end
  });

  it("gives 13 consecutive week starts from the week containing the as-of date", () => {
    const weeks = horizon("2026-07-14");
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toBe("2026-07-13");
    expect(weeks[12]).toBe("2026-10-05");
    expect(horizonEnd(weeks)).toBe("2026-10-11");
    weeks.slice(1).forEach((w, i) => expect(w).toBe(addDays(weeks[i]!, 7)));
  });

  it("adds days and months across month and year ends", () => {
    expect(addDays("2026-08-01", 30)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(periodsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("pulls a day of month back to the month's last day", () => {
    expect(dayInPeriod("2026-08", 5)).toBe("2026-08-05");
    expect(dayInPeriod("2026-09", 31)).toBe("2026-09-30");
    expect(dayInPeriod("2028-02", 30)).toBe("2028-02-29");
  });

  it("refuses anything that is not an ISO date", () => {
    expect(() => weekOf("14/07/2026")).toThrow();
    expect(() => addDays("2026-02-30T00:00:00Z", 1)).toThrow();
  });
});
