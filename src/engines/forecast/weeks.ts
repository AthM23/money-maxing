/**
 * Calendar arithmetic for the 13-week forecast. Pure: every function takes its date as an argument and works in UTC,
 * so a forecast built in any timezone, or replayed on any day, buckets the same cash into the same week.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_PERIOD = /^\d{4}-\d{2}$/;
const DAY_MS = 86_400_000;

export const HORIZON_WEEKS = 13;

function toUtcMs(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) throw new Error(`not an ISO date: ${isoDate}`);
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not a calendar date: ${isoDate}`);
  return ms;
}

const fromUtcMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `isoDate` plus `days` calendar days (negative goes back). */
export function addDays(isoDate: string, days: number): string {
  return fromUtcMs(toUtcMs(isoDate) + days * DAY_MS);
}

/** The Monday that starts the week containing `isoDate` (weeks run Monday to Sunday). */
export function weekOf(isoDate: string): string {
  const ms = toUtcMs(isoDate);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7; // getUTCDay: Sunday = 0
  return fromUtcMs(ms - sinceMonday * DAY_MS);
}

/** The Sunday that ends the week starting on `weekStart`. */
export const weekEnd = (weekStart: string): string => addDays(weekStart, 6);

/** `n` week-start dates, beginning with the week that contains `asOfDate`. */
export function horizon(asOfDate: string, n: number = HORIZON_WEEKS): string[] {
  const first = weekOf(asOfDate);
  return Array.from({ length: n }, (_, i) => addDays(first, 7 * i));
}

/** Last day covered by a horizon. */
export function horizonEnd(weeks: readonly string[]): string {
  const last = weeks[weeks.length - 1];
  if (!last) throw new Error("empty horizon");
  return weekEnd(last);
}

/** 'YYYY-MM' plus `months`. */
export function addMonths(period: string, months: number): string {
  if (!ISO_PERIOD.test(period)) throw new Error(`not a period: ${period}`);
  const [y, m] = period.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every period from `from` to `to`, both included. */
export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/** Day `dayOfMonth` of `period`, pulled back to the month's last day when the month is shorter (the 31st in June). */
export function dayInPeriod(period: string, dayOfMonth: number): string {
  const [y, m] = addMonths(period, 0).split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.max(dayOfMonth, 1), last)).padStart(2, "0")}`;
}
