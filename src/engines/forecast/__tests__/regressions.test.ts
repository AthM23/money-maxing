import { beforeEach, describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../../contract/accounts.js";
import type { Proposal } from "../../../contract/types.js";
import { openWorldDb, type Db } from "../../../ledger/db.js";
import { insertDecision } from "../../../runtime/persist.js";
import { postEntry } from "../../../runtime/post.js";
import { seedLocal } from "../../../seed/local.js";
import { buildForecast, diffVersions, ensureBaseline, forecastLines, forecastOnce, getForecast, type ForecastLine } from "../index.js";
import { INITECH, INTENT, WORLD, clock, emitInitechRevision, events, initechBilling, writeAllSchedules, writeSchedule } from "./helpers.js";

/** Reviewed defects, 09-19: each test here failed before its fix. */

let db: Db;
beforeEach(() => {
  db = openWorldDb();
  seedLocal(db, WORLD);
});

const bankLine = (id: string, date: string): unknown =>
  db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES (?, ?, 100, 'T', 'ach', NULL, NULL)").run(id, date);

function addContract(id: string, party: string, start: string, terms: Record<string, unknown>): void {
  db.prepare("INSERT OR IGNORE INTO party (id, kind, name) VALUES (?, 'customer', ?)").run(party, party);
  db.prepare("INSERT INTO contract (id, party_id, start_date, end_date, value_cents, terms_json, trace_id) VALUES (?, ?, ?, '2027-06-30', 6000000, ?, NULL)").run(id, party, start, JSON.stringify(terms));
}

const billingOf = (lines: ForecastLine[], contractId: string): Array<[string, string, number]> =>
  lines.filter((l) => l.kind === "ar_scheduled_billing" && l.source_ref.startsWith(`${contractId}:`)).map((l) => [l.source_ref, l.week, l.amount_cents]);

describe("finding 1: a revision that arrives after the world's today moved", () => {
  it("diffs the new as-of date before and after the revision, not after against after", async () => {
    writeAllSchedules(db);
    bankLine("BTX-T-0723", "2026-07-23");
    expect(ensureBaseline(db, undefined, clock).as_of).toBe("2026-07-23/v1");
    bankLine("BTX-T-0728", "2026-07-28"); // the world's today is now 28 July, and no forecast stands on that date yet
    const eventId = emitInitechRevision(db); // the schedule is already v2 when the forecast engine wakes up

    const updates = await forecastOnce(db, clock);
    expect(updates).toHaveLength(1);
    // horizon from 27 July ends 25 October: August (cash 31 Aug) and September (cash 1 Oct) are inside, October is not
    expect(updates[0]).toMatchObject({
      as_of: "2026-07-28/v2", as_of_date: "2026-07-28", prior_as_of: "2026-07-28/v1", cause_event_id: eventId, delta_inflow_cents: -240_000,
      delta_by_week: [{ week: "2026-08-31" }, { week: "2026-09-28" }],
      beyond_horizon: { monthly_delta_cents: -120_000, through: "2027-06-30" },
    });
    for (const w of updates[0]!.delta_by_week) expect(w.after_cents - w.before_cents).toBe(-120_000);
    expect(events(db, "forecast.updated")[0]!.payload).toEqual(updates[0]);

    const prior = getForecast(db, "2026-07-28/v1")!;
    expect(prior).toMatchObject({ reason: "baseline (pre-revision)", cause_event_id: null });
    expect(initechBilling(forecastLines(db, prior.as_of)).map((l) => l.amount_cents)).toEqual([1_200_000, 1_200_000]);
    expect(initechBilling(forecastLines(db, "2026-07-28/v2")).map((l) => l.amount_cents)).toEqual([1_080_000, 1_080_000]);
    expect(diffVersions(db, prior.as_of, "2026-07-28/v2").by_source_ref.map((c) => [c.source_ref, c.delta_cents])).toEqual([[`${INITECH}:2026-08`, -120_000], [`${INITECH}:2026-09`, -120_000]]);
    expect(db.prepare("SELECT before_cents, after_cents, delta_cents, summary FROM ripple").all()).toEqual([{
      before_cents: 2_400_000, after_cents: 2_160_000, delta_cents: -240_000,
      summary: "13-week forecast v2: Initech inflows −$2,400.00 in the horizon (2 invoices × −$1,200.00); −$1,200.00 a month through 2027-06-30",
    }]);
    expect(getForecast(db, "2026-07-23/v1")).toBeDefined(); // the older date's version is left as built
  });

  it("rebuilds the pre-revision side when the only version for today was built after the revision", async () => {
    writeAllSchedules(db);
    emitInitechRevision(db);
    ensureBaseline(db, "2026-07-28", clock); // e.g. the console asked for a forecast between the revision and this engine's pass
    const updates = await forecastOnce(db, clock, { as_of_date: "2026-07-28" });
    expect(updates[0]).toMatchObject({ as_of: "2026-07-28/v3", prior_as_of: "2026-07-28/v2", delta_inflow_cents: -240_000 });
    expect(getForecast(db, "2026-07-28/v2")!.reason).toBe("baseline (pre-revision)");
  });

  it("schedule_overrides reprice only the named contract and periods", () => {
    writeAllSchedules(db);
    const plain = buildForecast(db, { as_of_date: "2026-07-28", reason: "plain" }, clock);
    const over = buildForecast(db, { as_of_date: "2026-07-28", reason: "override", schedule_overrides: [{ contract_id: INITECH, period: "2026-08", amount_cents: 1_000_000 }] }, clock);
    expect(diffVersions(db, plain.as_of, over.as_of).by_source_ref.map((c) => [c.source_ref, c.delta_cents])).toEqual([[`${INITECH}:2026-08`, -200_000]]);
  });
});

describe("finding 2: cash already booked for a date after the as-of date", () => {
  const AS_OF = "2026-07-23";

  /**
   * Posted with Person A's `postEntry` directly, NOT through `proposeEntry`: the reviewer's probe proposal was blocked
   * by the kernel, so their reproduction wrote the decision row by hand and posted it. Same here, so the ledger rows and
   * the open_cents movement are the production ones.
   */
  function post(proposal: Omit<Proposal, "intent_id" | "evidence" | "policy_refs" | "fact_refs" | "judgment">): string {
    db.prepare("INSERT OR IGNORE INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'ap', 'future-dated cash', 'ap', 'open', ?)").run(INTENT, clock.now());
    const full: Proposal = { ...proposal, intent_id: INTENT, evidence: [], policy_refs: [], fact_refs: [], judgment: [] };
    const id = insertDecision(db, clock, full, { actor: "test", mode: "live", autonomy_level: "auto", tier: 0 });
    return postEntry(db, clock, { decision_id: id, intent_id: INTENT, proposal: full }).entry_id!;
  }

  it("keeps a bill payment scheduled for 4 August in the outflows", () => {
    const before = buildForecast(db, { as_of_date: AS_OF, reason: "before" }, clock);
    expect(forecastLines(db, before.as_of).find((l) => l.source_ref === "BILL-07-cobalt-telecom")).toMatchObject({ kind: "ap_open_bill", week: "2026-08-03", amount_cents: -115_000 });
    const entryId = post({
      function: "ap", kind: "schedule_payment", party_id: "cobalt-telecom", entry_date: "2026-08-04", applications: [{ doc_id: "BILL-07-cobalt-telecom", amount_cents: 115_000 }],
      entries: [{ account: ACCOUNTS.ap, debit_cents: 115_000, credit_cents: 0, memo: "pay Cobalt" }, { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: 115_000, memo: "pay Cobalt" }],
    });
    const after = buildForecast(db, { as_of_date: AS_OF, reason: "after" }, clock);
    const lines = forecastLines(db, after.as_of);
    expect(lines.find((l) => l.source_ref === "BILL-07-cobalt-telecom")).toBeUndefined();
    expect(lines.filter((l) => l.kind === "gl_cash_future")).toMatchObject([{ week: "2026-08-03", source_ref: entryId, amount_cents: -115_000 }]);
    expect([after.opening_cash_cents, after.outflow_cents, after.closing_cash_cents]).toEqual([before.opening_cash_cents, before.outflow_cents, before.closing_cash_cents]);
    expect(after.weeks).toEqual(before.weeks);

    // once the as-of date reaches the entry, it is opening cash and no longer a line
    const later = buildForecast(db, { as_of_date: "2026-08-04", reason: "later" }, clock);
    expect(later.opening_cash_cents).toBe(before.opening_cash_cents - 115_000);
    expect(forecastLines(db, later.as_of).some((l) => l.kind === "gl_cash_future")).toBe(false);
  });

  it("keeps a customer receipt booked for 5 August in the inflows, once", () => {
    const before = buildForecast(db, { as_of_date: AS_OF, reason: "before" }, clock);
    expect(forecastLines(db, before.as_of).find((l) => l.source_ref === "INV-1042")).toMatchObject({ kind: "ar_open_invoice", week: "2026-07-27", amount_cents: 1_200_000 });
    const entryId = post({
      function: "ar", kind: "apply_payment", party_id: "initech", entry_date: "2026-08-05", applications: [{ doc_id: "INV-1042", amount_cents: 1_080_000 }],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 1_080_000, credit_cents: 0, memo: "Initech" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1_080_000, memo: "Initech" }],
    });
    const after = buildForecast(db, { as_of_date: AS_OF, reason: "after" }, clock);
    const lines = forecastLines(db, after.as_of);
    expect(lines.find((l) => l.source_ref === "INV-1042")).toMatchObject({ kind: "ar_open_invoice", amount_cents: 120_000 }); // the unpaid remainder
    expect(lines.filter((l) => l.kind === "gl_cash_future")).toMatchObject([{ week: "2026-08-03", source_ref: entryId, amount_cents: 1_080_000 }]);
    expect([after.opening_cash_cents, after.inflow_cents, after.closing_cash_cents]).toEqual([before.opening_cash_cents, before.inflow_cents, before.closing_cash_cents]);
  });

  it("ignores booked cash dated past week 13", () => {
    db.prepare("INSERT INTO period (id, status, locked_at) VALUES ('2026-12', 'open', NULL)").run();
    post({
      function: "ap", kind: "schedule_payment", party_id: "cobalt-telecom", entry_date: "2026-12-01", applications: [],
      entries: [{ account: ACCOUNTS.ap, debit_cents: 5_000, credit_cents: 0, memo: "far" }, { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: 5_000, memo: "far" }],
    });
    expect(forecastLines(db, buildForecast(db, { as_of_date: AS_OF, reason: "far" }, clock).as_of).some((l) => l.kind === "gl_cash_future")).toBe(false);
  });
});

