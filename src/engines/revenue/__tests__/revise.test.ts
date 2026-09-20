import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../../contract/accounts.js";
import { activeSchedule, ensureSchedules, recognisedPeriods, scheduleVersions } from "../store.js";
import { revenueOnce } from "../revise.js";
import { REVENUE_TOOL_SPECS } from "../tools.js";
import { clock, count, INITECH, postInitechMemo, seededWorld } from "./helpers.js";

const TERMS = { pct_off: 10, until: "2027-06-30" };

describe("ensureSchedules", () => {
  it("writes version 1 for all 13 contracts, each summing exactly to the contract value, and is idempotent", async () => {
    const db = await seededWorld();
    expect(ensureSchedules(db, clock)).toBe(13);
    expect(ensureSchedules(db, clock)).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_schedule")).toBe(13);
    const off = db.prepare(
      `SELECT c.id FROM contract c JOIN rev_schedule s ON s.contract_id = c.id
       WHERE s.total_cents != c.value_cents OR s.total_cents != (SELECT SUM(amount_cents) FROM rev_schedule_line l WHERE l.schedule_id = s.id)`,
    ).all();
    expect(off).toEqual([]);
    const initech = activeSchedule(db, INITECH)!;
    expect(initech).toMatchObject({ version: 1, status: "active", total_cents: 14_400_000, modification_id: null });
    expect(initech.lines).toHaveLength(12);
    expect(initech.lines.every((l) => l.amount_cents === 1_200_000)).toBe(true);
  });

  it("counts human-closed months and months before the books as recognised, and nothing in July", async () => {
    const db = await seededWorld();
    ensureSchedules(db, clock);
    expect([...recognisedPeriods(db, "CTR-acme-2026")].sort()).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(recognisedPeriods(db, INITECH).has("2026-07")).toBe(false);
  });
});

