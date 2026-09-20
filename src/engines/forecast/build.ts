import { z } from "zod";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Db } from "../../ledger/db.js";
import { trialBalance } from "../../ledger/read.js";
import { systemClock, type Clock } from "../../runtime/config.js";
import { newId } from "../../runtime/ids.js";
import { periodOf } from "../asOf.js";
import { NOT_MODELLED, NOT_MODELLED_KIND, summarise, type ForecastLineKind, type ForecastSummary } from "./read.js";
import { addDays, addMonths, dayInPeriod, horizon, horizonEnd, periodsBetween, weekOf } from "./weeks.js";

export interface ScheduleOverride { contract_id: string; period: string; amount_cents: number }

export interface BuildOptions {
  /** Business date the forecast stands on. Never the wall clock: the seeded company lives in July 2026. */
  as_of_date: string;
  reason: string;
  cause_event_id?: number;
  cause_intent_id?: string;
  /**
   * Billing amounts to use INSTEAD of the active schedule's, per contract and period. For the "before" side of a
   * revision when no version predates it: the same date, the same ledger, the schedule as it stood before.
   */
  schedule_overrides?: readonly ScheduleOverride[];
}

interface Draft { week: string; kind: ForecastLineKind | typeof NOT_MODELLED_KIND; source_ref: string; amount_cents: number; fact_id: string | null }
interface Horizon { weeks: string[]; start: string; end: string }

const DEFAULT_TERMS_DAYS = 30;
const VENDOR_TERMS_DAYS = 30;
const MONTH = '[0-9][0-9][0-9][0-9]-[0-9][0-9]';
const Terms = z.object({ monthly_cents: z.number().int().optional(), payment_terms_days: z.number().int().nonnegative().optional(), billing: z.string().optional() });

/** Week of a dated document that is already owed: anything due before the horizon is expected now, in week 1. */
function owedWeek(date: string, h: Horizon): string | null {
  if (date > h.end) return null;
  return date < h.start ? h.start : weekOf(date);
}

/** Week of cash that does not exist as a document yet: kept only when its date falls inside the horizon. */
function projectedWeek(date: string, h: Horizon): string | null {
  return date < h.start || date > h.end ? null : weekOf(date);
}

/** Week 1 opens on GL cash through the as-of date, by the same query the kernel and the bank rec read. */
function openingLine(db: Db, asOfDate: string, h: Horizon): Draft {
  const cash = trialBalance(db, asOfDate).find((r) => r.account === ACCOUNTS.cash)?.balance_cents ?? 0;
  return { week: h.start, kind: "opening_cash", source_ref: `gl:${ACCOUNTS.cash}`, amount_cents: cash, fact_id: null };
}

/**
 * Cash the GL already carries for a date after the as-of date: a payment scheduled for next week, a post-dated receipt.
 * Posting it took the amount off the bill or invoice (open_cents), so the open-document lines no longer show it, and
 * opening cash stops at the as-of date, so without these lines the cash would be in neither place. One line per GL
 * cash line, in the week of the entry date, debit positive. No double count: what is still open on the document stays
 * an open-document line, what was applied is here, and once the as-of date reaches the entry it is opening cash.
 */
