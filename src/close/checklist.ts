import { accrualsCheck } from "../agents/close/accruals.js";
import { ACCOUNTS } from "../contract/accounts.js";
import { periodEnd, periodOf } from "../engines/asOf.js";
import type { Db } from "../ledger/db.js";
import { bankUnmatched } from "../ledger/read.js";
import { readControlTotals } from "../runtime/kernelContext.js";

/**
 * What one checklist condition reads from the ledger. `done` is the whole truth: the conductor never ticks an item
 * because an event said so. `reason` is the "what is stuck" text the console shows while it is not done.
 */
export interface CheckResult {
  done: boolean;
  reason: string;
  /** The decisions this item rests on. They link a tick back to the intents that caused it (the ripple view). */
  decision_ids: string[];
  /** Some of the work is there but not all of it: shows as 'in_progress' rather than 'todo'. */
  partial?: boolean;
}

export interface ChecklistTemplateItem {
  slug: string;
  function: string;
  name: string;
  /** Slugs of the items that must be done first. */
  depends_on: string[];
  check: (db: Db, period: string) => CheckResult;
}

export interface ChecklistItemDef extends Omit<ChecklistTemplateItem, "depends_on"> {
  /** `${period}:${slug}` */
  id: string;
  /** Item ids, same period. */
  depends_on: string[];
}

export const LOCK_SLUG = "lock-period";
export const ACCRUALS_SLUG = "accruals-posted";

export const itemId = (period: string, slug: string): string => `${period}:${slug}`;

const dollars = (cents: number): string => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
};

// ───────────── bank rec

function checkBankLines(db: Db, period: string): CheckResult {
  const end = periodEnd(period);
  const total = (db.prepare("SELECT COUNT(*) AS n FROM bank_txn WHERE amount_cents > 0 AND posted_date BETWEEN ? AND ?").get(`${period}-01`, end) as { n: number }).n;
  // A bank rec with no bank statement is not a finished bank rec: nothing ingested must never read as nothing left.
  if (total === 0) return { done: false, reason: `no bank credit lines ingested for ${period}`, decision_ids: [] };
  const left = bankUnmatched(db, { side: "credit", since: `${period}-01` }).filter((t) => t.posted_date <= end);
  if (left.length === 0) return { done: true, reason: `all ${total} bank credit line(s) applied or explained`, decision_ids: [] };
  const cents = left.reduce((n, t) => n + t.unapplied_cents, 0);
  const some = left.slice(0, 5).map((t) => t.id).join(", ");
  return {
    done: false, decision_ids: [], partial: left.length < total,
    reason: `${left.length} of ${total} bank credit line(s) not fully applied (${dollars(cents)} unapplied): ${some}${left.length > 5 ? ", ..." : ""}`,
  };
}

// ───────────── control accounts

function checkArTied(db: Db): CheckResult {
  const c = readControlTotals(db);
  const diff = c.ar_gl_cents - c.ar_subledger_cents;
  if (diff === 0) return { done: true, reason: `GL ${c.ar_account} ${dollars(c.ar_gl_cents)} equals open invoices`, decision_ids: [] };
  return { done: false, reason: `GL ${c.ar_account} ${dollars(c.ar_gl_cents)} vs open invoices ${dollars(c.ar_subledger_cents)}: off by ${dollars(diff)}`, decision_ids: [] };
}

function checkApTied(db: Db): CheckResult {
  const c = readControlTotals(db);
  const diff = c.ap_gl_cents - c.ap_subledger_cents;
  if (diff === 0) return { done: true, reason: `GL ${c.ap_account} ${dollars(c.ap_gl_cents)} equals approved and scheduled bills`, decision_ids: [] };
  return { done: false, reason: `GL ${c.ap_account} ${dollars(c.ap_gl_cents)} vs approved and scheduled bills ${dollars(c.ap_subledger_cents)}: off by ${dollars(diff)}`, decision_ids: [] };
}

// ───────────── AR concessions

interface MemoRow { id: string; posted_at: string | null; reviewed: number }

/** Live credit memos dated in the period that are posted or still parked. Kernel rejects, blocks and declined memos are not concessions. */
function creditMemos(db: Db, period: string): MemoRow[] {
  return db
    .prepare(
      `SELECT d.id, d.posted_at,
              EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'approved'
                        AND a.approver_kind IN ('human','controller_agent')) AS reviewed
       FROM decision d
       WHERE d.mode = 'live' AND d.kind = 'credit_memo' AND substr(json_extract(d.proposal_json, '$.entry_date'), 1, 7) = ?
         AND (d.posted_at IS NOT NULL OR (d.route = 'PROPOSE'
              AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')))
       ORDER BY d.rowid`,
    )
    .all(period) as MemoRow[];
}