describe("finding 3: a contract that started this month and has not been invoiced yet", () => {
  it("bills the as-of month, and puts late-invoiced cash in week 1", () => {
    writeAllSchedules(db);
    addContract("CTR-T-newco", "newco", "2026-07-15", { monthly_cents: 500_000, billing: "monthly", payment_terms_days: 30 });
    addContract("CTR-T-fastpay", "fastpay", "2026-07-01", { monthly_cents: 300_000, billing: "monthly", payment_terms_days: 10 });
    writeSchedule(db, "CTR-T-newco", 1, 500_000);
    writeSchedule(db, "CTR-T-fastpay", 1, 300_000);
    const lines = forecastLines(db, buildForecast(db, { as_of_date: "2026-07-23", reason: "baseline" }, clock).as_of);
    // horizon 20 July .. 18 October
    expect(billingOf(lines, "CTR-T-newco")).toEqual([
      ["CTR-T-newco:2026-07", "2026-07-27", 500_000], // 1 Jul + 30 days
      ["CTR-T-newco:2026-08", "2026-08-31", 500_000],
      ["CTR-T-newco:2026-09", "2026-09-28", 500_000],
    ]);
    // 1 Jul + 10 days is 11 July, before week 1: the invoice is late, not the customer, so the cash is expected now
    expect(billingOf(lines, "CTR-T-fastpay")).toEqual([
      ["CTR-T-fastpay:2026-07", "2026-07-20", 300_000],
      ["CTR-T-fastpay:2026-08", "2026-08-10", 300_000],
      ["CTR-T-fastpay:2026-09", "2026-09-07", 300_000],
      ["CTR-T-fastpay:2026-10", "2026-10-05", 300_000],
    ]);
    // a contract whose July invoice exists is untouched: July is an open invoice, not a billing to come
    expect(initechBilling(lines).map((l) => l.source_ref)).toEqual([`${INITECH}:2026-08`, `${INITECH}:2026-09`]);
  });

  it("does the same from contract terms when no schedule exists", () => {
    addContract("CTR-T-newco", "newco", "2026-07-15", { monthly_cents: 500_000, billing: "monthly", payment_terms_days: 30 });
    const lines = forecastLines(db, buildForecast(db, { as_of_date: "2026-07-23", reason: "baseline" }, clock).as_of);
    expect(billingOf(lines, "CTR-T-newco").map((r) => r[0])).toEqual(["CTR-T-newco:2026-07", "CTR-T-newco:2026-08", "CTR-T-newco:2026-09"]);
  });
});

