import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal } from "../../contract/types.js";
import type { Db } from "../../ledger/db.js";
import { systemClock, type Clock } from "../../runtime/config.js";
import { proposeEntry, type ProposeResult } from "../../runtime/proposeEntry.js";
import { periodEnd, periodOf, worldToday } from "../asOf.js";
import { recordRipple } from "../ripple.js";
import { usd } from "./schedule.js";
import { booksStart, ensureSchedules, recognisedPeriods, recognisedStatus, type RevSchedule } from "./store.js";

export interface RecogniseLine {
  contract_id: string;
  party_id: string;
  period: string;
  amount_cents: number;
  schedule_version: number;
  /** posted and pending_approval wrote a rev_recognition row; skipped and failed wrote nothing. */
  status: "posted" | "pending_approval" | "skipped" | "failed";
  decision_id?: string;
  /** skipped: already_recognised | already_pending | stale_pending | declined | zero_amount | exceeds_deferred | earlier_period_unrecognised */
  reason?: string;
  detail?: string;
}

export interface RecogniseResult {
  period: string;
  intent_id: string;
  lines: RecogniseLine[];
  /** Set when the whole period was refused and nothing was proposed. */
  refused?: string;
}

interface Due { schedule: Omit<RevSchedule, "lines">; amount_cents: number; trace_id: string | null }

/**
 * Month-end recognition, per the active schedule: Dr 2400 deferred revenue / Cr 4000 subscription revenue, one
 * proposal per contract, all under one intent for the period. Above materiality the kernel parks the entry for a
 * person, so `pending_approval` is a normal outcome here. Re-running recognises nothing twice.
 */
export function recogniseMonth(db: Db, period: string, deps: { clock?: Clock } = {}): RecogniseResult {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new RangeError(`period must be YYYY-MM, got ${period}`);
  const clock = deps.clock ?? systemClock;
  // Revenue is recognised for a month the world has reached, never ahead of it: a future month would be earned out of
  // this month's billing (review finding: August posted against July's deferred revenue).
  const current = periodOf(worldToday(db));
  if (period > current) return { period, intent_id: `int_rev_${period}`, lines: [], refused: `${period} is after the world's current period ${current}` };
  ensureSchedules(db, clock);
  const intentId = ensureIntent(db, clock, period);
  const due = db
    .prepare(
      `SELECT s.id, s.contract_id, s.party_id, s.version, s.status, s.method, s.total_cents, s.modification_id, s.created_at, l.amount_cents, c.trace_id
       FROM rev_schedule s JOIN rev_schedule_line l ON l.schedule_id = s.id JOIN contract c ON c.id = s.contract_id
       WHERE s.status = 'active' AND l.period = ? ORDER BY s.contract_id`,
    )
    .all(period) as (Omit<RevSchedule, "lines"> & { amount_cents: number; trace_id: string | null })[];
  const lines = due.map(({ amount_cents, trace_id, ...schedule }) =>
    db.transaction(() => recogniseOne(db, clock, intentId, period, { schedule, amount_cents, trace_id }))());
  return { period, intent_id: intentId, lines };
}

function ensureIntent(db: Db, clock: Clock, period: string): string {
  const id = `int_rev_${period}`;
  db.prepare("INSERT OR IGNORE INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'revenue', ?, 'revenue', 'open', ?)")
    .run(id, `Recognise ${period} subscription revenue per schedule`, clock.now());
  return id;
}

function recogniseOne(db: Db, clock: Clock, intentId: string, period: string, due: Due): RecogniseLine {
  const s = due.schedule;
  const base = { contract_id: s.contract_id, party_id: s.party_id, period, amount_cents: due.amount_cents, schedule_version: s.version };
  const skip = skipReason(db, s, period, due.amount_cents);
  if (skip) return { ...base, status: "skipped", ...skip };
  const result = proposeEntry(db, buildProposal(db, intentId, period, due), { mode: "live", actor: "engine:revenue", autonomy_level: "auto", tier: 0 }, { clock });
  if (result.status !== "posted" && result.status !== "pending_approval") return { ...base, status: "failed", decision_id: "decision_id" in result ? result.decision_id : undefined, detail: failureDetail(result) };
  // OR REPLACE: a row that pointed at a dead decision is taken over by the new one (skipReason let it through).
  db.prepare("INSERT OR REPLACE INTO rev_recognition (contract_id, period, amount_cents, schedule_id, decision_id) VALUES (?, ?, ?, ?, ?)")
    .run(s.contract_id, period, due.amount_cents, s.id, result.decision_id);
  rippleToCause(db, clock, s, period, due.amount_cents, result.decision_id, result.status);
  return { ...base, status: result.status, decision_id: result.decision_id };
}

