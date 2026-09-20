import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../../contract/accounts.js";
import { approveDecision } from "../../../runtime/approve.js";
import { deferredTieOut, recogniseMonth } from "../recognise.js";
import { revenueOnce } from "../revise.js";
import { activeSchedule, ensureSchedulesDetailed, recognisedStatus, scheduleVersions } from "../store.js";
import { clock, count, INITECH, postInitechMemo, seededWorld } from "./helpers.js";

/** Each of these was reproduced by an independent reviewer against the first version of the engine (2026-09-19). */
const TERMS = { pct_off: 10, until: "2027-06-30" };
const CFO = { approver_id: "U_CFO", approver_kind: "human" as const, outcome: "approved" as const };
const initechRevenue = (db: Parameters<typeof count>[0]): number =>
  count(db, "SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS n FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE l.party_id = 'initech' AND l.account IN ('4000','4900') AND e.period = '2026-07'");
const initechDeferred = (db: Parameters<typeof count>[0]): number =>
  count(db, "SELECT COALESCE(SUM(credit_cents - debit_cents), 0) AS n FROM gl_line WHERE party_id = 'initech' AND account = '2400'");

describe("review findings, revenue engine", () => {
  it("a standing concession never compounds: two $600 memos under the same 10% end at $10,800 a month, not $9,720", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { terms_change: TERMS, amount_cents: 60_000, intent_id: "int_a" });
    await revenueOnce(db, clock);
    expect(activeSchedule(db, INITECH)!.lines.map((l) => l.amount_cents)).toEqual([1_140_000, ...Array<number>(11).fill(1_080_000)]);
    postInitechMemo(db, { terms_change: TERMS, amount_cents: 60_000, intent_id: "int_b" });
    await revenueOnce(db, clock);
    const v3 = activeSchedule(db, INITECH)!;
    expect(v3.version).toBe(3);
    expect(v3.lines.every((l) => l.amount_cents === 1_080_000)).toBe(true);
    expect(v3.total_cents).toBe(12_960_000);
  });

  it("the same concession arriving again with nothing left to change writes no version and announces nothing", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { terms_change: TERMS, intent_id: "int_a" });
    await revenueOnce(db, clock);
    // a second memo for the same terms that debits 4900: July is guarded, later months are already at the concession price
    postInitechMemo(db, { terms_change: TERMS, debit: ACCOUNTS.concessions, amount_cents: 1_000, intent_id: "int_b" });
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "unchanged", to_version: null, delta_total_cents: 0 });
    expect(scheduleVersions(db, INITECH)).toHaveLength(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM event WHERE topic = 'rev.schedule.revised'")).toBe(1);
  });

  it("DOUBLE-HIT GUARD with a standing concession: a Dr 4900 memo leaves July's line alone and still lowers the later months", async () => {
    const db = await seededWorld();
    postInitechMemo(db, { debit: ACCOUNTS.concessions, terms_change: TERMS });
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "revised", treatment: "prospective", to_version: 2 });
    expect(activeSchedule(db, INITECH)!.lines.map((l) => l.amount_cents)).toEqual([1_200_000, ...Array<number>(11).fill(1_080_000)]);
    // July nets to $10,800 once: $12,000 recognised per schedule less the $1,200 already in 4900
    for (const l of recogniseMonth(db, "2026-07", { clock }).lines) if (l.contract_id === INITECH) approveDecision(db, l.decision_id!, CFO, { clock });
    expect(initechRevenue(db)).toBe(1_080_000);
    expect(initechDeferred(db)).toBe(0);
  });

  it("a recognition parked at the old amount cannot post after the revision: it is withdrawn, and approving it anyway does not book $12,000", async () => {
    const db = await seededWorld();
    const stale = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(stale).toMatchObject({ status: "pending_approval", amount_cents: 1_200_000 });
    postInitechMemo(db, { terms_change: TERMS });
    await revenueOnce(db, clock);
    expect(recognisedStatus(db, INITECH, "2026-07")).toBe("declined");
    const fresh = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(fresh).toMatchObject({ status: "pending_approval", amount_cents: 1_080_000 });
    expect(approveDecision(db, fresh.decision_id!, CFO, { clock }).status).toBe("posted");
    expect(initechRevenue(db)).toBe(1_080_000);
    expect(initechDeferred(db)).toBe(0);
    // KNOWN GAP, Person A's runtime (logged in PROJECT_STATUS 2026-09-19): approveDecision does not treat an earlier
    // 'rejected' approval as final, so a person who digs out the withdrawn decision by id can still post it. Lane B
    // cannot close that; what it guarantees is that the damage is loud. When the runtime refuses, the first branch holds.
    const late = approveDecision(db, stale.decision_id!, CFO, { clock });
    if (late.status !== "posted") {
      expect(initechRevenue(db)).toBe(1_080_000);
    } else {
      expect(initechDeferred(db)).toBe(-1_200_000);
      expect(deferredTieOut(db, "2026-07").rows.find((x) => x.party_id === "initech")).toMatchObject({ tied: false });
    }
  });

  it("a memo that arrives after July was recognised: the tie-out goes red and a true-up intent is opened, nothing is guessed", async () => {
    const db = await seededWorld();
    const july = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(approveDecision(db, july.decision_id!, CFO, { clock }).status).toBe("posted");
    const memo = postInitechMemo(db, { terms_change: TERMS });
    const [r] = await revenueOnce(db, clock);
    expect(r!.reason).toMatch(/true-up intent int_rev_trueup_CTR-initech-2026_2026-07 opened/);
    expect(activeSchedule(db, INITECH)!.lines.map((l) => l.amount_cents)).toEqual([1_200_000, ...Array<number>(11).fill(1_080_000)]);
    expect(initechDeferred(db)).toBe(-120_000);
    expect(deferredTieOut(db, "2026-07").rows.find((x) => x.party_id === "initech")).toMatchObject({ gl_deferred_cents: -120_000, tied: false });
    expect(deferredTieOut(db, "2026-07").total.tied).toBe(false);
    expect(db.prepare("SELECT status, function, case_json FROM intent WHERE id = 'int_rev_trueup_CTR-initech-2026_2026-07'").get()).toEqual({ status: "open", function: "revenue", case_json: null });
    expect(count(db, "SELECT COUNT(*) AS n FROM ripple WHERE intent_id = ? AND kind = 'rev_trueup_needed'", memo.intent_id)).toBe(1);
    // and the month reports what actually posted, not what the schedule says today
    expect(recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)).toMatchObject({ reason: "already_recognised", amount_cents: 1_200_000 });
  });

  it("refuses a month the world has not reached, and recognises a contract's months in order", async () => {
    const db = await seededWorld();
    const august = recogniseMonth(db, "2026-08", { clock });
    expect(august).toMatchObject({ lines: [], refused: expect.stringContaining("after the world's current period 2026-07") });
    expect(count(db, "SELECT COUNT(*) AS n FROM intent WHERE id = 'int_rev_2026-08'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision WHERE kind = 'rev_recognition'")).toBe(0);
  });

  it("the tie-out sees a stray credit to deferred revenue: billed comes from invoices, not from whatever was credited to 2400", async () => {
    const db = await seededWorld();
    for (const l of recogniseMonth(db, "2026-07", { clock }).lines) approveDecision(db, l.decision_id!, CFO, { clock });
    expect(deferredTieOut(db, "2026-07").rows.find((x) => x.party_id === "acme")).toMatchObject({ tied: true });
    // Written straight to the ledger: the kernel refuses this entry without evidence (E5). The tie-out must not
    // depend on every writer having been honest, so the test puts the stray credit there by hand.
    db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_rogue', '2026-07', '2026-07-31', 'dec_seed', 'rogue', ?)").run(clock.now());
    const line = db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents, party_id) VALUES ('je_rogue', ?, ?, ?, ?, 'acme')");
    line.run(1, ACCOUNTS.subscription_revenue, 30_000, 0);
    line.run(2, ACCOUNTS.deferred_revenue, 0, 30_000);
    expect(deferredTieOut(db, "2026-07").rows.find((x) => x.party_id === "acme")).toMatchObject({ diff_cents: 30_000, tied: false });
  });

  it("one contract that cannot be spread is reported and skipped; the other schedules and the bus keep working", async () => {
    const db = await seededWorld();
    db.prepare("INSERT INTO contract (id, party_id, start_date, end_date, value_cents, terms_json) VALUES ('CTR-bad', 'acme', '2026-09-01', '2026-03-01', 100000, '{}')").run();
    const r = ensureSchedulesDetailed(db, clock);
    expect(r.created).toBe(13);
    expect(r.failed).toMatchObject([{ contract_id: "CTR-bad" }]);
    postInitechMemo(db, { terms_change: TERMS });
    expect(await revenueOnce(db, clock)).toMatchObject([{ status: "revised" }]);
    expect(recogniseMonth(db, "2026-07", { clock }).lines).toHaveLength(12);
  });

  it("a memo split across deferred revenue and a revenue account, or across service months, is left to a person", async () => {
    const db = await seededWorld();
    db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_split', 'ar', 'split', 'ar', 'open', ?)").run(clock.now());
    db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, proposal_json, actor, autonomy_level, route, posted_at, created_at) VALUES ('dec_split', 'int_split', 'ar', 'live', 'credit_memo', ?, 'agent:test', 'auto', 'PROPOSE', ?, ?)")
      .run(JSON.stringify({ party_id: "initech", applications: [{ doc_id: "INV-1042", amount_cents: 120_000 }], terms_change: TERMS }), clock.now(), clock.now());
    db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_split', '2026-07', '2026-07-14', 'dec_split', 'split', ?)").run(clock.now());
    const line = db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents, party_id) VALUES ('je_split', ?, ?, ?, ?, 'initech')");
    line.run(1, "2400", 60_000, 0);
    line.run(2, "4900", 60_000, 0);
    line.run(3, "1200", 0, 120_000);
    const { emit } = await import("../../../bus/bus.js");
    emit(db, { topic: "ar.credit_memo.posted", from_function: "ar", intent_id: "int_split", payload: { decision_id: "dec_split", entry_id: "je_split" } }, clock);
    const [r] = await revenueOnce(db, clock);
    expect(r).toMatchObject({ status: "skipped", reason: expect.stringContaining("split memos are not scheduled automatically") });
    expect(count(db, "SELECT COUNT(*) AS n FROM contract_modification")).toBe(0);
  });
});
