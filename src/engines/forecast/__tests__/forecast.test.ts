import { beforeEach, describe, expect, it } from "vitest";
import type { ToolEnv } from "../../../agents/env.js";
import { emit } from "../../../bus/bus.js";
import { openWorldDb, type Db } from "../../../ledger/db.js";
import { trialBalance } from "../../../ledger/read.js";
import { seedLocal } from "../../../seed/local.js";
import { buildForecast, diffVersions, ensureBaseline, forecastLines, forecastOnce, getForecast, horizon, FORECAST_TOOL_SPECS, type ForecastLine } from "../index.js";
import { AS_OF, INITECH, INTENT, WORLD, clock, emitInitechRevision, events, initechBilling, writeAllSchedules } from "./helpers.js";

let db: Db;
beforeEach(() => {
  db = openWorldDb();
  seedLocal(db, WORLD);
});

describe("buildForecast", () => {
  it("covers exactly 13 Monday weeks and opens on GL cash", () => {
    writeAllSchedules(db);
    const f = buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock);
    const lines = forecastLines(db, f.as_of);
    const glCash = trialBalance(db, AS_OF).find((r) => r.account === "1000")!.balance_cents;

    expect(f.as_of).toBe("2026-07-14/v1");
    expect(new Set(f.weeks.map((w) => w.week)).size).toBe(13);
    expect(f.weeks.map((w) => w.week)).toEqual(horizon(AS_OF));
    for (const l of lines) expect(horizon(AS_OF)).toContain(l.week);
    expect(glCash).toBeGreaterThan(0);
    expect(f.opening_cash_cents).toBe(glCash);
    expect(lines.filter((l) => l.kind === "opening_cash")).toMatchObject([{ week: "2026-07-13", source_ref: "gl:1000", amount_cents: glCash }]);
    expect(f.not_modelled).toEqual(["payroll"]);
  });

  it("foots: lines sum to the weekly totals, weeks chain, and the version row says the same", () => {
    writeAllSchedules(db);
    const f = buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock);
    const flows = forecastLines(db, f.as_of).filter((l) => l.kind !== "opening_cash");
    let running = f.opening_cash_cents;
    for (const w of f.weeks) {
      const sum = flows.filter((l) => l.week === w.week).reduce((n, l) => n + l.amount_cents, 0);
      expect(sum).toBe(w.inflow_cents - w.outflow_cents);
      expect(w.net_cents).toBe(sum);
      expect(w.opening_cents).toBe(running);
      running += sum;
      expect(w.closing_cents).toBe(running);
    }
    expect(f.closing_cash_cents).toBe(running);
    expect(f.min_cash_cents).toBe(Math.min(...f.weeks.map((w) => w.closing_cents)));
    expect(f.weeks.find((w) => w.closing_cents === f.min_cash_cents)!.week).toBe(f.min_cash_week);
    for (const l of forecastLines(db, f.as_of)) expect(Number.isInteger(l.amount_cents)).toBe(true);
    expect(f.inflow_cents).toBeGreaterThan(0);
    expect(f.outflow_cents).toBeGreaterThan(0);

    const row = db.prepare("SELECT * FROM forecast_version WHERE as_of = ?").get(f.as_of) as Record<string, unknown>;
    expect(row).toMatchObject({
      as_of_date: AS_OF, version: 1, reason: "baseline", built_at: clock.now(), cause_event_id: null, opening_cash_cents: f.opening_cash_cents,
      inflow_cents: f.inflow_cents, outflow_cents: f.outflow_cents, min_cash_cents: f.min_cash_cents, min_cash_week: f.min_cash_week,
    });
    expect(getForecast(db, f.as_of)).toEqual(f);
  });

  it("writes a new version every call and leaves the old one alone", () => {
    const v1 = buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock);
    const before = forecastLines(db, v1.as_of);
    const v2 = buildForecast(db, { as_of_date: AS_OF, reason: "again" }, clock);
    expect([v1.version, v2.version, v2.as_of]).toEqual([1, 2, "2026-07-14/v2"]);
    expect(forecastLines(db, v1.as_of)).toEqual(before);
    expect(buildForecast(db, { as_of_date: "2026-07-21", reason: "next week" }, clock).as_of).toBe("2026-07-21/v1");
    expect(diffVersions(db, v1.as_of, v2.as_of)).toMatchObject({ delta_inflow_cents: 0, delta_closing_cents: 0, changed_weeks: [], by_source_ref: [] });
  });

  it("bills from the active schedule, and from the contract terms when no schedule exists", () => {
    const standalone = buildForecast(db, { as_of_date: AS_OF, reason: "no schedules" }, clock);
    writeAllSchedules(db);
    const scheduled = buildForecast(db, { as_of_date: AS_OF, reason: "v1 schedules" }, clock);
    const billing = (asOf: string): Array<[string, string, number]> =>
      forecastLines(db, asOf).filter((l) => l.kind === "ar_scheduled_billing").map((l) => [l.source_ref, l.week, l.amount_cents]);
    expect(billing(scheduled.as_of)).toEqual(billing(standalone.as_of));
    // July is invoiced (INV-1042), so August is the first billing to come: 1 Aug + 30 days, then 1 Sep + 30 days; 31 Oct is past week 13
    expect(initechBilling(forecastLines(db, scheduled.as_of)).map((l) => [l.source_ref, l.week, l.amount_cents])).toEqual([
      [`${INITECH}:2026-08`, "2026-08-31", 1_200_000],
      [`${INITECH}:2026-09`, "2026-09-28", 1_200_000],
    ]);
    expect(forecastLines(db, scheduled.as_of).some((l) => l.source_ref.startsWith("CTR-initech-2025:"))).toBe(false);
  });

  it("puts overdue documents in week 1, keeps held bills, drops disputed invoices", () => {
    const insertInvoice = db.prepare("INSERT INTO invoice (id, party_id, contract_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, 'acme', NULL, ?, ?, ?, ?, ?)");
    insertInvoice.run("INV-T-overdue", "2026-05-20", "2026-06-19", 50_000, 50_000, "open");
    insertInvoice.run("INV-T-disputed", "2026-07-01", "2026-07-31", 70_000, 70_000, "disputed");
    insertInvoice.run("INV-T-far", "2026-10-01", "2026-12-01", 90_000, 90_000, "open");
    db.prepare("INSERT INTO bill (id, party_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status) VALUES ('BILL-T-held', 'observa', 'T-1', '2026-06-01', '2026-07-01', NULL, 40000, 40000, 'held')").run();
    const lines = forecastLines(db, buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock).as_of);
    const bySource = (ref: string): ForecastLine | undefined => lines.find((l) => l.source_ref === ref);
    expect(bySource("INV-T-overdue")).toMatchObject({ week: "2026-07-13", kind: "ar_open_invoice", amount_cents: 50_000 });
    expect(bySource("BILL-T-held")).toMatchObject({ week: "2026-07-13", kind: "ap_open_bill", amount_cents: -40_000 });
    expect(bySource("INV-T-disputed")).toBeUndefined();
    expect(bySource("INV-T-far")).toBeUndefined();
    expect(bySource("INV-1042")).toMatchObject({ week: "2026-07-27", amount_cents: 1_200_000 });
    expect(bySource("BILL-07-nimbus-cloud")).toMatchObject({ week: "2026-08-03", amount_cents: -1_840_000 });
  });

  it("projects monthly vendors forward from their latest bill", () => {
    db.prepare("INSERT INTO party (id, kind, name) VALUES ('one-off-vendor', 'vendor', 'One-off Vendor')").run();
    db.prepare("INSERT INTO bill (id, party_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status) VALUES ('BILL-T-once', 'one-off-vendor', 'T-2', '2026-07-05', '2026-08-04', '2026-07', 99000, 99000, 'open')").run();
    const recurring = forecastLines(db, buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock).as_of).filter((l) => l.kind === "ap_recurring");
    expect(recurring.filter((l) => l.source_ref.startsWith("nimbus-cloud:")).map((l) => [l.source_ref, l.week, l.amount_cents])).toEqual([
      ["nimbus-cloud:2026-08", "2026-08-31", -1_840_000], // billed 5 Aug, due 4 Sep
      ["nimbus-cloud:2026-09", "2026-10-05", -1_840_000], // billed 5 Sep, due 5 Oct; October's bill falls due 4 Nov, past week 13
    ]);
    expect(recurring.some((l) => l.source_ref.startsWith("one-off-vendor:"))).toBe(false);
  });

  it("cites the modification's fact only when that fact exists", () => {
    writeAllSchedules(db);
    const insertMod = db.prepare(
      `INSERT INTO contract_modification (id, contract_id, cause_decision_id, treatment, pct_off_bps, effective_period, until, memo_cents, memo_account, delta_total_cents, from_version, to_version, fact_id, created_at)
       VALUES (?, ?, ?, 'prospective', 1000, '2026-07', ?, 120000, '2400', -1440000, 1, 2, ?, ?)`,
    );
    insertMod.run("mod_missing", INITECH, "dec_a", "2027-06-30", "fact_never_stored", "2026-09-19T10:00:00Z");
    const missing = buildForecast(db, { as_of_date: AS_OF, reason: "fact row absent" }, clock);
    expect(initechBilling(forecastLines(db, missing.as_of)).map((l) => l.fact_id)).toEqual([null, null]);

    db.prepare(
      `INSERT INTO fact (id, party_id, predicate, value_json, scope_json, valid_from, valid_to, learned_at, source_trace_ids_json, stated_by, status)
       VALUES ('fact_initech', 'initech', 'concession', '{}', '{}', '2026-07-01', '2026-08-31', '2026-07-10T00:00:00Z', '[]', 'U_SAM', 'active')`,
    ).run();
    insertMod.run("mod_real", INITECH, "dec_b", "2026-08-31", "fact_initech", "2026-09-19T11:00:00Z");
    const cited = buildForecast(db, { as_of_date: AS_OF, reason: "fact row present" }, clock);
    // the modification runs through August only, so September's billing carries no fact
    expect(initechBilling(forecastLines(db, cited.as_of)).map((l) => [l.source_ref, l.fact_id])).toEqual([[`${INITECH}:2026-08`, "fact_initech"], [`${INITECH}:2026-09`, null]]);
  });
});