/** Why this contract-month must not be proposed (again). Undefined means go ahead. */
function skipReason(db: Db, s: Due["schedule"], period: string, amount: number): { reason: string; decision_id?: string; detail?: string; amount_cents?: number } | undefined {
  const existing = db.prepare("SELECT amount_cents, decision_id FROM rev_recognition WHERE contract_id = ? AND period = ?").get(s.contract_id, period) as { amount_cents: number; decision_id: string } | undefined;
  const status = recognisedStatus(db, s.contract_id, period);
  if (existing && status === "pending" && existing.amount_cents !== amount) {
    return { reason: "stale_pending", decision_id: existing.decision_id, detail: `parked at ${usd(existing.amount_cents)} but schedule v${s.version} now says ${usd(amount)}: reject the parked entry, then re-run` };
  }
  // A blocked decision is dead (route BLOCK is terminal: the wrong approver clicked), and so is a declined one. Propose
  // again, unless a person declined exactly this amount: asking the same question twice is not the engine's call.
  const dead = status === "blocked" || (status === "declined" && existing?.amount_cents !== amount);
  if (existing && !dead) {
    // Report what actually posted, not what the schedule says today: the two differ when a memo came after recognition.
    const detail = existing.amount_cents !== amount ? `recognised at ${usd(existing.amount_cents)}; schedule v${s.version} now says ${usd(amount)}` : undefined;
    return { reason: status === "posted" ? "already_recognised" : status === "declined" ? "declined" : "already_pending", decision_id: existing.decision_id, amount_cents: existing.amount_cents, detail };
  }
  const earlier = earliestUnrecognised(db, s, period);
  if (earlier) return { reason: "earlier_period_unrecognised", detail: `${earlier} is still open for ${s.contract_id}; months are recognised in order` };
  if (status === "locked") return { reason: "already_recognised", detail: "period closed by humans" };
  if (amount === 0) return { reason: "zero_amount" };
  const available = deferredAvailable(db, s.party_id);
  // Never recognise what was not billed: revenue may only come out of deferred revenue that is actually there.
  if (amount > available) return { reason: "exceeds_deferred", detail: `schedule says ${usd(amount)} but ${s.party_id} has ${usd(available)} of deferred revenue not already spoken for` };
  return undefined;
}

/** The first earlier month of this contract with revenue still to recognise (not locked, not posted), if any. */
function earliestUnrecognised(db: Db, s: Due["schedule"], period: string): string | undefined {
  const done = recognisedPeriods(db, s.contract_id);
  const lines = db.prepare("SELECT period, amount_cents FROM rev_schedule_line WHERE schedule_id = ? AND period < ? ORDER BY period").all(s.id, period) as { period: string; amount_cents: number }[];
  return lines.find((l) => l.amount_cents > 0 && !done.has(l.period))?.period;
}

/** The party's GL 2400 credit balance, less recognitions already parked against it and waiting for approval. */
function deferredAvailable(db: Db, partyId: string): number {
  const gl = (db.prepare("SELECT COALESCE(SUM(credit_cents - debit_cents), 0) AS n FROM gl_line WHERE account = ? AND party_id = ?").get(ACCOUNTS.deferred_revenue, partyId) as { n: number }).n;
  const parked = (db
    .prepare(
      `SELECT COALESCE(SUM(r.amount_cents), 0) AS n FROM rev_recognition r JOIN rev_schedule s ON s.id = r.schedule_id JOIN decision d ON d.id = r.decision_id
       WHERE s.party_id = ? AND d.posted_at IS NULL AND d.route = 'PROPOSE' AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')`,
    )
    .get(partyId) as { n: number }).n;
  return gl - parked;
}

function buildProposal(db: Db, intentId: string, period: string, due: Due): Proposal {
  const s = due.schedule;
  const memo = `Revenue ${period} ${s.contract_id} per schedule v${s.version}`;
  // The kernel (E1) rejects a citation that does not resolve, and the contract trace exists only after ingestion.
  const traced = due.trace_id !== null && db.prepare("SELECT 1 FROM trace WHERE id = ?").get(due.trace_id) !== undefined;
  return {
    intent_id: intentId, function: "revenue", kind: "rev_recognition", party_id: s.party_id, entry_date: periodEnd(period), applications: [],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: due.amount_cents, credit_cents: 0, memo },
      { account: ACCOUNTS.subscription_revenue, debit_cents: 0, credit_cents: due.amount_cents, memo },
    ],
    evidence: traced ? [{ claim: `${s.contract_id} is the contract this schedule spreads`, trace_id: due.trace_id! }] : [],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}

function failureDetail(r: ProposeResult): string {
  if (r.status === "invalid") return `invalid: ${r.issues.join("; ")}`;
  if (r.status === "blocked") return `blocked: ${r.rule}`;
  if (r.status === "rejected") return `rejected: ${r.failed.map((m) => `${m.check} ${m.detail}`).join("; ")}`;
  return r.status;
}

