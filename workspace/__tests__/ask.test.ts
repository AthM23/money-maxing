import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ask, runTool } from "../ask.js";
import { HttpError } from "../http.js";
import { TOOLS } from "../tools.js";
import { workedWorld } from "./world.js";

const PERIOD = "2026-07";

describe("the books as tools: one registry for the Ask page, its agent, and an MCP client", () => {
  it("every tool runs read-only on a worked month and returns a title, a sentence and integer cents", async () => {
    const db = await workedWorld();
    const before = db.prepare("SELECT (SELECT COUNT(*) FROM decision) + (SELECT COUNT(*) FROM gl_line) + (SELECT COUNT(*) FROM event) AS n").get();
    for (const t of TOOLS) {
      const result = runTool(db, t.name, t.name === "explain_receipt" ? { customer: "Vossberg" } : {}, PERIOD);
      expect(result.title.length).toBeGreaterThan(3);
      expect(result.summary.length).toBeGreaterThan(3);
      for (const row of result.table?.rows ?? []) for (const i of result.table!.money_columns) expect(row[i] === null || Number.isInteger(row[i])).toBe(true);
    }
    expect(db.prepare("SELECT (SELECT COUNT(*) FROM decision) + (SELECT COUNT(*) FROM gl_line) + (SELECT COUNT(*) FROM event) AS n").get()).toEqual(before);
  });

  it("explaining a receipt picks the case still open, not the customer's oldest, and states the subtotals itself", async () => {
    const db = await workedWorld();
    const r = runTool(db, "explain_receipt", { customer: "Vossberg" }, PERIOD);
    expect(r.title).toBe("Vossberg Logistik GmbH: $4,200.00 short");
    expect(r.summary).toContain("Of the $4,200.00 shortfall, $2,000.00 is explained and posted and $2,200.00 is still open.");
    expect(r.table?.rows.map((row) => row[2])).toEqual([10580000, 4000, 196000, 220000]);
    expect(runTool(db, "explain_receipt", { customer: "Nobody Ltd" }, PERIOD).table).toBeNull();
  });

  it("refuses a tool that does not exist and input that is not what the tool takes", async () => {
    const db = await workedWorld();
    expect(() => runTool(db, "drop_tables", {}, PERIOD)).toThrow(HttpError);
    expect(() => runTool(db, "explain_receipt", { customer: "x" }, PERIOD)).toThrow(/customer/);
  });
});

describe("asking in words", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = ""; });
  afterEach(() => { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; });

  it("in code mode a question is matched to a tool by its words, for free", async () => {
    const db = await workedWorld();
    const tools = async (q: string): Promise<string[]> => (await ask(db, q, PERIOD, "code")).used.map((u) => u.tool);
    expect(await tools("Who owes us money, and how late is it?")).toEqual(["ar_ageing"]);
    expect(await tools("Why is Vossberg short?")).toEqual(["explain_receipt"]);
    expect(await tools("Show me the trial balance")).toEqual(["trial_balance"]);
    expect(await tools("What needs me?")).toEqual(["waiting_on_people"]);
    const none = await ask(db, "sing me a song", PERIOD, "code");
    expect(none.used).toEqual([]);
    expect(none.text).toContain("ar ageing");
    expect(none.usage).toBeNull();
  });

  it("the agent says plainly that it cannot run without a key, rather than failing some other way", async () => {
    const db = await workedWorld();
    await expect(ask(db, "Why is Vossberg short?", PERIOD, "claude-haiku-4-5")).rejects.toThrow(/No ANTHROPIC_API_KEY/);
  });
});

describe("asked to do something, the Ask page hands it to a person and changes nothing", () => {
  it("in code mode: approving, running and closing each get a button to where a person does it, and questions are still answered", async () => {
    const { ask } = await import("../ask.js");
    const { workedWorld } = await import("./world.js");
    const db = await workedWorld();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM decision").get() as { n: number }).n;
    expect((await ask(db, "approve the Vossberg credit memo", "2026-07", "code")).handoffs).toEqual([{ to: "input_needed", why: "Decisions are made by a person, with the evidence in front of them." }]);
    expect((await ask(db, "run the code tier", "2026-07", "code")).handoffs.map((x) => x.to)).toEqual(["run_code_tier"]);
    expect((await ask(db, "close the month", "2026-07", "code")).handoffs.map((x) => x.to)).toEqual(["close"]);
    // A question about closing is a question: it gets the report, not a hand-off.
    const asked = await ask(db, "Can we close the month?", "2026-07", "code");
    expect([asked.handoffs, asked.used.map((u) => u.tool)]).toEqual([[], ["close_status"]]);
    expect((db.prepare("SELECT COUNT(*) AS n FROM decision").get() as { n: number }).n).toBe(before);
  });
});
