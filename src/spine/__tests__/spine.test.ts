import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { trialBalance } from "../../ledger/read.js";
import { generateWorld } from "../../seed/generate.js";
import { seedLocal, writeStores } from "../../seed/local.js";
import { runSpine, type SpineReport } from "../run.js";
import { scriptedInitech } from "../scripted.js";

const { world } = generateWorld();

function freshDb(): { db: Db; stores: string } {
  const db = openWorldDb();
  seedLocal(db, world);
  const stores = mkdtempSync(join(tmpdir(), "footnote-spine-"));
  writeStores(world, stores);
  return { db, stores };
}

const one = <T>(db: Db, sql: string, ...args: unknown[]): T => db.prepare(sql).get(...args) as T;
const all = <T>(db: Db, sql: string, ...args: unknown[]): T[] => db.prepare(sql).all(...args) as T[];

// Each runSpine seeds, ingests and settles a whole month; several of them in one test need more than vitest's 5 s under a loaded machine.
const SLOW = 60_000;

describe("Phase 2 spine: one short-paid invoice, every book (Initech, scripted stand-in for the model tier)", () => {
  let db: Db;
  let r: SpineReport;
  let intentId: string;

  beforeAll(async () => {
    const f = freshDb();
    db = f.db;
    r = await runSpine(db, { stores_dir: f.stores, investigators: [scriptedInitech], approve_as: "U_CTRL", recognise: true, recognise_as: "U_CFO", qbo: { dry_run: true } });
    intentId = one<{ id: string }>(db, "SELECT id FROM intent WHERE question LIKE '%INV-1042%'").id;
  }, SLOW);

  it("AR: the credit memo is Dr deferred revenue / Cr AR for $1,200, approved by a person, and INV-1042 is settled", () => {
    const d = one<{ id: string; route: string; posted_at: string | null }>(db, "SELECT id, route, posted_at FROM decision WHERE intent_id = ? AND kind = 'credit_memo'", intentId);
    expect(d.route).toBe("PROPOSE");
    expect(d.posted_at).not.toBeNull();
    const lines = all<{ account: string; debit_cents: number; credit_cents: number }>(db, "SELECT l.account, l.debit_cents, l.credit_cents FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE e.source_decision_id = ? ORDER BY l.line_no", d.id);
    expect(lines).toEqual([{ account: "2400", debit_cents: 120000, credit_cents: 0 }, { account: "1200", debit_cents: 0, credit_cents: 120000 }]);
    expect(one(db, "SELECT open_cents, status FROM invoice WHERE id = 'INV-1042'")).toEqual({ open_cents: 0, status: "paid" });
    expect(one(db, "SELECT approver_id, approver_kind, outcome FROM approval WHERE decision_id = ?", d.id)).toEqual({ approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" });
  });

  it("revenue: schedule v2 is $10,800 a month and sums exactly to $129,600; revenue moves once", () => {
    const s = one<{ id: string; version: number; total_cents: number }>(db, "SELECT id, version, total_cents FROM rev_schedule WHERE contract_id = 'CTR-initech-2026' AND status = 'active'");
    expect(s).toMatchObject({ version: 2, total_cents: 12960000 });
    const lines = all<{ amount_cents: number }>(db, "SELECT amount_cents FROM rev_schedule_line WHERE schedule_id = ?", s.id);
    expect(lines).toHaveLength(12);
    expect(lines.every((l) => l.amount_cents === 1080000)).toBe(true);
    expect(one(db, "SELECT treatment, delta_total_cents FROM contract_modification WHERE contract_id = 'CTR-initech-2026'")).toEqual({ treatment: "prospective", delta_total_cents: -1440000 });
    // July revenue for Initech is $10,800, not $12,000 and not $9,600: nothing else touched a revenue account.
    const rev = one<{ n: number }>(db, "SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS n FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE l.party_id = 'initech' AND l.account IN ('4000','4900') AND e.period = '2026-07'");
    expect(rev.n).toBe(1080000);
    expect(one<{ n: number }>(db, "SELECT COALESCE(SUM(credit_cents - debit_cents), 0) AS n FROM gl_line WHERE party_id = 'initech' AND account = '2400'").n).toBe(0);
    expect(r.deferred_tied).toBe(true);
  });

  it("forecast: a new version caused by the intent, Initech's future billing at $10,800, opening cash = GL cash", () => {
    const versions = all<{ as_of: string; cause_intent_id: string | null; opening_cash_cents: number; as_of_date: string }>(db, "SELECT as_of, cause_intent_id, opening_cash_cents, as_of_date FROM forecast_version ORDER BY version");
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const latest = versions.at(-1)!;
    expect(latest.cause_intent_id).toBe(intentId);
    const billing = all<{ amount_cents: number }>(db, "SELECT amount_cents FROM forecast_line WHERE as_of = ? AND kind = 'ar_scheduled_billing' AND source_ref LIKE 'CTR-initech-2026:%'", latest.as_of);
    expect(billing.length).toBeGreaterThan(0);
    expect(billing.every((l) => l.amount_cents === 1080000)).toBe(true);
    const updated = one<{ payload_json: string }>(db, "SELECT payload_json FROM event WHERE topic = 'forecast.updated' AND intent_id = ? ORDER BY id DESC", intentId);
    expect(JSON.parse(updated.payload_json)).toMatchObject({ beyond_horizon: { monthly_delta_cents: -120000, through: "2027-06-30" } });
    expect(versions.filter((v) => v.as_of_date === latest.as_of_date).every((v) => v.opening_cash_cents === versions[0]!.opening_cash_cents)).toBe(true);
    expect(trialBalance(db, latest.as_of_date).find((a) => a.account === "1000")?.balance_cents).toBe(latest.opening_cash_cents);
  });

  it("close: 'AR concessions reviewed' is ticked from the ledger, and the period is not locked while Wayne waits", () => {
    const byName = new Map(r.checklist.map((c) => [c.name, c]));
    expect(byName.get("AR concessions reviewed")?.status).toBe("done");
    expect(byName.get("Revenue schedules revised for every concession")?.status).toBe("done");
    expect(byName.get("Lock the period")?.status).not.toBe("done");
    expect(one(db, "SELECT status FROM period WHERE id = '2026-07'")).toEqual({ status: "open" });
  });

  it("drift: CRM $144,000 vs schedule $129,600 was open until the fact was approved, then explained, and nobody was asked", () => {
    const c1 = one<{ status: string; question: string }>(db, "SELECT i.status, i.question FROM drift_case c JOIN intent i ON i.id = c.intent_id WHERE c.dedupe_key = 'C1_crm_vs_schedule|CTR-initech-2026'");
    expect(c1.status).toBe("resolved");
    expect(all(db, "SELECT id FROM event WHERE topic = 'drift.updated' AND json_extract(payload_json, '$.contract_id') = 'CTR-initech-2026'")).toHaveLength(1);
    expect(all(db, "SELECT id FROM event WHERE topic = 'drift.explained' AND json_extract(payload_json, '$.comparator') = 'C1_crm_vs_schedule'")).toHaveLength(1);
    expect(r.activated_facts).toHaveLength(1);
    expect(all(db, "SELECT id FROM escalation WHERE json_extract(question_json, '$.party_id') = 'initech'")).toHaveLength(0);
  });

  it("ripple: one intent, the same $1,200 in AR, revenue, forecast and close, and the mirror refuses to guess QuickBooks ids", () => {
    const rows = r.ripples[intentId]!.rows;
    const fns = new Set(rows.map((x) => x.function));
    for (const fn of ["revenue", "forecast", "close", "ar"]) expect(fns.has(fn)).toBe(true);
    expect(rows.find((x) => x.kind === "rev_schedule_revision")).toMatchObject({ before_cents: 1200000, after_cents: 1080000, delta_cents: -120000 });
    expect(rows.find((x) => x.kind === "rev_recognition")).toMatchObject({ after_cents: 1080000, delta_cents: -120000 });
    expect(rows.find((x) => x.function === "ar" && x.kind === "credit_memo")).toMatchObject({ delta_cents: -120000 });
    expect(rows.find((x) => x.function === "ar" && x.kind === "cash_applied")).toMatchObject({ delta_cents: 1080000 });
    // This database was never seeded to QuickBooks, so the mirror must skip with the reason, not guess ids.
    const log = all<{ kind: string; status: string }>(db, "SELECT m.kind, m.status FROM mirror_log m JOIN decision d ON d.id = m.decision_id WHERE d.intent_id = ? AND d.kind = 'credit_memo'", intentId);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((l) => l.status === "skipped")).toBe(true);
  });

  it("books: AR ties, the trial balance foots, and a second pass changes nothing", async () => {
    expect(r.ar_tied).toBe(true);
    const tb = trialBalance(db);
    expect(tb.reduce((n, a) => n + a.balance_cents, 0)).toBe(0);
    const before = { entries: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM gl_entry").n, ripple: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ripple").n, schedules: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM rev_schedule").n, forecasts: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM forecast_version").n };
    const again = await runSpine(db, { investigators: [scriptedInitech], approve_as: "U_CTRL", recognise: true, recognise_as: "U_CFO", qbo: { dry_run: true } });
    expect(again.cases).toBe(0);
    expect(again.approved_decisions).toHaveLength(0);
    expect({ entries: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM gl_entry").n, ripple: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ripple").n, schedules: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM rev_schedule").n, forecasts: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM forecast_version").n }).toEqual(before);
  }, SLOW);
});