/** When a concession changed this month's line, the recognition is part of that intent's ripple: show it there. */
function rippleToCause(db: Db, clock: Clock, s: Due["schedule"], period: string, amount: number, decisionId: string, status: string): void {
  const mods = db.prepare("SELECT cause_intent_id, effective_period, until FROM contract_modification WHERE contract_id = ? AND cause_intent_id IS NOT NULL ORDER BY rowid")
    .all(s.contract_id) as { cause_intent_id: string; effective_period: string; until: string | null }[];
  const v1 = db.prepare("SELECT l.amount_cents FROM rev_schedule_line l JOIN rev_schedule v ON v.id = l.schedule_id WHERE v.contract_id = ? AND v.version = 1 AND l.period = ?")
    .get(s.contract_id, period) as { amount_cents: number } | undefined;
  for (const m of mods) {
    if (period < m.effective_period || period > periodOf(m.until ?? m.effective_period)) continue;
    const before = v1?.amount_cents ?? null;
    // a ripple left by a dead decision for this contract-month gives way to the live one; its artifact is marked unwound, not deleted
    const ref = `${s.contract_id}:${period}`;
    db.prepare("DELETE FROM ripple WHERE intent_id = ? AND function = 'revenue' AND kind = 'rev_recognition' AND ref = ?").run(m.cause_intent_id, ref);
    db.prepare("UPDATE artifact SET unwound_at = ? WHERE intent_id = ? AND function = 'revenue' AND kind = 'rev_recognition' AND external_id = ? AND unwound_at IS NULL").run(clock.now(), m.cause_intent_id, ref);
    recordRipple(db, {
      intent_id: m.cause_intent_id, function: "revenue", kind: "rev_recognition", ref,
      summary: `${s.contract_id} revenue ${period}: ${usd(amount)} per schedule v${s.version}${before !== null && before !== amount ? ` (was ${usd(before)} on v1)` : ""}, Dr ${ACCOUNTS.deferred_revenue} / Cr ${ACCOUNTS.subscription_revenue}`,
      before_cents: before, after_cents: amount, delta_cents: before === null ? null : amount - before, artifact: { decision_id: decisionId, system: "ledger" },
    }, clock);
  }
}

export interface TieOutRow {
  party_id: string;
  billed_cents: number;
  credit_memo_cents: number;
  scheduled_cents: number;
  /** billed - credit memos - scheduled: what deferred revenue should be once everything scheduled through the period is recognised. */
  expected_cents: number;
  gl_deferred_cents: number;
  diff_cents: number;
  tied: boolean;
}

export interface TieOut { period: string; rows: TieOutRow[]; total: TieOutRow }

/**
 * Deferred revenue, GL against schedule, per customer, through the end of `period`. Scheduled amounts count only
 * from the first period the books carry: a contract that began before the ledger did was billed and earned elsewhere.
 */
export function deferredTieOut(db: Db, period: string): TieOut {
  const end = periodEnd(period);
  // Billed comes from the invoices, not from credits to 2400: a stray credit to deferred revenue must show up as a
  // difference, not be absorbed as "billing" (review finding).
  const billed = new Map((db.prepare("SELECT party_id, SUM(total_cents) AS n FROM invoice WHERE status <> 'void' AND issue_date <= ? GROUP BY party_id").all(end) as { party_id: string; n: number }[]).map((r) => [r.party_id, r.n]));
  const gl = db
    .prepare(
      `SELECT l.party_id AS party_id,
              SUM(CASE WHEN d.kind = 'credit_memo' THEN l.debit_cents ELSE 0 END) AS memos, SUM(l.credit_cents - l.debit_cents) AS balance
       FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id LEFT JOIN decision d ON d.id = e.source_decision_id
       WHERE l.account = ? AND l.party_id IS NOT NULL AND e.date <= ? GROUP BY l.party_id`,
    )
    .all(ACCOUNTS.deferred_revenue, end) as { party_id: string; memos: number; balance: number }[];
  const scheduled = db
    .prepare("SELECT s.party_id AS party_id, SUM(l.amount_cents) AS n FROM rev_schedule s JOIN rev_schedule_line l ON l.schedule_id = s.id WHERE s.status = 'active' AND l.period >= ? AND l.period <= ? GROUP BY s.party_id")
    .all(booksStart(db) ?? "0000-00", period) as { party_id: string; n: number }[];
  const parties = [...new Set([...gl.map((r) => r.party_id), ...scheduled.map((r) => r.party_id), ...billed.keys()])].sort();
  const rows = parties.map((party) => {
    const g = gl.find((r) => r.party_id === party);
    return tieRow(party, billed.get(party) ?? 0, g?.memos ?? 0, scheduled.find((r) => r.party_id === party)?.n ?? 0, g?.balance ?? 0);
  });
  const sum = (f: (r: TieOutRow) => number): number => rows.reduce((n, r) => n + f(r), 0);
  const total = tieRow("TOTAL", sum((r) => r.billed_cents), sum((r) => r.credit_memo_cents), sum((r) => r.scheduled_cents), sum((r) => r.gl_deferred_cents));
  return { period, rows, total: { ...total, tied: rows.every((r) => r.tied) } };
}

function tieRow(partyId: string, billed: number, memos: number, scheduled: number, glDeferred: number): TieOutRow {
  const expected = billed - memos - scheduled;
  return { party_id: partyId, billed_cents: billed, credit_memo_cents: memos, scheduled_cents: scheduled, expected_cents: expected, gl_deferred_cents: glDeferred, diff_cents: glDeferred - expected, tied: glDeferred === expected && glDeferred >= 0 };
}
