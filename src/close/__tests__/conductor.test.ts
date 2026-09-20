import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import type { ChecklistTemplateItem } from "../checklist.js";
import { closeOnce, ensureChecklist, evaluateChecklist, getChecklist } from "../conductor.js";
import { CLOSE_TOOL_SPECS } from "../tools.js";
import { JULY, approve, clock, emitRevised, insertForecast, insertModification, insertRecognition, insertSchedule, item, openArIntent, parkMemo, seededWorld } from "./helpers.js";

const yes = (slug: string, depends_on: string[] = []): ChecklistTemplateItem =>
  ({ slug, function: "close", name: slug, depends_on, check: () => ({ done: true, reason: "ok", decision_ids: [] }) });

describe("ensureChecklist", () => {
  it("inserts the July template once, with stable ids and lock-period depending on everything else", () => {
    const db = seededWorld();
    expect(ensureChecklist(db, JULY)).toBe(11);
    expect(ensureChecklist(db, JULY)).toBe(0);
    const view = getChecklist(db, JULY);
    expect(view.counts).toEqual({ todo: 11, in_progress: 0, blocked: 0, done: 0 });
    expect(item(db, "rev-recognised").depends_on).toEqual(["2026-07:rev-schedules-revised"]);
    expect(item(db, "lock-period").depends_on).toHaveLength(10);
  });

  it("refuses a template with a cycle or an unknown dependency before writing anything", () => {
    const db = seededWorld();
    expect(() => ensureChecklist(db, JULY, [yes("a", ["c"]), yes("b", ["a"]), yes("c", ["b"])])).toThrow(/cycle among: .*2026-07:a/);
    expect(() => evaluateChecklist(db, JULY, clock, [yes("a", ["a"])])).toThrow(/cycle/);
    expect(() => ensureChecklist(db, JULY, [yes("a", ["ghost"])])).toThrow(/unknown item 2026-07:ghost/);
    expect(getChecklist(db, JULY).items).toHaveLength(0);
  });
});

describe("evaluateChecklist on the freshly seeded world", () => {
  it("reads every condition from the ledger and says what is stuck", () => {
    const db = seededWorld();
    evaluateChecklist(db, JULY, clock);
    const board = Object.fromEntries(getChecklist(db, JULY).items.map((i) => [i.id.slice(8), [i.status, i.blocked_reason]]));
    expect(board["ar-tied"]).toEqual(["done", null]);
    expect(board["ap-tied"]).toEqual(["done", null]);
    expect(board["tb-foots"]).toEqual(["done", null]);
    expect(board["escalations-answered"]).toEqual(["done", null]);
    expect(board["ar-concessions-reviewed"]).toEqual(["done", null]);
    expect(board["rev-schedules-revised"]).toEqual(["done", null]);
    expect(board["bank-lines-applied"]).toEqual(["todo", "no bank credit lines ingested for 2026-07"]);
    expect(board["rev-recognised"]).toEqual(["todo", "no schedules built"]);
    expect(board["forecast-current"]).toEqual(["todo", "no forecast built yet"]);
    // Lane A's close pack (agents/close): on a freshly seeded month no recurring vendor has a July bill booked yet.
    expect(board["accruals-posted"]![0]).toBe("todo");
    expect(board["accruals-posted"]![1]).toMatch(/^\d+ recurring expense\(s\) have nothing booked for 2026-07: /);
    expect(board["lock-period"]![0]).toBe("blocked");
    expect(board["lock-period"]![1]).toMatch(/^waiting on: Bank credits applied or explained; /);
    expect(evaluateChecklist(db, JULY, clock)).toEqual([]);
  });

  it("never locks: with everything else done, lock-period waits for a person and the period stays open", () => {
    const db = seededWorld();
    evaluateChecklist(db, JULY, clock, [yes("one"), yes("two", ["one"])]);
    const view = getChecklist(db, JULY);
    expect(view.ready_to_lock).toBe(true);
    expect(item(db, "lock-period")).toMatchObject({ status: "todo", blocked_reason: expect.stringMatching(/controller to approve the lock/) });
    expect(db.prepare("SELECT status FROM period WHERE id = ?").get(JULY)).toEqual({ status: "open" });
  });
});