describe("Phase 2 spine with nobody approving", () => {
  it("stops at the approval: the memo is parked, no schedule moves, the checklist says what is stuck", async () => {
    const f = freshDb();
    const r = await runSpine(f.db, { stores_dir: f.stores, investigators: [scriptedInitech], qbo: { dry_run: true } });
    expect(r.pending_approvals.map((p) => p.kind)).toContain("credit_memo");
    expect(one<{ n: number }>(f.db, "SELECT COUNT(*) AS n FROM rev_schedule WHERE version > 1").n).toBe(0);
    expect(one<{ n: number }>(f.db, "SELECT COUNT(*) AS n FROM contract_modification").n).toBe(0);
    expect(r.checklist.find((c) => c.name === "AR concessions reviewed")?.status).not.toBe("done");
  }, SLOW);
});

describe("Phase 2 spine, review findings", () => {
  const books = (db: Db): unknown => ({
    tb: trialBalance(db).map((a) => [a.account, a.balance_cents]),
    schedules: all(db, "SELECT contract_id, version, status, total_cents FROM rev_schedule ORDER BY contract_id, version"),
    initech_july_revenue: one<{ n: number }>(db, "SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS n FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE l.party_id = 'initech' AND l.account IN ('4000','4900') AND e.period = '2026-07'").n,
  });

  it("recognition parked before anyone approved the memo, then a run with approvers: same books as the single run, never $12,000", async () => {
    const single = freshDb();
    await runSpine(single.db, { stores_dir: single.stores, investigators: [scriptedInitech], approve_as: "U_CTRL", recognise: true, recognise_as: "U_CFO", qbo: { dry_run: true } });

    const f = freshDb();
    const first = await runSpine(f.db, { stores_dir: f.stores, investigators: [scriptedInitech], recognise: true, qbo: { dry_run: true } });
    expect(first.pending_approvals.filter((p) => p.kind === "rev_recognition" && p.party_id === "initech")).toHaveLength(1); // parked at $12,000
    const second = await runSpine(f.db, { investigators: [scriptedInitech], approve_as: "U_CTRL", recognise: true, recognise_as: "U_CFO", qbo: { dry_run: true } });

    expect(books(f.db)).toEqual(books(single.db));
    expect(second.deferred_tied).toBe(true);
    expect(second.checklist.find((c) => c.name === "Revenue recognised per schedule")?.status).toBe("done");
    expect(one(f.db, "SELECT a.approver_id, a.outcome FROM approval a JOIN decision d ON d.id = a.decision_id WHERE d.kind = 'rev_recognition' AND a.outcome = 'rejected'"))
      .toEqual({ approver_id: "engine:revenue", outcome: "rejected" });
  }, SLOW);

  it("approving a memo activates only the fact that memo rests on, and an approver who cannot cover the memo activates nothing", async () => {
    const f = freshDb();
    // Parked candidate for another customer, unrelated to anything approved in this run.
    f.db.prepare(
      `INSERT INTO fact (id, party_id, predicate, value_json, scope_json, valid_from, valid_to, learned_at, source_trace_ids_json, stated_by, status)
       VALUES ('fact_acme_50', 'acme', 'concession_pct', '{"pct_off":50}', '{"kinds":["credit_memo"]}', '2026-06-01', '2027-06-30', '2026-07-01T00:00:00Z', '[]', 'someone', 'candidate')`,
    ).run();
    const clerk = await runSpine(f.db, { stores_dir: f.stores, investigators: [scriptedInitech], approve_as: "U_AP", qbo: { dry_run: true } }); // $100 limit
    expect(clerk.approved_decisions).toHaveLength(0);
    expect(clerk.activated_facts).toHaveLength(0);
    const controller = await runSpine(f.db, { investigators: [scriptedInitech], approve_as: "U_CTRL", qbo: { dry_run: true } });
    expect(controller.activated_facts).toHaveLength(1);
    expect(one(f.db, "SELECT status FROM fact WHERE id = 'fact_acme_50'")).toEqual({ status: "candidate" });
    expect(one(f.db, "SELECT party_id, status, approved_by FROM fact WHERE status = 'active'")).toEqual({ party_id: "initech", status: "active", approved_by: "U_CTRL" });
  }, SLOW);
});
