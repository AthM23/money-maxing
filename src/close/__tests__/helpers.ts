import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal } from "../../contract/types.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { approveDecision } from "../../runtime/approve.js";
import type { Clock } from "../../runtime/config.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { seedLocal } from "../../seed/local.js";
import type { World } from "../../seed/world.js";
import { getChecklist, type ChecklistRow } from "../conductor.js";

export const JULY = "2026-07";
export const clock: Clock = { now: () => "2026-07-14T16:00:00.000Z" };
export const QUOTE = "Initech gets 10% off the platform fee through renewal on 2027-06-30";
const TRACE_ID = "tr_close_test_ceo_email";

/** The real world: 13 contracts, Q2 locked, July invoices issued and nothing else booked for July. */
export function seededWorld(): Db {
  const db = openWorldDb();
  seedLocal(db, JSON.parse(readFileSync("world/northwind.json", "utf8")) as World);
  return db;
}

export function openArIntent(db: Db, id: string, entryDate = "2026-07-14"): void {
  db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?)")
    .run(id, `Resolve the shortfall (${id})`, JSON.stringify({ intent_id: id, function: "ar", party_id: "initech", entry_date: entryDate }), clock.now());
}

function ceoEmailTrace(db: Db): string {
  const payload = JSON.stringify({ from: "morgan.hale@northwind.test", subject: "Re: Renewal pricing", body: `Hi Pat, Dana, confirming what we discussed: ${QUOTE}. Thanks, Morgan` });
  db.prepare("INSERT OR IGNORE INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, 'gmail', 'email', 'm-initech-2', ?, ?, ?, 'initech', ?, ?)")
    .run(TRACE_ID, "2026-06-28T15:00:00Z", "2026-06-28T15:00:00Z", "2026-09-19T20:00:00Z", createHash("sha256").update(payload).digest("hex"), payload);
  return TRACE_ID;
}

export function creditMemo(db: Db, intentId: string, docId = "INV-1042", cents = 120000): Proposal {
  const memo = `Concession per CEO email 28 Jun (${intentId})`;
  return {
    intent_id: intentId, function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
    applications: [{ doc_id: docId, amount_cents: cents }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: cents, credit_cents: 0, memo },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: cents, memo },
    ],
    terms_change: { pct_off: 10, until: "2027-06-30" },
    evidence: [{ claim: "CEO granted 10% off through renewal", trace_id: ceoEmailTrace(db), quote: QUOTE }],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}

/** Person A's path, up to the point where the memo waits for a person. Returns the parked decision. */
export function parkMemo(db: Db, intentId: string, cents = 120000): string {
  const r = proposeEntry(db, creditMemo(db, intentId, "INV-1042", cents), { mode: "live", actor: "agent:ar", autonomy_level: "auto", tier: 1 }, { clock });
  expect(r.status).toBe("pending_approval");
  return (r as { decision_id: string }).decision_id;
}

/** `approverId` 'U_CFO' for a revenue recognition: the controller clicking one is the wrong approver and blocks it. */
export function approve(db: Db, decisionId: string, approverId = "U_CTRL"): void {
  const r = approveDecision(db, decisionId, { approver_id: approverId, approver_kind: "human", outcome: "approved" }, { clock });
  expect(r.status).toBe("posted");
}

export function item(db: Db, slug: string, period = JULY): ChecklistRow {
  const found = getChecklist(db, period).items.find((i) => i.id === `${period}:${slug}`);
  if (!found) throw new Error(`no checklist item ${period}:${slug}`);
  return found;
}

/** Lane B fixture rows by hand, per schema-b.sql: the revenue and forecast engines are not imported here. */
export function insertModification(db: Db, decisionId: string, createdAt = "2026-07-14T17:00:00.000Z"): void {
  db.prepare(
    `INSERT INTO contract_modification (id, contract_id, cause_decision_id, treatment, pct_off_bps, effective_period, until, memo_cents, memo_account, delta_total_cents, from_version, to_version, created_at)
     VALUES (?, 'CTR-initech-2026', ?, 'prospective', 1000, '2026-07', '2027-06-30', 120000, ?, -1440000, 1, 2, ?)`,
  ).run(`mod_${decisionId}`, decisionId, ACCOUNTS.deferred_revenue, createdAt);
}