describe("the Initech concession, end to end through Person A's path", () => {
  it("ticks 'AR concessions reviewed' from the ledger, ripples onto the AR intent, and holds revenue until the schedule is revised", async () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");

    const first = await closeOnce(db, clock);
    expect(first.periods).toEqual([JULY]);
    expect(item(db, "ar-concessions-reviewed")).toMatchObject({ status: "todo", decision_ids: [] });
    expect(item(db, "ar-concessions-reviewed").blocked_reason).toMatch(/1 AR case\(s\) still unresolved.*int_ar_1/);
    expect(item(db, "rev-schedules-revised")).toMatchObject({ status: "blocked", blocked_reason: "waiting on: AR concessions reviewed" });

    const memo = parkMemo(db, "int_ar_1");
    await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed")).toMatchObject({ status: "in_progress", decision_ids: [memo] });
    expect(item(db, "ar-concessions-reviewed").blocked_reason).toMatch(/1 credit memo\(s\) waiting for approval/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM ripple").get()).toEqual({ n: 0 });

    approve(db, memo);
    const after = await closeOnce(db, clock);
    expect(after.events).toBe(2); // entry.posted and ar.credit_memo.posted; one evaluation for both
    expect(after.periods).toEqual([JULY]);
    expect(after.transitions).toContainEqual({ id: "2026-07:ar-concessions-reviewed", from: "in_progress", to: "done" });
    expect(item(db, "ar-concessions-reviewed")).toMatchObject({ status: "done", blocked_reason: null, decision_ids: [memo] });
    expect(after.ticks).toEqual([{ item_id: "2026-07:ar-concessions-reviewed", intent_id: "int_ar_1", decision_id: memo }]);
    expect(db.prepare("SELECT intent_id, function, kind, ref, summary FROM ripple").all()).toEqual([
      { intent_id: "int_ar_1", function: "close", kind: "checklist_tick", ref: "2026-07:ar-concessions-reviewed", summary: 'Close 2026-07: "AR concessions reviewed" ticked' },
    ]);
    expect(db.prepare("SELECT decision_id, intent_id, function, system, external_id, kind FROM artifact WHERE system = 'checklist'").all()).toEqual([
      { decision_id: memo, intent_id: "int_ar_1", function: "close", system: "checklist", external_id: "2026-07:ar-concessions-reviewed", kind: "checklist_tick" },
    ]);

    expect(item(db, "rev-schedules-revised")).toMatchObject({ status: "in_progress", decision_ids: [memo] });
    expect(item(db, "rev-schedules-revised").blocked_reason).toMatch(/1 of 1 concession\(s\) with no contract modification yet/);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "blocked", blocked_reason: "waiting on: Revenue schedules revised for every concession" });
    expect(item(db, "ar-tied").status).toBe("done");
    expect(item(db, "tb-foots").status).toBe("done");

    const again = await closeOnce(db, clock);
    expect(again).toMatchObject({ events: 0, transitions: [], ticks: [] });
    expect(db.prepare("SELECT COUNT(*) AS n FROM ripple").get()).toEqual({ n: 1 });

    insertModification(db, memo);
    db.prepare("INSERT INTO event (ts, topic, from_function, intent_id, payload_json) VALUES (?, 'rev.schedule.revised', 'revenue', 'int_ar_1', ?)")
      .run(clock.now(), JSON.stringify({ modification_id: `mod_${memo}`, cause_decision_id: memo, contract_id: "CTR-initech-2026" }));
    const revised = await closeOnce(db, clock);
    expect(revised.transitions).toContainEqual({ id: "2026-07:rev-schedules-revised", from: "in_progress", to: "done" });
    expect(revised.ticks).toEqual([{ item_id: "2026-07:rev-schedules-revised", intent_id: "int_ar_1", decision_id: memo }]);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "todo", blocked_reason: "no schedules built" });
    expect(revised.ready_to_lock).toEqual([]);
  });

  it("a done item goes back when a new concession arrives, and returns when that one is approved", async () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");
    const memo = parkMemo(db, "int_ar_1");
    approve(db, memo);
    insertModification(db, memo);
    await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("done");
    expect(item(db, "rev-schedules-revised").status).toBe("done");

    openArIntent(db, "int_ar_2");
    const second = parkMemo(db, "int_ar_2", 60000);
    const back = evaluateChecklist(db, JULY, clock);
    expect(back).toContainEqual({ id: "2026-07:ar-concessions-reviewed", from: "done", to: "in_progress" });
    expect(back).toContainEqual({ id: "2026-07:rev-schedules-revised", from: "done", to: "blocked" });
    expect(item(db, "ar-concessions-reviewed").decision_ids).toEqual([memo, second]);

    approve(db, second);
    const r = await closeOnce(db, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("done");
    expect(item(db, "rev-schedules-revised")).toMatchObject({ status: "in_progress", decision_ids: [memo, second] });
    expect(r.ticks).toContainEqual({ item_id: "2026-07:ar-concessions-reviewed", intent_id: "int_ar_2", decision_id: second });
  });

  it("a declined memo is not a concession; a memo posted with no approval on record is not reviewed", async () => {
    const db = seededWorld();
    openArIntent(db, "int_ar_1");
    const memo = parkMemo(db, "int_ar_1");
    db.prepare("INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, approved_at) VALUES ('apr_x', ?, 'U_CTRL', 'human', 'rejected', ?)").run(memo, clock.now());
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "ar-concessions-reviewed")).toMatchObject({ status: "todo", decision_ids: [] });

    db.prepare("DELETE FROM approval WHERE id = 'apr_x'").run();
    db.prepare("UPDATE decision SET posted_at = ? WHERE id = ?").run(clock.now(), memo);
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "ar-concessions-reviewed").status).toBe("in_progress");
    expect(item(db, "ar-concessions-reviewed").blocked_reason).toMatch(/posted without an approval on record/);
  });
});

