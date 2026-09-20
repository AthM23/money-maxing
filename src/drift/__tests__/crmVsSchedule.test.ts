import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localCrm } from "../../connectors/local.js";
import { worldToday } from "../../engines/asOf.js";
import { ingest } from "../../ingest/ingest.js";
import { traceId } from "../../ingest/ids.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { approveFact, recordFactCandidate } from "../../memory/facts.js";
import type { Clock } from "../../runtime/config.js";
import { seedLocal, writeStores } from "../../seed/local.js";
import { World } from "../../seed/world.js";
import { C1_COMPARATOR, runCrmVsSchedule } from "../crmVsSchedule.js";
import { driftC1Once, driftOnce } from "../monitor.js";

const world = World.parse(JSON.parse(readFileSync("world/northwind.json", "utf8")));
const clock: Clock = { now: () => "2026-09-19T12:00:00Z" };
const CONTRACT = "CTR-initech-2026";
const DEAL = `DEAL-${CONTRACT}`;
const KEY = `${C1_COMPARATOR}|${CONTRACT}`;

/** The real world, with the CRM deals ingested through the real local connector and `ingest` (not inserted by hand). */
async function seeded(): Promise<Db> {
  const db = openWorldDb();
  seedLocal(db, world);
  const dir = mkdtempSync(join(tmpdir(), "footnote-c1-"));
  writeStores(world, dir);
  ingest(db, await localCrm(dir).pull(), clock);
  return db;
}

/** A schedule version written by hand, the way the revenue engine leaves it: the new one active, the rest superseded. */
function schedule(db: Db, version: number, monthlyCents: number): void {
  const id = `rs_initech_v${version}`;
  db.prepare("UPDATE rev_schedule SET status = 'superseded' WHERE contract_id = ?").run(CONTRACT);
  db.prepare("INSERT INTO rev_schedule (id, contract_id, party_id, version, status, total_cents, created_at) VALUES (?, ?, 'initech', ?, 'active', ?, ?)")
    .run(id, CONTRACT, version, monthlyCents * 12, clock.now());
  const line = db.prepare("INSERT INTO rev_schedule_line (schedule_id, period, amount_cents) VALUES (?, ?, ?)");
  for (let m = 0; m < 12; m++) line.run(id, m < 6 ? `2026-${String(m + 7).padStart(2, "0")}` : `2027-${String(m - 5).padStart(2, "0")}`, monthlyCents);
}

function candidate(db: Db, pctOff: number): string {
  const r = recordFactCandidate(db, clock, {
    party_id: "initech", predicate: "concession_pct", value: { pct_off: pctOff }, kinds: ["credit_memo"], uses: "standing",
    valid_from: "2026-07-01", valid_to: "2027-06-30", source_trace_ids: [traceId("crm", DEAL)], stated_by: "U_CEO",
  });
  if (r.status !== "candidate") throw new Error(r.issues.join("; "));
  return r.fact_id;
}

function activate(db: Db, factId: string): void {
  const approver = db.prepare("SELECT id FROM approver WHERE role <> 'controller_agent' ORDER BY limit_cents DESC LIMIT 1").get() as { id: string };
  expect(approveFact(db, clock, factId, approver.id)).toMatchObject({ status: "active" });
}

const count = (db: Db, sql: string, ...args: unknown[]): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...args) as { n: number }).n;
const events = (db: Db, topic: string): Record<string, unknown>[] =>
  (db.prepare("SELECT payload_json FROM event WHERE topic = ? ORDER BY id").all(topic) as { payload_json: string }[]).map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);
const intentOf = (db: Db, id: string) => db.prepare("SELECT function, owner, status, question, case_json, end_condition_json, closed_at, parent_id FROM intent WHERE id = ?").get(id) as
  { function: string; owner: string; status: string; question: string; case_json: string | null; end_condition_json: string; closed_at: string | null; parent_id: string | null };