interface IntentRow { id: string; function: string; question: string; status: string; case_json: string | null }

/**
 * The period an intent belongs to, from its case file. An intent that cannot be dated returns null and is counted
 * against every period: an open question nobody can place must not let a month look finished.
 */
function intentPeriod(row: IntentRow): string | null {
  if (!row.case_json) return null;
  try {
    const date = (JSON.parse(row.case_json) as { entry_date?: unknown } | null)?.entry_date;
    return typeof date === "string" && /^\d{4}-\d{2}/.test(date) ? periodOf(date) : null;
  } catch {
    return null;
  }
}

function intentsInPeriod(db: Db, period: string, statuses: string[], fn?: string): IntentRow[] {
  const marks = statuses.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, function, question, status, case_json FROM intent WHERE status IN (${marks}) ${fn ? "AND function = ?" : ""} ORDER BY created_at, id`)
    .all(...statuses, ...(fn ? [fn] : [])) as IntentRow[];
  return rows.filter((r) => (intentPeriod(r) ?? period) === period);
}

function checkConcessions(db: Db, period: string): CheckResult {
  const memos = creditMemos(db, period);
  const decision_ids = memos.map((m) => m.id);
  if (memos.length === 0) {
    const live = intentsInPeriod(db, period, ["open", "waiting_on_human"], "ar");
    if (live.length === 0) return { done: true, reason: `no credit memos in ${period} and no AR case still open`, decision_ids };
    return { done: false, reason: `no credit memos yet, but ${live.length} AR case(s) still unresolved (a concession may still be found): ${live.slice(0, 5).map((i) => i.id).join(", ")}`, decision_ids };
  }
  const parked = memos.filter((m) => !m.posted_at);
  const unreviewed = memos.filter((m) => m.posted_at && !m.reviewed);
  if (parked.length === 0 && unreviewed.length === 0) return { done: true, reason: `${memos.length} credit memo(s) posted and approved`, decision_ids };
  const parts: string[] = [];
  if (parked.length > 0) parts.push(`${parked.length} credit memo(s) waiting for approval: ${parked.map((m) => m.id).join(", ")}`);
  if (unreviewed.length > 0) parts.push(`${unreviewed.length} posted without an approval on record: ${unreviewed.map((m) => m.id).join(", ")}`);
  return { done: false, reason: parts.join("; "), decision_ids, partial: true };
}

// ───────────── revenue

function checkSchedulesRevised(db: Db, period: string): CheckResult {
  const posted = creditMemos(db, period).filter((m) => m.posted_at);
  const decision_ids = posted.map((m) => m.id);
  if (posted.length === 0) return { done: true, reason: `no posted concessions in ${period} to revise a schedule for`, decision_ids };
  const has = db.prepare("SELECT 1 FROM contract_modification WHERE cause_decision_id = ?");
  const missing = posted.filter((m) => has.get(m.id) === undefined);
  if (missing.length === 0) return { done: true, reason: `${posted.length} concession(s), each with a contract modification on record`, decision_ids };
  return { done: false, reason: `${missing.length} of ${posted.length} concession(s) with no contract modification yet: ${missing.map((m) => m.id).join(", ")}`, decision_ids };
}

interface RecognitionRow { contract_id: string; amount_cents: number; decision_id: string | null; recognised_cents: number | null; posted_at: string | null }

/** Every active schedule line of the period that is due (amount > 0), with whatever recognition row sits against it. */
function recognitionRows(db: Db, period: string): RecognitionRow[] {
  return db
    .prepare(
      `SELECT s.contract_id, l.amount_cents, r.decision_id, r.amount_cents AS recognised_cents, d.posted_at
       FROM rev_schedule s JOIN rev_schedule_line l ON l.schedule_id = s.id AND l.period = ?
       LEFT JOIN rev_recognition r ON r.contract_id = s.contract_id AND r.period = l.period
       LEFT JOIN decision d ON d.id = r.decision_id
       WHERE s.status = 'active' AND l.amount_cents > 0 ORDER BY s.contract_id`,
    )
    .all(period) as RecognitionRow[];
}

/**
 * Customers whose deferred revenue (GL 2400, by party) is below zero at period end: more revenue was taken out than
 * was ever billed in. That is what a recognition posted at a superseded amount leaves behind, so it holds the item.
 */
function negativeDeferred(db: Db, period: string): Array<{ party_id: string; name: string; cents: number }> {
  return db
    .prepare(
      `SELECT l.party_id, p.name, SUM(l.credit_cents - l.debit_cents) AS cents
       FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id JOIN party p ON p.id = l.party_id
       WHERE l.account = ? AND p.kind = 'customer' AND e.date <= ?
       GROUP BY l.party_id HAVING cents < 0 ORDER BY l.party_id`,
    )
    .all(ACCOUNTS.deferred_revenue, periodEnd(period)) as Array<{ party_id: string; name: string; cents: number }>;
}

const firstFive = (parts: string[], sep = ", "): string => `${parts.slice(0, 5).join(sep)}${parts.length > 5 ? `${sep}...` : ""}`;

/**
 * "Recognised per schedule" means the amount in the ledger is the amount the ACTIVE schedule says, not only that some
 * recognition posted: one parked at $12,000 before the schedule was revised to $10,800, and approved afterwards,
 * posts the wrong revenue. So a posted recognition must equal its active line, and no customer may be left with
 * negative deferred revenue.
 */
function checkRecognised(db: Db, period: string): CheckResult {
  const schedules = (db.prepare("SELECT COUNT(*) AS n FROM rev_schedule").get() as { n: number }).n;
  if (schedules === 0) return { done: false, reason: "no schedules built", decision_ids: [] };
  const lines = recognitionRows(db, period);
  const decision_ids = lines.filter((l) => l.decision_id).map((l) => l.decision_id as string);
  const open = lines.filter((l) => !l.posted_at);
  const wrong = lines.filter((l) => l.posted_at && l.recognised_cents !== l.amount_cents);
  const negative = negativeDeferred(db, period);
  if (open.length === 0 && wrong.length === 0 && negative.length === 0) {
    return { done: true, reason: `${lines.length} schedule line(s) for ${period} recognised and posted at the scheduled amount`, decision_ids };
  }
  const parts: string[] = [];
  if (open.length > 0) {
    const parked = open.filter((l) => l.decision_id).length;
    parts.push(`${open.length} of ${lines.length} schedule line(s) not recognised (${parked} waiting for approval): ${firstFive(open.map((l) => l.contract_id))}`);
  }
  if (wrong.length > 0) {
    const named = wrong.map((l) => `${l.contract_id} recognised ${dollars(l.recognised_cents ?? 0)} but the active schedule says ${dollars(l.amount_cents)} (${l.decision_id})`);
    parts.push(`${wrong.length} recognition(s) posted at the wrong amount: ${firstFive(named, "; ")}`);
  }
  if (negative.length > 0) {
    parts.push(`deferred revenue (GL ${ACCOUNTS.deferred_revenue}) is negative through ${periodEnd(period)}: ${firstFive(negative.map((n) => `${n.name} (${n.party_id}) ${dollars(n.cents)}`), "; ")}`);
  }
  const good = lines.length - open.length - wrong.length;
  return { done: false, decision_ids, partial: good > 0 || wrong.length > 0, reason: parts.join("; ") };
}

// ───────────── forecast

interface ForecastRow { as_of: string; built_at: string }

/**
 * Current means: built for (or after) the latest `rev.schedule.revised` event. The event is the only thing that makes
 * the forecast engine rebuild, so it is the thing to compare against. A `contract_modification` that changed no
 * schedule emits nothing to rebuild for, and wall-clock equality says nothing under a fixed clock, so neither is read.
 * The engine's own pre-revision baseline has no cause_event_id: it only counts when built strictly after the event.
 */
function checkForecast(db: Db): CheckResult {
  const f = db.prepare("SELECT as_of, built_at FROM forecast_version ORDER BY rowid DESC LIMIT 1").get() as ForecastRow | undefined;
  if (!f) return { done: false, reason: "no forecast built yet", decision_ids: [] };
  const e = db.prepare("SELECT id, ts FROM event WHERE topic = 'rev.schedule.revised' ORDER BY id DESC LIMIT 1").get() as { id: number; ts: string } | undefined;
  if (!e) return { done: true, reason: `forecast ${f.as_of} is current: no schedule has been revised`, decision_ids: [] };
  const hit = db
    .prepare("SELECT as_of, built_at FROM forecast_version WHERE cause_event_id >= ? OR built_at > ? ORDER BY (cause_event_id IS NOT NULL) DESC, rowid DESC LIMIT 1")
    .get(e.id, e.ts) as ForecastRow | undefined;
  if (hit) return { done: true, reason: `forecast ${hit.as_of} was built for the last schedule revision (event ${e.id})`, decision_ids: [] };
  return { done: false, reason: `forecast ${f.as_of} does not include the last schedule revision (event ${e.id}): rebuild needed`, decision_ids: [], partial: true };
}

// ───────────── close

function checkEscalations(db: Db, period: string): CheckResult {
  const waiting = intentsInPeriod(db, period, ["waiting_on_human"]);
  const asking = db
    .prepare(
      `SELECT DISTINCT i.id, i.function, i.question, i.status, i.case_json
       FROM escalation e JOIN decision d ON d.id = e.decision_id JOIN intent i ON i.id = d.intent_id
       WHERE e.answered_at IS NULL AND d.mode = 'live' ORDER BY i.created_at, i.id`,
    )
    .all() as IntentRow[];
  const stuck = new Map<string, IntentRow>();
  for (const r of [...waiting, ...asking.filter((a) => (intentPeriod(a) ?? period) === period)]) stuck.set(r.id, r);
  if (stuck.size === 0) return { done: true, reason: `no question to a person is open for ${period}`, decision_ids: [] };
  const named = [...stuck.values()].slice(0, 5).map((i) => `${i.id} "${i.question}"`).join("; ");
  return { done: false, reason: `${stuck.size} case(s) waiting on a person: ${named}${stuck.size > 5 ? "; ..." : ""}`, decision_ids: [] };
}

function checkTbFoots(db: Db, period: string): CheckResult {
  const t = db
    .prepare("SELECT COALESCE(SUM(l.debit_cents), 0) AS dr, COALESCE(SUM(l.credit_cents), 0) AS cr FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE e.date <= ?")
    .get(periodEnd(period)) as { dr: number; cr: number };
  if (t.dr === t.cr) return { done: true, reason: `debits and credits both ${dollars(t.dr)} through ${periodEnd(period)}`, decision_ids: [] };
  return { done: false, reason: `debits ${dollars(t.dr)} vs credits ${dollars(t.cr)} through ${periodEnd(period)}: off by ${dollars(t.dr - t.cr)}`, decision_ids: [] };
}

/**
 * The July close as data. The checks are code, never stored: a row in `checklist_item` is only the last answer.
 * Order here is display order; the conductor evaluates in dependency order.
 */
export const CLOSE_TEMPLATE: readonly ChecklistTemplateItem[] = [
  { slug: "bank-lines-applied", function: "bank-rec", name: "Bank credits applied or explained", depends_on: [], check: checkBankLines },
  { slug: "ar-tied", function: "ar", name: "AR subledger ties to GL 1200", depends_on: [], check: (db) => checkArTied(db) },
  { slug: "ap-tied", function: "ap", name: "AP subledger ties to GL 2000", depends_on: [], check: (db) => checkApTied(db) },
  { slug: "ar-concessions-reviewed", function: "ar", name: "AR concessions reviewed", depends_on: [], check: checkConcessions },
  { slug: "rev-schedules-revised", function: "revenue", name: "Revenue schedules revised for every concession", depends_on: ["ar-concessions-reviewed"], check: checkSchedulesRevised },
  { slug: "rev-recognised", function: "revenue", name: "Revenue recognised per schedule", depends_on: ["rev-schedules-revised"], check: checkRecognised },
  { slug: "forecast-current", function: "forecast", name: "13-week forecast rebuilt after the last schedule change", depends_on: [], check: (db) => checkForecast(db) },
  { slug: "escalations-answered", function: "close", name: "No open questions to people", depends_on: [], check: checkEscalations },
  { slug: "tb-foots", function: "close", name: "Trial balance foots", depends_on: [], check: checkTbFoots },
  // Lane A's close pack finds them (agents/close): a recurring vendor expense with nothing booked for the month. Prepaid amortisation is not built.
  { slug: ACCRUALS_SLUG, function: "close", name: "Accruals posted for expenses not yet billed", depends_on: [], check: (db, period) => accrualsCheck(db, period) },
];

/** Locking is a person's approval. Once everything else is done the item says so and waits; it never ticks itself. */
const LOCK_ITEM = (others: readonly ChecklistTemplateItem[]): ChecklistTemplateItem => ({
  slug: LOCK_SLUG, function: "close", name: "Lock the period", depends_on: others.map((t) => t.slug),
  check: () => ({ done: false, reason: "every other item is done: waiting on the controller to approve the lock", decision_ids: [] }),
});

/** The template bound to one period: stable ids, dependencies as ids, lock-period depending on everything else. */
export function checklistFor(period: string, template: readonly ChecklistTemplateItem[] = CLOSE_TEMPLATE): ChecklistItemDef[] {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error(`checklist: period must be 'YYYY-MM', got ${period}`);
  const all = template.some((t) => t.slug === LOCK_SLUG) ? template : [...template, LOCK_ITEM(template)];
  return all.map((t) => ({ ...t, id: itemId(period, t.slug), depends_on: t.depends_on.map((slug) => itemId(period, slug)) }));
}