describe("forecastOnce", () => {
  it("builds version 2 on rev.schedule.revised and reports the drop", async () => {
    writeAllSchedules(db);
    const base = ensureBaseline(db, AS_OF, clock); // the baseline predates the revision, as it does when the engine runs continuously
    const eventId = emitInitechRevision(db);

    const updates = await forecastOnce(db, clock, { as_of_date: AS_OF });
    expect(updates).toHaveLength(1);
    const v2 = getForecast(db, "2026-07-14/v2")!;
    expect(v2).toMatchObject({ version: 2, reason: `rev.schedule.revised ${INITECH} v2`, cause_event_id: eventId, cause_intent_id: INTENT });
    expect(initechBilling(forecastLines(db, v2.as_of)).map((l) => l.amount_cents)).toEqual([1_080_000, 1_080_000]);
    expect(initechBilling(forecastLines(db, base.as_of)).map((l) => l.amount_cents)).toEqual([1_200_000, 1_200_000]);

    const [updated] = events(db, "forecast.updated");
    expect(updated!.intent_id).toBe(INTENT);
    expect(updated!.payload).toEqual(updates[0]);
    expect(Object.keys(updated!.payload).sort()).toEqual([
      "as_of", "as_of_date", "beyond_horizon", "cause_event_id", "delta_by_week", "delta_inflow_cents", "inflow_cents", "min_cash_cents",
      "min_cash_week", "opening_cash_cents", "outflow_cents", "prior_as_of", "reason", "version",
    ]);
    const week = (w: string, f: typeof base): number => f.weeks.find((x) => x.week === w)!.inflow_cents;
    expect(updated!.payload).toMatchObject({
      as_of: "2026-07-14/v2", as_of_date: AS_OF, version: 2, prior_as_of: "2026-07-14/v1", cause_event_id: eventId,
      opening_cash_cents: base.opening_cash_cents, inflow_cents: base.inflow_cents - 240_000, outflow_cents: base.outflow_cents, delta_inflow_cents: -240_000,
      delta_by_week: [
        { week: "2026-08-31", before_cents: week("2026-08-31", base), after_cents: week("2026-08-31", base) - 120_000 },
        { week: "2026-09-28", before_cents: week("2026-09-28", base), after_cents: week("2026-09-28", base) - 120_000 },
      ],
      beyond_horizon: { monthly_delta_cents: -120_000, through: "2027-06-30" },
      min_cash_cents: v2.min_cash_cents, min_cash_week: v2.min_cash_week,
    });
    expect(events(db, "forecast.min_cash.breach")).toHaveLength(0);

    expect(db.prepare("SELECT intent_id, function, kind, ref, summary, before_cents, after_cents, delta_cents, event_id FROM ripple").all()).toEqual([{
      intent_id: INTENT, function: "forecast", kind: "forecast_version", ref: "2026-07-14/v2", before_cents: 2_400_000, after_cents: 2_160_000, delta_cents: -240_000, event_id: eventId,
      summary: "13-week forecast v2: Initech inflows −$2,400.00 in the horizon (2 invoices × −$1,200.00); −$1,200.00 a month through 2027-06-30",
    }]);
    const diff = diffVersions(db, base.as_of, v2.as_of);
    expect(diff.by_source_ref.map((c) => [c.source_ref, c.delta_cents])).toEqual([[`${INITECH}:2026-08`, -120_000], [`${INITECH}:2026-09`, -120_000]]);
    expect(diff.delta_closing_cents).toBe(-240_000);
  });

  it("does nothing the second time, and nothing when the same event is delivered again", async () => {
    writeAllSchedules(db);
    ensureBaseline(db, AS_OF, clock);
    emitInitechRevision(db);
    expect(await forecastOnce(db, clock, { as_of_date: AS_OF })).toHaveLength(1);
    const counts = (): number[] => ["forecast_version", "forecast_line", "event", "ripple"].map((t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    const after = counts();

    expect(await forecastOnce(db, clock, { as_of_date: AS_OF })).toEqual([]);
    expect(counts()).toEqual(after);

    db.prepare("UPDATE event_cursor SET last_event_id = 0 WHERE subscriber = 'forecast'").run(); // at-least-once: replay the bus
    const skipped: string[] = [];
    expect(await forecastOnce(db, clock, { as_of_date: AS_OF, on_skip: (_id, reason) => skipped.push(reason) })).toEqual([]);
    expect(skipped).toEqual(["already handled"]);
    expect(counts()).toEqual(after);
  });

  it("builds its own baseline when none exists, from the world's today", async () => {
    // no bank lines after seedLocal, so worldToday falls back to the first day of the open period
    const base = ensureBaseline(db, undefined, clock);
    expect(base).toMatchObject({ as_of: "2026-07-01/v1", reason: "baseline" });
    expect(base.weeks[0]!.week).toBe("2026-06-29");
    expect(ensureBaseline(db, undefined, clock).as_of).toBe("2026-07-01/v1");

    writeAllSchedules(db);
    emitInitechRevision(db);
    const updates = await forecastOnce(db, clock);
    // from 1 July the horizon ends 27 September: only August's invoice (cash 31 Aug) is inside it
    expect(updates[0]).toMatchObject({ as_of: "2026-07-01/v2", prior_as_of: "2026-07-01/v1", delta_inflow_cents: -120_000, beyond_horizon: { monthly_delta_cents: -120_000, through: "2027-06-30" } });
  });

  it("reports no tail when the concession ends inside the horizon", async () => {
    writeAllSchedules(db);
    ensureBaseline(db, AS_OF, clock);
    emit(db, { topic: "rev.schedule.revised", from_function: "revenue", intent_id: INTENT, payload: { contract_id: INITECH, party_id: "initech", to_version: 2, until: "2026-09-30", monthly_delta_cents: -120_000 } }, clock);
    expect((await forecastOnce(db, clock, { as_of_date: AS_OF }))[0]!.beyond_horizon).toBeNull();
  });

  it("raises a minimum-cash breach when a week closes below zero", async () => {
    const cash = trialBalance(db, AS_OF).find((r) => r.account === "1000")!.balance_cents;
    db.prepare("INSERT INTO bill (id, party_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status) VALUES ('BILL-T-huge', 'observa', 'T-3', '2026-07-10', '2026-07-15', NULL, ?, ?, 'approved')").run(cash + 100, cash + 100);
    emitInitechRevision(db);
    const updates = await forecastOnce(db, clock, { as_of_date: AS_OF });
    expect(updates[0]!.min_cash_cents).toBeLessThan(0);
    const [breach] = events(db, "forecast.min_cash.breach");
    expect(breach).toMatchObject({ intent_id: INTENT, payload: { as_of: "2026-07-14/v2", week: updates[0]!.min_cash_week, min_cash_cents: updates[0]!.min_cash_cents, shortfall_cents: -updates[0]!.min_cash_cents } });
  });

  it("skips a payload it cannot read instead of wedging the cursor", async () => {
    emit(db, { topic: "rev.schedule.revised", from_function: "revenue", intent_id: null, payload: { contract_id: INITECH } }, clock);
    const skipped: string[] = [];
    expect(await forecastOnce(db, clock, { as_of_date: AS_OF, on_skip: (_id, reason) => skipped.push(reason) })).toEqual([]);
    expect(skipped).toEqual(["unreadable payload: party_id"]);
    expect(db.prepare("SELECT last_event_id AS id FROM event_cursor WHERE subscriber = 'forecast'").get()).toEqual({ id: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM forecast_version").get()).toEqual({ n: 0 });
  });
});

describe("forecast.get", () => {
  const tool = FORECAST_TOOL_SPECS.find((t) => t.registry_name === "forecast.get")!;
  const env = (mode: "live" | "replay"): ToolEnv => ({ db, mode } as unknown as ToolEnv);

  it("answers with the latest version, a named one, or a plain error", () => {
    expect(tool.run({}, env("live"))).toEqual({ error: "no forecast has been built yet" });
    const v1 = buildForecast(db, { as_of_date: AS_OF, reason: "baseline" }, clock);
    const v2 = buildForecast(db, { as_of_date: AS_OF, reason: "again" }, clock);
    expect(tool.input.parse({})).toEqual({});
    expect(tool.run({}, env("live"))).toEqual(v2);
    expect(tool.run({ as_of: v1.as_of }, env("live"))).toEqual(v1);
    expect(tool.run({ as_of: "2026-01-01/v9" }, env("live"))).toEqual({ error: "no such forecast version" });
    expect(tool.run({}, env("replay"))).toHaveProperty("error");
  });
});