describe("C1: CRM deal value vs the revenue schedule", () => {
  it("stores the Initech deal as a crm/deal trace with the amount and stage in the payload", async () => {
    const db = await seeded();
    const t = db.prepare("SELECT source, kind, party_id, payload_json FROM trace WHERE id = ?").get(traceId("crm", DEAL)) as { source: string; kind: string; party_id: string; payload_json: string };
    expect(t).toMatchObject({ source: "crm", kind: "deal", party_id: "initech" });
    expect(JSON.parse(t.payload_json)).toMatchObject({ amount_cents: 14_400_000, stage: "closedwon" });
  });

  it("finds nothing while the revenue engine has written no schedule", async () => {
    const db = await seeded();
    expect(runCrmVsSchedule(db, clock)).toEqual([]);
    expect(count(db, "drift_case")).toBe(0);
  });

  it("opens nothing when the schedule equals the deal", async () => {
    const db = await seeded();
    schedule(db, 1, 1_200_000);
    const intents = count(db, "intent");
    expect(runCrmVsSchedule(db, clock)).toEqual([]);
    expect(count(db, "intent")).toBe(intents);
    expect(events(db, "drift.updated")).toEqual([]);
  });

  it("a candidate fact explains nothing: one open intent that names it; activation resolves it and says so once", async () => {
    const db = await seeded();
    schedule(db, 1, 1_200_000);
    schedule(db, 2, 1_080_000);
    const factId = candidate(db, 10);

    const [first, ...rest] = runCrmVsSchedule(db, clock);
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ contract_id: CONTRACT, party_id: "initech", crm_cents: 14_400_000, schedule_cents: 12_960_000, delta_cents: 1_440_000, status: "open", opened: true, emitted: true, candidate_fact_id: factId });
    const intent = intentOf(db, first!.intent_id);
    expect(intent).toMatchObject({ function: "revenue", owner: "revenue", status: "open", case_json: null, closed_at: null });
    expect(intent.question).toBe(`CRM says $144,000.00 for Initech (${DEAL}); the revenue schedule says $129,600.00. Explain the $14,400.00 difference (a candidate fact ${factId} would explain it once approved)`);
    expect(JSON.parse(intent.end_condition_json)).toEqual({ crm_equals_schedule_or_fact: CONTRACT });
    expect(db.prepare("SELECT comparator, intent_id, delta_cents FROM drift_case WHERE dedupe_key = ?").get(KEY)).toEqual({ comparator: C1_COMPARATOR, intent_id: first!.intent_id, delta_cents: 1_440_000 });
    const payload = { comparator: C1_COMPARATOR, contract_id: CONTRACT, party_id: "initech", crm_cents: 14_400_000, schedule_cents: 12_960_000, delta_cents: 1_440_000 };
    expect(events(db, "drift.updated")).toEqual([payload]);

    // second run: same difference, same intent, nothing new on the bus
    const intents = count(db, "intent");
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ intent_id: first!.intent_id, status: "open", opened: false, emitted: false, changed: false }]);
    expect(count(db, "intent")).toBe(intents);
    expect(events(db, "drift.updated")).toHaveLength(1);
    expect(events(db, "drift.explained")).toEqual([]);

    activate(db, factId);
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ intent_id: first!.intent_id, status: "explained", opened: false, resolved: true, emitted: true, changed: true, explained_by_fact_id: factId }]);
    expect(intentOf(db, first!.intent_id)).toMatchObject({ status: "resolved", closed_at: clock.now() });
    expect(events(db, "drift.explained")).toEqual([{ ...payload, explained_by: factId }]);
    expect(count(db, "drift_case WHERE dedupe_key = ?", KEY)).toBe(1);

    // third run: still explained, and silent
    const busBefore = count(db, "event");
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "explained", resolved: false, emitted: false, changed: false }]);
    expect(count(db, "event")).toBe(busBefore);
    expect(count(db, "intent")).toBe(intents);
    expect(count(db, "intent WHERE function = 'revenue' AND status IN ('open','waiting_on_human')")).toBe(0);
  });

  it("an active fact with the wrong percentage does not explain the difference", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    activate(db, candidate(db, 12));
    const [f] = runCrmVsSchedule(db, clock);
    expect(f).toMatchObject({ status: "open", opened: true });
    expect(f!.explained_by_fact_id).toBeUndefined();
    expect(f!.candidate_fact_id).toBeUndefined();
    expect(intentOf(db, f!.intent_id).question).not.toContain("candidate fact");
    expect(events(db, "drift.explained")).toEqual([]);
  });

  it("an active fact whose window misses the contract term does not explain it", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    const factId = candidate(db, 10);
    db.prepare("UPDATE fact SET valid_from = '2025-01-01', valid_to = '2025-12-31' WHERE id = ?").run(factId);
    activate(db, factId);
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "open" }]);
  });

  it("explained on first sight: the intent is born resolved, as history for the board, and nobody is asked", async () => {
    const db = await seeded();
    const factId = candidate(db, 10);
    activate(db, factId);
    schedule(db, 2, 1_080_000);
    const intents = count(db, "intent");
    const [f] = runCrmVsSchedule(db, clock);
    expect(f).toMatchObject({ status: "explained", opened: true, resolved: false, emitted: true, explained_by_fact_id: factId });
    const intent = intentOf(db, f!.intent_id);
    expect(intent).toMatchObject({ status: "resolved", case_json: null, closed_at: clock.now() });
    expect(intent.question).toContain(`explained by active fact ${factId}`);
    expect(events(db, "drift.explained")).toHaveLength(1);
    expect(events(db, "drift.updated")).toEqual([]);
    runCrmVsSchedule(db, clock);
    expect(events(db, "drift.explained")).toHaveLength(1);
    expect(count(db, "intent")).toBe(intents + 1);
  });

  it("closes the open intent when the systems agree again, and opens a linked one if the difference comes back", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    const [open] = runCrmVsSchedule(db, clock);
    schedule(db, 3, 1_200_000);
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "agrees", intent_id: open!.intent_id, resolved: true, delta_cents: 0 }]);
    expect(intentOf(db, open!.intent_id).status).toBe("resolved");
    schedule(db, 4, 1_080_000);
    const [again] = runCrmVsSchedule(db, clock);
    expect(again).toMatchObject({ status: "open", opened: true });
    expect(again!.intent_id).not.toBe(open!.intent_id);
    expect(intentOf(db, again!.intent_id).parent_id).toBe(open!.intent_id);
    expect(count(db, "drift_case WHERE dedupe_key = ?", KEY)).toBe(1);
  });

  it("records a ripple on the intent that caused the schedule revision, once", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_ar', 'ar', 'Resolve the $1,200.00 shortfall on INV-1042', 'ar', 'open', ?)").run(clock.now());
    db.prepare(
      `INSERT INTO contract_modification (id, contract_id, cause_decision_id, cause_intent_id, treatment, pct_off_bps, effective_period, until, memo_cents, memo_account, delta_total_cents, from_version, to_version, created_at)
       VALUES ('mod_1', ?, 'dec_x', 'int_ar', 'prospective', 1000, '2026-07', '2027-06-30', 120000, '2400', -1440000, 1, 2, ?)`,
    ).run(CONTRACT, clock.now());
    db.prepare("UPDATE rev_schedule SET modification_id = 'mod_1' WHERE id = 'rs_initech_v2'").run();
    runCrmVsSchedule(db, clock);
    runCrmVsSchedule(db, clock);
    expect(db.prepare("SELECT function, kind, ref, before_cents, after_cents, delta_cents FROM ripple WHERE intent_id = 'int_ar'").all())
      .toEqual([{ function: "drift", kind: "drift_open", ref: CONTRACT, before_cents: 14_400_000, after_cents: 12_960_000, delta_cents: -1_440_000 }]);
  });

  it("a person who closes the intent is not asked again about the same difference", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    const [open] = runCrmVsSchedule(db, clock);
    db.prepare("UPDATE intent SET status = 'abandoned', closed_at = ? WHERE id = ?").run(clock.now(), open!.intent_id);
    const intents = count(db, "intent");
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "dismissed", intent_id: open!.intent_id, opened: false }]);
    expect(count(db, "intent")).toBe(intents);
  });
});