describe("finding 4: billing that is not monthly", () => {
  it("projects nothing from the revenue schedule and says so in not_modelled", () => {
    writeAllSchedules(db);
    addContract("CTR-T-annual", "annualco", "2026-07-01", { monthly_cents: 500_000, billing: "annual", payment_terms_days: 30 });
    writeSchedule(db, "CTR-T-annual", 1, 500_000);
    const base = buildForecast(db, { as_of_date: "2026-07-14", reason: "before" }, clock);
    expect(billingOf(forecastLines(db, base.as_of), "CTR-T-annual")).toEqual([]);
    expect(base.not_modelled).toEqual(["payroll", "billing:annual:CTR-T-annual"]);
    expect(getForecast(db, base.as_of)).toEqual(base);
    for (const l of forecastLines(db, base.as_of)) expect(l.kind).not.toBe("not_modelled");

    db.prepare("DELETE FROM rev_schedule_line").run();
    db.prepare("DELETE FROM rev_schedule").run();
    const standalone = buildForecast(db, { as_of_date: "2026-07-14", reason: "no schedules" }, clock);
    expect(billingOf(forecastLines(db, standalone.as_of), "CTR-T-annual")).toEqual([]);
    expect(standalone.not_modelled).toEqual(["payroll", "billing:annual:CTR-T-annual"]);
  });
});
