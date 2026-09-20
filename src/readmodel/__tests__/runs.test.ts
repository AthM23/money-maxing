import { describe, expect, it } from "vitest";
import { workedWorld } from "../../../workspace/__tests__/world.js";
import { buildRuns } from "../runs.js";

describe("the run list: one row per case, with who worked it and what it took", () => {
  it("names the customer, lists the workers cheapest first, and adds up lookups, model calls and refusals", async () => {
    const db = await workedWorld();
    const runs = buildRuns(db);
    expect(runs.length).toBeGreaterThanOrEqual(10);
    const main = runs.find((r) => r.docs.includes("INV-3201"))!;
    expect(main.party).toBe("Vossberg Logistik GmbH");
    expect(main.workers[0]).toBe("code");
    expect(main.workers.length).toBeGreaterThan(1);
    expect(main.tool_calls).toBeGreaterThan(0);
    // A case only code touched shows code alone, and no model call or cost.
    const plain = runs.find((r) => r.workers.length === 1 && r.workers[0] === "code")!;
    expect([plain.model_calls, plain.cost_micros]).toEqual([0, 0]);
    // Every case in the month is listed, settled or not.
    expect(new Set(runs.map((r) => r.status)).size).toBeGreaterThan(1);
  });
});