/** A contract modification the revenue engine wrote because of fact `factId`: it moved the schedule total by `deltaTotalCents`. */
function modification(db: Db, id: string, factId: string, effectivePeriod: string, deltaTotalCents: number): void {
  db.prepare(
    `INSERT INTO contract_modification (id, contract_id, cause_decision_id, treatment, pct_off_bps, effective_period, until, memo_cents, memo_account, delta_total_cents, from_version, to_version, fact_id, created_at)
     VALUES (?, ?, ?, 'prospective', 1000, ?, '2026-12-31', 120000, '2400', ?, 1, 2, ?, ?)`,
  ).run(id, CONTRACT, `dec_${id}`, effectivePeriod, deltaTotalCents, factId, clock.now());
}

/** The bank reports a later day, so the world's today moves (worldToday reads the latest bank line). */
function bankDay(db: Db, isoDate: string): void {
  db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor) VALUES (?, ?, 100, 'C1 TEST CLOCK')").run(`bt_c1_${isoDate}`, isoDate);
  expect(worldToday(db)).toBe(isoDate);
}

/** A newer CRM version of the Initech deal, as a re-ingest would store it: same external id, next version. */
function dealVersion(db: Db, version: number, payload: Record<string, unknown>): void {
  db.prepare(
    `INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, version, content_hash, payload_json)
     SELECT id || '#v' || ?, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, ?, content_hash || '#v' || ?, ? FROM trace WHERE id = ?`,
  ).run(version, version, version, JSON.stringify(payload), traceId("crm", DEAL));
}

