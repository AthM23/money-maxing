import { ACCOUNTS } from "../../contract/accounts.js";
import type { Db } from "../../runtime/db.js";

/**
 * What a vendor has cost us, by month and expense account, read off the ledger and nothing else. An accrual is an
 * estimate of an expense nobody has billed yet; the only honest basis for one is what the books already show, or a
 * figure the vendor has put in writing. Both the code tier and the kernel read history through here, so the kernel
 * re-performs the estimate from the same lines an auditor would pull.
 */
export interface ExpenseHistory {
  party_id: string;
  account: string;
  /** The three months before `period`, oldest first, in cents. A month with nothing booked is 0. */
  prior: { period: string; cents: number }[];
  /** Already booked for `period` itself, whether from a bill or an accrual. */
  booked_cents: number;
}

const NOT_EXPENSE = [ACCOUNTS.cash, ACCOUNTS.ar, ACCOUNTS.ap, ACCOUNTS.accrued_liabilities, ACCOUNTS.prepaid];

export function priorPeriods(period: string, n = 3): string[] {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - (n - i), 1)).toISOString().slice(0, 7));
}

export const lastDayOf = (period: string): string => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);

export function expenseHistory(db: Db, partyId: string, account: string, period: string): ExpenseHistory {
  const booked = db.prepare(
    `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0) AS cents FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id
     WHERE l.party_id = ? AND l.account = ? AND e.period = ?`,
  );
  const cents = (p: string): number => (booked.get(partyId, account, p) as { cents: number }).cents;
  return { party_id: partyId, account, prior: priorPeriods(period).map((p) => ({ period: p, cents: cents(p) })), booked_cents: cents(period) };
}

/** Every vendor and expense account with something booked in each of the three months before `period`. */
export function recurringExpenses(db: Db, period: string): ExpenseHistory[] {
  const months = priorPeriods(period);
  const rows = db
    .prepare(
      `SELECT l.party_id, l.account FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id JOIN party p ON p.id = l.party_id
       WHERE p.kind = 'vendor' AND l.debit_cents > 0 AND l.account NOT IN (${NOT_EXPENSE.map(() => "?").join(",")}) AND e.period IN (?, ?, ?)
       GROUP BY l.party_id, l.account HAVING COUNT(DISTINCT e.period) = 3 ORDER BY l.party_id, l.account`,
    )
    .all(...NOT_EXPENSE, ...months) as { party_id: string; account: string }[];
  return rows.map((r) => expenseHistory(db, r.party_id, r.account, period));
}

export const median3 = (h: ExpenseHistory): number => [...h.prior.map((p) => p.cents)].sort((a, b) => a - b)[1] ?? 0;

/** Steady enough for code to estimate: the three months sit within one percent of their median. */
export function isSteady(h: ExpenseHistory): boolean {
  const values = h.prior.map((p) => p.cents);
  const mid = median3(h);
  return values.every((v) => v > 0) && Math.max(...values) - Math.min(...values) <= Math.floor(mid / 100);
}