/** A schedule version with one July line. A version above 1 supersedes the contract's earlier versions, as a revision does. */
export function insertSchedule(db: Db, contractId: string, amountCents: number, version = 1): string {
  const party = (db.prepare("SELECT party_id FROM contract WHERE id = ?").get(contractId) as { party_id: string }).party_id;
  const id = `sch_${contractId}_v${version}`;
  db.prepare("UPDATE rev_schedule SET status = 'superseded' WHERE contract_id = ?").run(contractId);
  db.prepare("INSERT INTO rev_schedule (id, contract_id, party_id, version, status, total_cents, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(id, contractId, party, version, amountCents, clock.now());
  db.prepare("INSERT INTO rev_schedule_line (schedule_id, period, amount_cents) VALUES (?, ?, ?)").run(id, JULY, amountCents);
  return id;
}

/**
 * A July recognition through Person A's path, as the revenue engine proposes it (Dr 2400 / Cr 4000, month end), with
 * its rev_recognition row. At $500 or more it parks; returns the parked decision.
 */
export function parkRecognition(db: Db, contractId: string, scheduleId: string, cents: number): string {
  const party = (db.prepare("SELECT party_id FROM contract WHERE id = ?").get(contractId) as { party_id: string }).party_id;
  db.prepare("INSERT OR IGNORE INTO intent (id, function, question, owner, status, created_at) VALUES ('int_rev_2026-07', 'revenue', 'Recognise 2026-07 subscription revenue per schedule', 'revenue', 'open', ?)").run(clock.now());
  const memo = `Revenue ${JULY} ${contractId} per schedule`;
  const r = proposeEntry(db, {
    intent_id: "int_rev_2026-07", function: "revenue", kind: "rev_recognition", party_id: party, entry_date: "2026-07-31", applications: [],
    entries: [{ account: ACCOUNTS.deferred_revenue, debit_cents: cents, credit_cents: 0, memo }, { account: ACCOUNTS.subscription_revenue, debit_cents: 0, credit_cents: cents, memo }],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  }, { mode: "live", actor: "engine:revenue", autonomy_level: "auto", tier: 0 }, { clock });
  expect(r.status).toBe("pending_approval");
  const id = (r as { decision_id: string }).decision_id;
  db.prepare("INSERT INTO rev_recognition (contract_id, period, amount_cents, schedule_id, decision_id) VALUES (?, ?, ?, ?, ?)").run(contractId, JULY, cents, scheduleId, id);
  return id;
}

/** A recognition row with its decision; `posted` false leaves the decision parked, as a material recognition would be. */
export function insertRecognition(db: Db, contractId: string, scheduleId: string, amountCents: number, posted: boolean): string {
  const id = `dec_rec_${contractId}`;
  db.prepare("INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, route, posted_at, created_at) VALUES (?, 'int_seed', 'revenue', 'live', 'rev_recognition', 'engine:revenue', 'auto', ?, ?, ?)")
    .run(id, posted ? "AUTO" : "PROPOSE", posted ? clock.now() : null, clock.now());
  db.prepare("INSERT INTO rev_recognition (contract_id, period, amount_cents, schedule_id, decision_id) VALUES (?, ?, ?, ?, ?)").run(contractId, JULY, amountCents, scheduleId, id);
  return id;
}

export function insertForecast(db: Db, version: number, builtAt: string, causeEventId: number | null = null): void {
  db.prepare(
    `INSERT INTO forecast_version (as_of, as_of_date, version, built_at, reason, cause_event_id, opening_cash_cents, inflow_cents, outflow_cents, min_cash_cents, min_cash_week)
     VALUES (?, '2026-07-14', ?, ?, 'test', ?, 0, 0, 0, 0, '2026-W29')`,
  ).run(`2026-07-14/v${version}`, version, builtAt, causeEventId);
}

/** A `rev.schedule.revised` event as the revenue engine emits it; returns the event id. */
export function emitRevised(db: Db, decisionId: string, intentId: string | null = null, ts = clock.now()): number {
  const info = db.prepare("INSERT INTO event (ts, topic, from_function, intent_id, payload_json) VALUES (?, 'rev.schedule.revised', 'revenue', ?, ?)")
    .run(ts, intentId, JSON.stringify({ modification_id: `mod_${decisionId}`, cause_decision_id: decisionId, contract_id: "CTR-initech-2026" }));
  return Number(info.lastInsertRowid);
}