describe("C1 review findings", () => {
  // $144,000 deal, 10% off the last 6 of 12 months: 6 x $1,200 = $7,200 off, schedule total $136,800.
  // (C1 reads rev_schedule.total_cents only, so the helper's even monthly split is good enough here.)
  it("a concession that starts mid-term is explained by the active fact's own contract modifications", async () => {
    const db = await seeded();
    const factId = candidate(db, 10);
    activate(db, factId);
    schedule(db, 2, 1_140_000);
    modification(db, "mod_mid", factId, "2026-07", -720_000);

    const [f, ...rest] = runCrmVsSchedule(db, clock);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ crm_cents: 14_400_000, schedule_cents: 13_680_000, delta_cents: 720_000, status: "explained", explained_by_fact_id: factId, emitted: true });
    expect(intentOf(db, f!.intent_id).status).toBe("resolved");
    expect(events(db, "drift.explained")).toHaveLength(1);
    expect(events(db, "drift.updated")).toEqual([]);
    expect(count(db, "intent WHERE function = 'revenue' AND status IN ('open','waiting_on_human')")).toBe(0);
  });

  it("modifications that cover only part of the difference do not explain it: the question states both parts", async () => {
    const db = await seeded();
    const factId = candidate(db, 10);
    activate(db, factId);
    schedule(db, 2, 1_140_000);
    modification(db, "mod_part", factId, "2026-09", -480_000);

    const [f] = runCrmVsSchedule(db, clock);
    expect(f).toMatchObject({ delta_cents: 720_000, status: "open", opened: true, partly_explained_by_fact_id: factId, explained_cents: 480_000 });
    expect(f!.explained_by_fact_id).toBeUndefined();
    const q = intentOf(db, f!.intent_id).question;
    expect(q).toContain("Explain the $7,200.00 difference");
    expect(q).toContain(`active fact ${factId} explains $4,800.00 of it`);
    expect(q).toContain("$2,400.00 remains unexplained");
    expect(events(db, "drift.explained")).toEqual([]);

    // the engine books the rest under the same fact: now the modifications sum to the difference
    modification(db, "mod_rest", factId, "2026-07", -240_000);
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "explained", intent_id: f!.intent_id, resolved: true, explained_by_fact_id: factId }]);
  });

  it("an active fact whose window ended before the world's today no longer explains: the difference is open again", async () => {
    const db = await seeded();
    const factId = candidate(db, 10);
    activate(db, factId);
    schedule(db, 2, 1_080_000);
    const [was] = runCrmVsSchedule(db, clock);
    expect(was).toMatchObject({ status: "explained", explained_by_fact_id: factId });

    db.prepare("UPDATE fact SET valid_to = '2026-07-31' WHERE id = ?").run(factId); // still status 'active', still overlaps the term
    bankDay(db, "2026-08-15");
    const [again, ...rest] = runCrmVsSchedule(db, clock);
    expect(rest).toEqual([]);
    expect(again).toMatchObject({ status: "open", opened: true, emitted: true, delta_cents: 1_440_000, lapsed_fact_id: factId });
    expect(again!.explained_by_fact_id).toBeUndefined();
    expect(again!.intent_id).not.toBe(was!.intent_id);
    const intent = intentOf(db, again!.intent_id);
    expect(intent).toMatchObject({ status: "open", parent_id: was!.intent_id });
    expect(intent.question).toContain(`fact ${factId} explained it until its window ended`);
    expect(db.prepare("SELECT intent_id FROM drift_case WHERE dedupe_key = ?").get(KEY)).toEqual({ intent_id: again!.intent_id });
    expect(count(db, "drift_case WHERE dedupe_key = ?", KEY)).toBe(1);
    expect(events(db, "drift.updated")).toHaveLength(1);

    const bus = count(db, "event");
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "open", intent_id: again!.intent_id, opened: false, changed: false }]);
    expect(count(db, "event")).toBe(bus);
  });

  it("a fact that is not yet in force on the world's today does not explain either", async () => {
    const db = await seeded();
    const factId = candidate(db, 10);
    activate(db, factId);
    db.prepare("UPDATE fact SET valid_from = '2026-12-01', valid_to = '2026-12-31' WHERE id = ?").run(factId);
    schedule(db, 2, 1_080_000);
    const [f] = runCrmVsSchedule(db, clock);
    expect(f).toMatchObject({ status: "open" });
    expect(f!.lapsed_fact_id).toBeUndefined();
  });

  it("a deal that is no longer closed-won keeps the open intent, re-asks it as a stage difference, and says so once", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    const [open] = runCrmVsSchedule(db, clock);
    expect(open).toMatchObject({ status: "open", opened: true });
    expect(events(db, "drift.updated")).toHaveLength(1);

    dealVersion(db, 2, { name: "Initech 2026", amount_cents: 14_400_000, stage: "closedlost" });
    const intents = count(db, "intent");
    const [lost, ...rest] = runCrmVsSchedule(db, clock);
    expect(rest).toEqual([]);
    expect(lost).toMatchObject({ contract_id: CONTRACT, status: "open", intent_id: open!.intent_id, opened: false, emitted: true, changed: true, crm_stage: "closedlost", schedule_cents: 12_960_000 });
    expect(count(db, "intent")).toBe(intents);
    const intent = intentOf(db, open!.intent_id);
    expect(intent.status).toBe("open");
    expect(intent.question).toContain(`(${DEAL}) is now 'closedlost' in the CRM while a revenue schedule of $129,600.00 is active`);
    expect(events(db, "drift.updated")).toHaveLength(2);
    expect(events(db, "drift.updated")[1]).toMatchObject({ comparator: C1_COMPARATOR, contract_id: CONTRACT, crm_stage: "closedlost", schedule_cents: 12_960_000 });

    // same state again: nothing on the bus, no new intent
    const bus = count(db, "event");
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "open", intent_id: open!.intent_id, emitted: false, changed: false }]);
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ emitted: false, changed: false }]);
    expect(count(db, "event")).toBe(bus);
    expect(count(db, "intent")).toBe(intents);
  });

  it("a deal that leaves closed-won while the schedule equals it opens one intent; no fact explains a lost deal", async () => {
    const db = await seeded();
    activate(db, candidate(db, 10));
    schedule(db, 1, 1_200_000);
    expect(runCrmVsSchedule(db, clock)).toEqual([]);

    dealVersion(db, 2, { name: "Initech 2026", amount_cents: 14_400_000, stage: "Negotiation" });
    const [f] = runCrmVsSchedule(db, clock);
    expect(f).toMatchObject({ status: "open", opened: true, emitted: true, crm_stage: "Negotiation" });
    expect(intentOf(db, f!.intent_id).question).toContain("is now 'Negotiation' in the CRM while a revenue schedule of $144,000.00 is active");
    expect(events(db, "drift.updated")).toHaveLength(1);
    expect(events(db, "drift.explained")).toEqual([]);
    runCrmVsSchedule(db, clock);
    expect(events(db, "drift.updated")).toHaveLength(1);
    expect(count(db, "intent WHERE function = 'revenue' AND status = 'open'")).toBe(1);

    // won again at the scheduled amount: the systems agree, the intent closes
    dealVersion(db, 3, { name: "Initech 2026", amount_cents: 14_400_000, stage: "closedwon" });
    expect(runCrmVsSchedule(db, clock)).toMatchObject([{ status: "agrees", intent_id: f!.intent_id, resolved: true }]);
  });
});

describe("drift monitor runs C1 when its inputs move", () => {
  it("driftOnce keeps returning C2 findings, runs C1 on a crm ingest and on fact.activated; driftC1Once reports C1", async () => {
    const db = await seeded();
    schedule(db, 2, 1_080_000);
    const factId = candidate(db, 10);

    expect(await driftOnce(db, clock)).toEqual([]); // no bank line arrived, so no C2 findings
    const intentId = (db.prepare("SELECT intent_id FROM drift_case WHERE dedupe_key = ?").get(KEY) as { intent_id: string }).intent_id;
    expect(intentOf(db, intentId).status).toBe("open");
    expect(await driftOnce(db, clock)).toEqual([]);
    expect(events(db, "drift.updated")).toHaveLength(1);

    activate(db, factId); // emits fact.activated
    expect(await driftC1Once(db, clock)).toMatchObject([{ status: "explained", intent_id: intentId, resolved: true, emitted: true }]);
    expect(await driftC1Once(db, clock)).toEqual([]); // nothing new on the bus
    await driftOnce(db, clock);
    expect(events(db, "drift.explained")).toHaveLength(1);
    expect(intentOf(db, intentId).status).toBe("resolved");
  });
});