describe("revenueOnce: a posted credit memo revises the schedule once", () => {
  it("Initech, Dr 2400 with 10% through renewal: prospective, v2 = 12 x $10,800 = $129,600, event and ripple as specified", async () => {
    const db = await seededWorld();
    const memo = postInitechMemo(db, { terms_change: TERMS });
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "revised", treatment: "prospective", contract_id: INITECH, from_version: 1, to_version: 2, delta_total_cents: -1_440_000, decision_id: memo.decision_id });

    const v2 = activeSchedule(db, INITECH)!;
    expect(v2).toMatchObject({ version: 2, status: "active", total_cents: 12_960_000, modification_id: r!.modification_id });
    expect(v2.lines).toHaveLength(12);
    expect(v2.lines.every((l) => l.amount_cents === 1_080_000)).toBe(true);
    expect(scheduleVersions(db, INITECH).map((v) => [v.version, v.status, v.total_cents])).toEqual([[1, "superseded", 14_400_000], [2, "active", 12_960_000]]);

    expect(db.prepare("SELECT * FROM contract_modification").all()).toMatchObject([{
      contract_id: INITECH, cause_decision_id: memo.decision_id, cause_intent_id: memo.intent_id, treatment: "prospective", pct_off_bps: 1_000,
      effective_period: "2026-07", until: "2027-06-30", memo_cents: 120_000, memo_account: ACCOUNTS.deferred_revenue, delta_total_cents: -1_440_000, from_version: 1, to_version: 2, fact_id: null,
    }]);

    const events = db.prepare("SELECT from_function, intent_id, payload_json FROM event WHERE topic = 'rev.schedule.revised'").all() as { from_function: string; intent_id: string; payload_json: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from_function: "revenue", intent_id: memo.intent_id });
    const payload = JSON.parse(events[0]!.payload_json) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "after_total_cents", "before_total_cents", "cause_decision_id", "contract_id", "delta_total_cents", "effective_period", "fact_id", "from_version",
      "lines", "modification_id", "monthly_delta_cents", "party_id", "to_version", "treatment", "until",
    ]);
    expect(payload).toMatchObject({
      modification_id: r!.modification_id, contract_id: INITECH, party_id: "initech", cause_decision_id: memo.decision_id, treatment: "prospective",
      from_version: 1, to_version: 2, effective_period: "2026-07", until: "2027-06-30", before_total_cents: 14_400_000, after_total_cents: 12_960_000,
      delta_total_cents: -1_440_000, monthly_delta_cents: -120_000, fact_id: null,
    });
    const lines = payload.lines as { period: string; before_cents: number; after_cents: number }[];
    expect(lines).toHaveLength(12);
    expect(lines[0]).toEqual({ period: "2026-07", before_cents: 1_200_000, after_cents: 1_080_000 });

    expect(db.prepare("SELECT intent_id, function, kind, ref, summary, before_cents, after_cents, delta_cents FROM ripple").all()).toEqual([{
      intent_id: memo.intent_id, function: "revenue", kind: "rev_schedule_revision", ref: v2.id, before_cents: 1_200_000, after_cents: 1_080_000, delta_cents: -120_000,
      summary: "CTR-initech-2026 schedule v1 → v2: $12,000.00 → $10,800.00 a month for 2026-07..2027-06; contract value $144,000.00 → $129,600.00",
    }]);
    expect(db.prepare("SELECT decision_id, intent_id, function, system, external_id, kind FROM artifact WHERE system = 'schedule'").all())
      .toEqual([{ decision_id: memo.decision_id, intent_id: memo.intent_id, function: "revenue", system: "schedule", external_id: v2.id, kind: "rev_schedule_revision" }]);
  });

  it("is idempotent: a second poll sees nothing, and a re-delivered event changes nothing", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { terms_change: TERMS });
    expect(await revenueOnce(db, clock)).toHaveLength(1);
    expect(await revenueOnce(db, clock)).toEqual([]);
    db.prepare("UPDATE event_cursor SET last_event_id = 0 WHERE subscriber = 'revenue'").run(); // at-least-once: the bus delivers it again
    const again = await revenueOnce(db, clock);
    expect(again).toMatchObject([{ status: "already_done", treatment: "prospective", to_version: 2 }]);
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_schedule WHERE contract_id = ?", INITECH)).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM contract_modification")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM event WHERE topic = 'rev.schedule.revised'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM ripple")).toBe(1);
    expect(activeSchedule(db, INITECH)!.total_cents).toBe(12_960_000);
  });

  it("DOUBLE-HIT GUARD: a one-off memo that debits 4900 already cut revenue, so the schedule is left alone and nothing is announced", async () => {
    const db = await seededWorld();
    const memo = postInitechMemo(db, { debit: ACCOUNTS.concessions }); // the kernel accepts Dr 4900 / Cr 1200: no simulation needed
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "unchanged", treatment: "contra_revenue_no_schedule_change", delta_total_cents: 0, to_version: null });
    expect(scheduleVersions(db, INITECH).map((v) => [v.version, v.status, v.total_cents])).toEqual([[1, "active", 14_400_000]]);
    expect(db.prepare("SELECT treatment, delta_total_cents, memo_account, memo_cents, from_version, to_version FROM contract_modification").all())
      .toEqual([{ treatment: "contra_revenue_no_schedule_change", delta_total_cents: 0, memo_account: "4900", memo_cents: 120_000, from_version: 1, to_version: null }]);
    expect(count(db, "SELECT COUNT(*) AS n FROM event WHERE topic = 'rev.schedule.revised'")).toBe(0);
    const ripple = db.prepare("SELECT intent_id, kind, summary, delta_cents FROM ripple").all() as { intent_id: string; kind: string; summary: string; delta_cents: number }[];
    expect(ripple).toMatchObject([{ intent_id: memo.intent_id, kind: "rev_schedule_unchanged", delta_cents: 0 }]);
    expect(ripple[0]!.summary).toMatch(/debited revenue account 4900.*cut it twice/);
  });

  it("memo_only: Dr 2400 with no terms change drops only the invoiced month", async () => {
    const db = await seededWorld();
    postInitechMemo(db);
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "revised", treatment: "memo_only", delta_total_cents: -120_000, to_version: 2 });
    const v2 = activeSchedule(db, INITECH)!;
    expect(v2.lines.map((l) => l.amount_cents)).toEqual([1_080_000, ...Array.from({ length: 11 }, () => 1_200_000)]);
    expect(v2.total_cents).toBe(14_280_000);
    const payload = JSON.parse((db.prepare("SELECT payload_json FROM event WHERE topic = 'rev.schedule.revised'").get() as { payload_json: string }).payload_json) as { lines: unknown[]; until: string | null };
    expect(payload.lines).toEqual([{ period: "2026-07", before_cents: 1_200_000, after_cents: 1_080_000 }]);
    expect(payload.until).toBeNull();
    expect((db.prepare("SELECT summary FROM ripple").get() as { summary: string }).summary)
      .toBe("CTR-initech-2026 schedule v1 → v2: $12,000.00 → $10,800.00 for 2026-07 only; contract value $144,000.00 → $142,800.00");
  });

  it("the ledger wins for the month already invoiced: a memo that is not exactly the percentage is used as posted, and the ripple says so", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { terms_change: TERMS, amount_cents: 100_000 });
    await revenueOnce(db, clock);
    const v2 = activeSchedule(db, INITECH)!;
    expect(v2.lines[0]!.amount_cents).toBe(1_100_000);
    expect(v2.lines.slice(1).every((l) => l.amount_cents === 1_080_000)).toBe(true);
    expect(v2.total_cents).toBe(1_100_000 + 11 * 1_080_000);
    const summary = (db.prepare("SELECT summary FROM ripple").get() as { summary: string }).summary;
    expect(summary).toMatch(/10% off list leaves \$10,800\.00 for 2026-07; the posted memo\(s\) leave \$11,000\.00/);
    expect(summary).toContain("$12,000.00 → $11,000.00 for 2026-07, then $12,000.00 → $10,800.00 a month for 2026-08..2027-06");
  });

  it("uses the newest concession fact for the party when the proposal cites none", async () => {
    const db = await seededWorld();
    db.prepare(
      `INSERT INTO fact (id, party_id, predicate, value_json, scope_json, valid_from, valid_to, learned_at, source_trace_ids_json, stated_by, status)
       VALUES ('fact_initech_10', 'initech', 'concession_pct', '{"pct_off":10}', '{}', '2026-06-28', '2027-06-30', '2026-09-19T10:00:00Z', '[]', 'ceo@northwind.test', 'candidate')`,
    ).run();
    postInitechMemo(db, { terms_change: TERMS });
    await revenueOnce(db, clock);
    expect(db.prepare("SELECT fact_id FROM contract_modification").get()).toEqual({ fact_id: "fact_initech_10" });
  });

  it("the rev.schedule tool returns the active schedule, its lines, versions and modifications", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { terms_change: TERMS });
    await revenueOnce(db, clock);
    const tool = REVENUE_TOOL_SPECS.find((t) => t.registry_name === "rev.schedule")!;
    const env = { db, clock, mode: "live" } as unknown as Parameters<typeof tool.run>[1];
    const out = tool.run(tool.input.parse({ contract_id: INITECH }), env) as { schedules: { active: { version: number }; lines: unknown[]; versions: unknown[]; modifications: unknown[] }[] };
    expect(out.schedules).toHaveLength(1);
    expect(out.schedules[0]).toMatchObject({ active: { version: 2, total_cents: 12_960_000 }, lines: { length: 12 }, versions: { length: 2 }, modifications: [{ treatment: "prospective" }] });
    expect((tool.run({ party_id: "initech" }, env) as { schedules: unknown[] }).schedules).toHaveLength(2);
    expect(tool.run({}, env)).toHaveProperty("error");
  });
});