describe("the other conditions", () => {
  it("rev-recognised: every active schedule line for the period needs a posted recognition", () => {
    const db = seededWorld();
    const a = insertSchedule(db, "CTR-initech-2026", 1200000);
    const contracts = db.prepare("SELECT id FROM contract WHERE id <> 'CTR-initech-2026' ORDER BY id LIMIT 1").all() as { id: string }[];
    const other = contracts[0]!.id;
    const b = insertSchedule(db, other, 500000);
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "todo", blocked_reason: expect.stringMatching(/^2 of 2 schedule line\(s\) not recognised \(0 waiting/) });

    const posted = insertRecognition(db, "CTR-initech-2026", a, 1200000, true);
    const parked = insertRecognition(db, other, b, 500000, false);
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "rev-recognised")).toMatchObject({ status: "in_progress", blocked_reason: expect.stringMatching(/^1 of 2 schedule line\(s\) not recognised \(1 waiting/) });
    expect(item(db, "rev-recognised").decision_ids.sort()).toEqual([posted, parked].sort());

    db.prepare("UPDATE decision SET posted_at = ? WHERE id = ?").run(clock.now(), parked);
    expect(evaluateChecklist(db, JULY, clock)).toContainEqual({ id: "2026-07:rev-recognised", from: "in_progress", to: "done" });
  });

  it("forecast-current: a forecast that predates the newest schedule revision is stale until one is built for it", () => {
    const db = seededWorld();
    insertForecast(db, 1, "2026-07-14T10:00:00.000Z");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("done");

    const eventId = emitRevised(db, "dec_m", null, "2026-07-14T17:00:00.000Z");
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current")).toMatchObject({ status: "in_progress", blocked_reason: `forecast 2026-07-14/v1 does not include the last schedule revision (event ${eventId}): rebuild needed` });

    insertForecast(db, 2, "2026-07-14T17:00:01.000Z", eventId);
    evaluateChecklist(db, JULY, clock);
    expect(item(db, "forecast-current").status).toBe("done");
  });

  it("escalations-answered names the cases waiting on a person, for their own period only", () => {
    const db = seededWorld();
    openArIntent(db, "int_wayne");
    db.prepare("UPDATE intent SET status = 'waiting_on_human', question = 'Why did Wayne short-pay?' WHERE id = 'int_wayne'").run();
    db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES ('int_bad', 'ap', 'Undatable', 'ap', 'waiting_on_human', '{not json', ?)").run(clock.now());
    evaluateChecklist(db, JULY, clock);
    evaluateChecklist(db, "2026-08", clock);
    expect(item(db, "escalations-answered").blocked_reason).toBe('2 case(s) waiting on a person: int_bad "Undatable"; int_wayne "Why did Wayne short-pay?"');
    // an intent that cannot be dated counts against every period; the July case does not hold August
    expect(item(db, "escalations-answered", "2026-08").blocked_reason).toBe('1 case(s) waiting on a person: int_bad "Undatable"');
  });

  it("bank-lines-applied: an unmatched July credit holds it; applying the cash ticks it", async () => {
    const db = seededWorld();
    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-0070', '2026-07-12', 1080000, 'ACH INITECH LLC INV-1042', 'ach', 'initech')").run();
    await closeOnce(db, clock);
    expect(item(db, "bank-lines-applied")).toMatchObject({ status: "todo", blocked_reason: expect.stringMatching(/^1 of 1 bank credit line\(s\) not fully applied \(\$10,800\.00 unapplied\): BTX-0070/) });

    openArIntent(db, "int_cash");
    const r = proposeEntry(db, {
      intent_id: "int_cash", function: "ar", kind: "apply_payment", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-0070",
      applications: [{ doc_id: "INV-1042", amount_cents: 1080000 }],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "ACH Initech" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1080000, memo: "ACH Initech" }],
      evidence: [], policy_refs: [], fact_refs: [], judgment: [],
    }, { mode: "live", actor: "engine:cash", autonomy_level: "auto", tier: 0 }, { clock });
    expect(r.status).toBe("posted");
    const after = await closeOnce(db, clock);
    expect(after.transitions).toContainEqual({ id: "2026-07:bank-lines-applied", from: "todo", to: "done" });
  });
});

describe("close_checklist tool", () => {
  const tool = CLOSE_TOOL_SPECS.find((t) => t.registry_name === "close.checklist")!;
  const env = (db: ReturnType<typeof seededWorld>, mode: "live" | "replay") => ({ db, mode } as unknown as Parameters<typeof tool.run>[1]);

  it("returns the stored board, refuses replay, and validates the period", async () => {
    const db = seededWorld();
    expect(tool.run({ period: JULY }, env(db, "live"))).toEqual({ error: expect.stringMatching(/conductor has not run/) });
    await closeOnce(db, clock);
    const view = tool.run({ period: JULY }, env(db, "live")) as ReturnType<typeof getChecklist>;
    expect(view.items).toHaveLength(11);
    expect(view.counts.done + view.counts.todo + view.counts.blocked + view.counts.in_progress).toBe(11);
    expect(tool.run({ period: JULY }, env(db, "replay"))).toEqual({ error: expect.stringMatching(/replay/) });
    expect(tool.input.safeParse({ period: "July" }).success).toBe(false);
  });
});
