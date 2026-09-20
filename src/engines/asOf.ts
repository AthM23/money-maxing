import type { Db } from "../ledger/db.js";

/**
 * The world's "today": the latest date the bank has reported. The seeded company lives in July 2026 while the
 * wall clock says September, so business dates (forecast as-of, what is overdue) come from here, never from Date.now().
 */
export function worldToday(db: Db): string {
  const row = db.prepare("SELECT MAX(posted_date) AS d FROM bank_txn").get() as { d: string | null };
  if (row.d) return row.d;
  const open = db.prepare("SELECT MIN(id) AS p FROM period WHERE status = 'open'").get() as { p: string | null };
  if (!open.p) throw new Error("worldToday: no bank lines and no open period");
  return `${open.p}-01`;
}

/** Last calendar day of a 'YYYY-MM' period. */
export function periodEnd(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export const periodOf = (isoDate: string): string => isoDate.slice(0, 7);
