import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { closeOnce, ensureChecklist, evaluateChecklist, getChecklist } from "../conductor.js";
import { JULY, approve, clock, emitRevised, insertForecast, insertModification, insertSchedule, item, openArIntent, parkMemo, parkRecognition, seededWorld } from "./helpers.js";

/** Reviewed defects, each reproduced here: an item is done only when its condition holds in the ledger. */

const INITECH = "CTR-initech-2026";
it("does not tick revenue revisions when a memo could not revise its schedule", async () => {
  const db = seededWorld();
  openArIntent(db, "int_ar_1");
  const memo = parkMemo(db, "int_ar_1");
  approve(db, memo);
  insertModification(db, memo);
  db.prepare("UPDATE contract_modification SET treatment = 'memo_only', to_version = NULL, delta_total_cents = 0 WHERE cause_decision_id = ?").run(memo);
  await closeOnce(db, clock);
  expect(item(db, "rev-schedules-revised")).toMatchObject({ status: "in_progress", blocked_reason: expect.stringContaining("still need review") });
  expect(item(db, "rev-recognised").status).toBe("blocked");
  // A deliberate contra-revenue treatment legitimately needs no schedule revision.
  db.prepare("UPDATE contract_modification SET treatment = 'contra_revenue_no_schedule_change' WHERE cause_decision_id = ?").run(memo);
  await closeOnce(db, clock);
  expect(item(db, "rev-schedules-revised").status).toBe("done");
  db.close();
});
const balance = (db: ReturnType<typeof seededWorld>, account: string, party: string): number =>
  (db.prepare("SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS n FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE l.account = ? AND l.party_id = ? AND e.date >= '2026-07-01'").get(account, party) as { n: number }).n;

describe("rev-recognised reads the amount, not only that something posted", () => {
  it("a recognition parked at $12,000, approved after the schedule was revised to $10,800, is not done", () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");
    const v1 = insertSchedule(db, INITECH, 1200000);
    const recognition = parkRecognition(db, INITECH, v1, 1200000);
    const memo = parkMemo(db, "int_ar_1");
    approve(db, memo);
    insertModification(db, memo);
    insertSchedule(db, INITECH, 1080000, 2);
    approve(db, recognition, "U_CFO"); // the stale parked entry is approved as it stands

    expect(balance(db, ACCOUNTS.subscription_revenue, "initech")).toBe(1200000);
    expect(balance(db, ACCOUNTS.deferred_revenue, "initech")).toBe(-120000);

    evaluateChecklist(db, JULY, clock);
    const row = item(db, "rev-recognised");
    expect(row).toMatchObject({ status: "in_progress", decision_ids: [recognition] });
    expect(row.blocked_reason).toMatch(/1 recognition\(s\) posted at the wrong amount: CTR-initech-2026 recognised \$12,000\.00 but the active schedule says \$10,800\.00/);
    expect(row.blocked_reason).toMatch(/deferred revenue \(GL 2400\) is negative through 2026-07-31: .*\(initech\) -\$1,200\.00/);
    expect(getChecklist(db, JULY).ready_to_lock).toBe(false);
  });

  it("negative deferred revenue holds the item even when the recognition row claims the scheduled amount", () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");
    const v1 = insertSchedule(db, INITECH, 1200000);
    const recognition = parkRecognition(db, INITECH, v1, 1200000);
    const memo = parkMemo(db, "int_ar_1");
    approve(db, memo);
    insertModification(db, memo);
    insertSchedule(db, INITECH, 1080000, 2);
    approve(db, recognition, "U_CFO");
    db.prepare("UPDATE rev_recognition SET amount_cents = 1080000 WHERE contract_id = ?").run(INITECH);

    evaluateChecklist(db, JULY, clock);
    expect(item(db, "rev-recognised").status).toBe("in_progress");
    expect(item(db, "rev-recognised").blocked_reason).toMatch(/^deferred revenue \(GL 2400\) is negative through 2026-07-31: .*\(initech\) -\$1,200\.00$/);
  });

  it("is done when the posted amount equals the active line; a zero line needs no recognition", () => {
    const db = seededWorld();
    const v2 = insertSchedule(db, INITECH, 1080000, 2);
    const other = (db.prepare("SELECT id FROM contract WHERE id <> ? ORDER BY id LIMIT 1").get(INITECH) as { id: string }).id;
    insertSchedule(db, other, 0);
    const recognition = parkRecognition(db, INITECH, v2, 1080000);
    approve(db, recognition, "U_CFO");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "done", decision_ids: [recognition] });
  });
});