function glCashFutureLines(db: Db, asOfDate: string, h: Horizon): Draft[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.date, l.debit_cents - l.credit_cents AS cents FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id
       WHERE l.account = ? AND e.date > ? AND e.date <= ? ORDER BY e.date, e.id, l.line_no`,
    )
    .all(ACCOUNTS.cash, asOfDate, h.end) as Array<{ id: string; date: string; cents: number }>;
  return rows.filter((r) => r.cents !== 0).map((r) => ({ week: weekOf(r.date), kind: "gl_cash_future" as const, source_ref: r.id, amount_cents: r.cents, fact_id: null }));
}

/**
 * Open invoices at their due date. Disputed invoices are left out of the base case on purpose: a dispute says the
 * customer does not intend to pay on the due date, and the forecast must not count cash it has been told is contested.
 */
function arOpenInvoiceLines(db: Db, h: Horizon): Draft[] {
  const rows = db.prepare("SELECT id, due_date, open_cents FROM invoice WHERE open_cents > 0 AND status = 'open' ORDER BY id").all() as Array<{ id: string; due_date: string; open_cents: number }>;
  return rows.flatMap((r) => {
    const week = owedWeek(r.due_date, h);
    return week ? [{ week, kind: "ar_open_invoice" as const, source_ref: r.id, amount_cents: r.open_cents, fact_id: null }] : [];
  });
}

interface BillingRow { contract_id: string; period: string; amount_cents: number; terms_json: string }

/** Billing expectations from the active revenue schedules, so a revised schedule lowers the forecast with no other input. */
function scheduleRows(db: Db): BillingRow[] {
  return db
    .prepare(
      `SELECT s.contract_id, l.period, l.amount_cents, c.terms_json
       FROM rev_schedule s JOIN rev_schedule_line l ON l.schedule_id = s.id JOIN contract c ON c.id = s.contract_id
       WHERE s.status = 'active' ORDER BY s.contract_id, l.period`,
    )
    .all() as BillingRow[];
}

/** Standalone fallback, used only while no revenue schedule exists at all: the contract's monthly fee over its term. */
function contractRows(db: Db): BillingRow[] {
  const contracts = db.prepare("SELECT id, start_date, end_date, terms_json FROM contract ORDER BY id").all() as Array<{ id: string; start_date: string; end_date: string; terms_json: string }>;
  return contracts.flatMap((c) => {
    const monthly = parseTerms(c.terms_json).monthly_cents;
    if (!monthly) return [];
    return periodsBetween(periodOf(c.start_date), periodOf(c.end_date)).map((period) => ({ contract_id: c.id, period, amount_cents: monthly, terms_json: c.terms_json }));
  });
}

function parseTerms(termsJson: string): z.infer<typeof Terms> {
  const parsed = Terms.safeParse(JSON.parse(termsJson));
  return parsed.success ? parsed.data : {};
}

/**
 * Periods up to and including this one are already invoiced (they are open invoices or collected cash, not billings to
 * come). A contract with no invoice at all has been billed through LAST month, not this one: a contract that started
 * in the as-of month still owes that month's invoice, and counting the month as billed lost its cash altogether.
 */
function lastBilledPeriod(db: Db, contractId: string, asOfDate: string): string {
  const row = db.prepare("SELECT MAX(issue_date) AS d FROM invoice WHERE contract_id = ? AND status <> 'void'").get(contractId) as { d: string | null };
  return row.d ? periodOf(row.d) : addMonths(periodOf(asOfDate), -1);
}

/** Swap in the override amounts; an overridden period the schedule no longer has at all is added back on the contract's terms. */
function applyOverrides(db: Db, rows: BillingRow[], overrides: readonly ScheduleOverride[]): BillingRow[] {
  if (overrides.length === 0) return rows;
  const key = (contractId: string, period: string): string => `${contractId}|${period}`;
  const want = new Map(overrides.map((o) => [key(o.contract_id, o.period), o]));
  const seen = new Set<string>();
  const out = rows.map((r) => {
    const o = want.get(key(r.contract_id, r.period));
    if (!o) return r;
    seen.add(key(r.contract_id, r.period));
    return { ...r, amount_cents: o.amount_cents };
  });
  for (const [k, o] of want) {
    if (seen.has(k)) continue;
    const c = db.prepare("SELECT terms_json FROM contract WHERE id = ?").get(o.contract_id) as { terms_json: string } | undefined;
    if (c) out.push({ contract_id: o.contract_id, period: o.period, amount_cents: o.amount_cents, terms_json: c.terms_json });
  }
  return out;
}

/**
 * The fact behind a billing line: the contract's latest modification, when it covers the period and its fact row is
 * really there. forecast_line.fact_id is a foreign key, so a modification citing a fact that was never stored yields null.
 */
function factFor(db: Db, contractId: string, period: string): string | null {
  const mod = db
    .prepare("SELECT fact_id, effective_period, until FROM contract_modification WHERE contract_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(contractId) as { fact_id: string | null; effective_period: string; until: string | null } | undefined;
  if (!mod?.fact_id) return null;
  const covers = period >= mod.effective_period && (mod.until === null || period <= periodOf(mod.until));
  if (!covers) return null;
  return db.prepare("SELECT 1 FROM fact WHERE id = ?").get(mod.fact_id) ? mod.fact_id : null;
}

/**
 * Invoices still to be raised: issued on the 1st of the period, collected on the contract's payment terms.
 * - The as-of month's own invoice, when it has not been raised, is owed like a document: if its terms have already run
 *   out the cash lands in week 1, because the invoice is late, not the customer. Later months are projections and are
 *   kept only when their date falls inside the horizon.
 * - Only monthly billing is projected. A revenue schedule is not a billing schedule: an annual contract recognises
 *   revenue every month and bills once, so such contracts are skipped and named by a `not_modelled` marker instead.
 */
function arScheduledBillingLines(db: Db, opts: BuildOptions, h: Horizon): Draft[] {
  const hasSchedules = (db.prepare("SELECT COUNT(*) AS n FROM rev_schedule").get() as { n: number }).n > 0;
  const rows = applyOverrides(db, hasSchedules ? scheduleRows(db) : contractRows(db), opts.schedule_overrides ?? []);
  const asOfPeriod = periodOf(opts.as_of_date);
  const billedThrough = new Map<string, string>();
  const gaps = new Set<string>();
  const out: Draft[] = [];
  for (const r of rows) {
    const terms = parseTerms(r.terms_json);
    if (terms.billing !== undefined && terms.billing !== "monthly") {
      gaps.add(`billing:${terms.billing}:${r.contract_id}`);
      continue;
    }
    if (!billedThrough.has(r.contract_id)) billedThrough.set(r.contract_id, lastBilledPeriod(db, r.contract_id, opts.as_of_date));
    if (r.period <= billedThrough.get(r.contract_id)! || r.amount_cents === 0) continue;
    const cashDate = addDays(`${r.period}-01`, terms.payment_terms_days ?? DEFAULT_TERMS_DAYS);
    const week = r.period === asOfPeriod ? owedWeek(cashDate, h) : projectedWeek(cashDate, h);
    if (week) out.push({ week, kind: "ar_scheduled_billing", source_ref: `${r.contract_id}:${r.period}`, amount_cents: r.amount_cents, fact_id: factFor(db, r.contract_id, r.period) });
  }
  const markers = [...gaps].sort().map((label): Draft => ({ week: h.start, kind: NOT_MODELLED_KIND, source_ref: label, amount_cents: 0, fact_id: null }));
  return [...out, ...markers];
}

/** Bills on file and unpaid, held ones included: a hold delays a payment, it does not cancel the obligation. */
function apOpenBillLines(db: Db, h: Horizon): Draft[] {
  const rows = db
    .prepare("SELECT id, due_date, open_cents FROM bill WHERE open_cents > 0 AND status IN ('open','approved','scheduled','held') ORDER BY id")
    .all() as Array<{ id: string; due_date: string; open_cents: number }>;
  return rows.flatMap((r) => {
    const week = owedWeek(r.due_date, h);
    return week ? [{ week, kind: "ap_open_bill" as const, source_ref: r.id, amount_cents: -r.open_cents, fact_id: null }] : [];
  });
}

interface LatestBill { party_id: string; service_period: string; bill_date: string; total_cents: number }

/** Vendors that billed in at least 2 of the 3 most recent service periods, each with its latest bill. */
function recurringVendors(db: Db): LatestBill[] {
  // only bills that name a calendar month can be projected a month forward
  const recent = (db.prepare(`SELECT DISTINCT service_period AS p FROM bill WHERE service_period GLOB '${MONTH}' AND status <> 'void' ORDER BY p DESC LIMIT 3`).all() as Array<{ p: string }>).map((r) => r.p);
  if (recent.length < 2) return [];
  const marks = recent.map(() => "?").join(",");
  const vendors = db
    .prepare(`SELECT party_id FROM bill WHERE status <> 'void' AND service_period IN (${marks}) GROUP BY party_id HAVING COUNT(DISTINCT service_period) >= 2 ORDER BY party_id`)
    .all(...recent) as Array<{ party_id: string }>;
  const latest = db.prepare(`SELECT party_id, service_period, bill_date, total_cents FROM bill WHERE party_id = ? AND status <> 'void' AND service_period GLOB '${MONTH}' ORDER BY service_period DESC, bill_date DESC, id DESC LIMIT 1`);
  return vendors.map((v) => latest.get(v.party_id) as LatestBill);
}

/**
 * Bills that have not arrived yet from vendors who bill every month: the latest amount, on the usual day of the
 * month, due 30 days later. Without these the back half of the horizon shows no costs at all.
 */
function apRecurringLines(db: Db, h: Horizon): Draft[] {
  const out: Draft[] = [];
  for (const v of recurringVendors(db)) {
    const dayOfMonth = Number(v.bill_date.slice(8, 10));
    for (let period = addMonths(v.service_period, 1); ; period = addMonths(period, 1)) {
      const due = addDays(dayInPeriod(period, dayOfMonth), VENDOR_TERMS_DAYS);
      if (due > h.end) break;
      const week = projectedWeek(due, h);
      if (week) out.push({ week, kind: "ap_recurring", source_ref: `${v.party_id}:${period}`, amount_cents: -v.total_cents, fact_id: null });
    }
  }
  return out;
}

// Payroll is not modelled: the seeded world carries no payroll_run rows and no pay calendar, so there is nothing to
// project from. The summary says so in `not_modelled`, and outflows are understated by payroll until that data exists.
function collectLines(db: Db, opts: BuildOptions, h: Horizon): Draft[] {
  return [
    openingLine(db, opts.as_of_date, h),
    ...glCashFutureLines(db, opts.as_of_date, h),
    ...arOpenInvoiceLines(db, h),
    ...arScheduledBillingLines(db, opts, h),
    ...apOpenBillLines(db, h),
    ...apRecurringLines(db, h),
  ];
}

/**
 * Build a 13-week direct-method cash forecast as of a business date. Every call writes a NEW version
 * ('<as_of_date>/v<n>'); an earlier version is never touched, so two versions can always be diffed and the cause of
 * the newer one read from its row. Lines and version row land in one transaction.
 */
export function buildForecast(db: Db, opts: BuildOptions, clock: Clock = systemClock): ForecastSummary {
  const weeks = horizon(opts.as_of_date);
  const h: Horizon = { weeks, start: weeks[0]!, end: horizonEnd(weeks) };
  return db.transaction((): ForecastSummary => {
    const version = (db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM forecast_version WHERE as_of_date = ?").get(opts.as_of_date) as { v: number }).v;
    const asOf = `${opts.as_of_date}/v${version}`;
    const all = collectLines(db, opts, h);
    // markers are stored with the version, but they are not cash lines
    const drafts = all.filter((d): d is Draft & { kind: ForecastLineKind } => d.kind !== NOT_MODELLED_KIND);
    const insert = db.prepare("INSERT INTO forecast_line (id, as_of, week, kind, source_ref, amount_cents, fact_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const d of all) {
      if (!Number.isSafeInteger(d.amount_cents)) throw new Error(`forecast line ${d.kind} ${d.source_ref} is not integer cents`);
      insert.run(newId("fl"), asOf, d.week, d.kind, d.source_ref, d.amount_cents, d.fact_id);
    }
    const totals = summarise(drafts, weeks);
    const builtAt = clock.now();
    db.prepare(
      `INSERT INTO forecast_version (as_of, as_of_date, version, built_at, reason, cause_event_id, cause_intent_id,
         opening_cash_cents, inflow_cents, outflow_cents, min_cash_cents, min_cash_week) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(asOf, opts.as_of_date, version, builtAt, opts.reason, opts.cause_event_id ?? null, opts.cause_intent_id ?? null,
      totals.opening_cash_cents, totals.inflow_cents, totals.outflow_cents, totals.min_cash_cents, totals.min_cash_week);
    return {
      as_of: asOf, as_of_date: opts.as_of_date, version, built_at: builtAt, reason: opts.reason,
      cause_event_id: opts.cause_event_id ?? null, cause_intent_id: opts.cause_intent_id ?? null,
      ...totals, line_count: drafts.length,
      not_modelled: [...NOT_MODELLED, ...all.filter((d) => d.kind === NOT_MODELLED_KIND).map((d) => d.source_ref)],
    };
  })();
}