describe("closeOnce re-reads every live period, not only the ones an event names", () => {
  it("a July memo parked while the world is in August takes July's 'AR concessions reviewed' back from done", async () => {
    const db = seededWorld();
    await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("done");

    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-AUG', '2026-08-03', 100, 'AUGUST', 'ach', 'initech')").run();
    openArIntent(db, "int_ar_1");
    const memo = parkMemo(db, "int_ar_1"); // parks: no event is emitted
    const r = await closeOnce(db, clock);
    expect(r.events).toBe(0);
    expect(r.periods).toEqual([JULY, "2026-08"]);
    expect(r.transitions).toContainEqual({ id: "2026-07:ar-concessions-reviewed", from: "done", to: "in_progress" });
    expect(item(db, "ar-concessions-reviewed")).toMatchObject({ status: "in_progress", decision_ids: [memo] });
  });
});

describe("forecast-current follows the revision event, not wall-clock strings or modification rows", () => {
  it("(a) fixed clock: a forecast built at the same instant as the revision, and not rebuilt, is not current", () => {
    const db = seededWorld();
    insertForecast(db, 1, clock.now());
    db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at) VALUES ('dec_m', 'int_seed', 'ar', 'live', 'credit_memo', 'test', 'auto', ?)").run(clock.now());
    insertModification(db, "dec_m", clock.now());
    const eventId = emitRevised(db, "dec_m");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current")).toMatchObject({ status: "in_progress", blocked_reason: expect.stringMatching(/does not include the last schedule revision/) });

    insertForecast(db, 2, clock.now(), eventId); // the rebuild, same instant under the fixed clock
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("done");
  });

  it("(b) a modification that changed no schedule emits no revision and does not make the forecast stale", () => {
    const db = seededWorld();
    insertForecast(db, 1, "2026-07-14T10:00:00.000Z");
    db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at) VALUES ('dec_m', 'int_seed', 'ar', 'live', 'credit_memo', 'test', 'auto', ?)").run(clock.now());
    insertModification(db, "dec_m", "2026-07-14T17:00:00.000Z");
    db.prepare("UPDATE contract_modification SET treatment = 'contra_revenue_no_schedule_change', delta_total_cents = 0, to_version = NULL WHERE cause_decision_id = 'dec_m'").run();
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("done");
  });

  it("the engine's pre-revision baseline (no cause_event_id, same instant) does not count; one built strictly later does", () => {
    const db = seededWorld();
    const eventId = emitRevised(db, "dec_m", null, "2026-07-14T17:00:00.000Z");
    insertForecast(db, 1, "2026-07-14T17:00:00.000Z");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("in_progress");
    insertForecast(db, 2, "2026-07-14T17:00:00.001Z");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("done");
    expect(eventId).toBeGreaterThan(0);
  });
});

describe("ticks reach every intent a done item rests on", () => {
  it("memo A posted while memo B was parked, B posted in a later batch: both intents get the tick", async () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");
    openArIntent(db, "int_ar_2");
    const a = parkMemo(db, "int_ar_1");
    const b = parkMemo(db, "int_ar_2", 60000);
    approve(db, a);
    const first = await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("in_progress");
    expect(first.ticks).toEqual([]);

    approve(db, b);
    const second = await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("done");
    expect(second.ticks).toEqual([
      { item_id: "2026-07:ar-concessions-reviewed", intent_id: "int_ar_1", decision_id: a },
      { item_id: "2026-07:ar-concessions-reviewed", intent_id: "int_ar_2", decision_id: b },
    ]);
    expect(db.prepare("SELECT intent_id FROM ripple WHERE kind = 'checklist_tick' AND ref = '2026-07:ar-concessions-reviewed' ORDER BY intent_id").all())
      .toEqual([{ intent_id: "int_ar_1" }, { intent_id: "int_ar_2" }]);
    expect((await closeOnce(db, clock)).ticks).toEqual([]);
  });

  it("a decision under the seed intent gets no tick", async () => {
    const db = seededWorld();
    const sch = insertSchedule(db, INITECH, 1200000);
    db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, route, posted_at, created_at) VALUES ('dec_seeded', 'int_seed', 'revenue', 'live', 'rev_recognition', 'engine:revenue', 'auto', 'AUTO', ?, ?)").run(clock.now(), clock.now());
    db.prepare("INSERT INTO rev_recognition (contract_id, period, amount_cents, schedule_id, decision_id) VALUES (?, ?, 1200000, ?, 'dec_seeded')").run(INITECH, JULY, sch);
    const r = await closeOnce(db, clock);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "done", decision_ids: ["dec_seeded"] });
    expect(r.ticks).toEqual([]);
  });
});

describe("a locked or unknown period is never written", () => {
  it("ensureChecklist and evaluateChecklist refuse 2026-06 (locked) and 2031-01 (no such period)", () => {
    const db = seededWorld();
    for (const period of ["2026-06", "2031-01"]) {
      expect(ensureChecklist(db, period)).toBe(0);
      expect(evaluateChecklist(db, period, clock)).toEqual([]);
      expect(getChecklist(db, period).items).toEqual([]);
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM checklist_item").get()).toEqual({ n: 0 });
  });
});
