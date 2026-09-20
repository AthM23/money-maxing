/**
 * Pure schedule arithmetic. No database, no clock, no floats on the money path: every amount is an integer number
 * of cents, and every split is done by cumulative floor differencing so the parts sum to the whole EXACTLY
 * (the last period takes the residual; nothing is lost to rounding and nothing is invented).
 */

export interface ScheduleLine {
  period: string; // 'YYYY-MM'
  amount_cents: number;
}

const BPS_DENOMINATOR = 10_000;

function assertCents(n: number, name: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative safe integer of cents, got ${n}`);
}

/** floor(a * b / d) on integers. `p - p % d` is exactly divisible, so the division never rounds. */
function mulDivFloor(a: number, b: number, d: number): number {
  const p = a * b;
  if (!Number.isSafeInteger(p)) throw new RangeError(`${a} x ${b} overflows a safe integer; split the amount before scheduling it`);
  return (p - (p % d)) / d;
}

interface Ymd { y: number; m: number; d: number }

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseDate(iso: string, name: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`${name} must be an ISO date YYYY-MM-DD, got ${iso}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new RangeError(`${name} is not a calendar date: ${iso}`);
  return { y, m, d };
}

const periodId = (y: number, m: number): string => `${y}-${String(m).padStart(2, "0")}`;

/**
 * The weight of each calendar month in the service term. A term of whole months weighs every month 1 (so February
 * earns the same as March, which is what "ratable monthly" means to a SaaS controller); a term with a partial first
 * or last month weighs each month by the days of service that fall in it.
 */
function monthWeights(start: Ymd, end: Ymd): { period: string; weight: number }[] {
  const whole = start.d === 1 && end.d === daysInMonth(end.y, end.m);
  const out: { period: string; weight: number }[] = [];
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    const first = y === start.y && m === start.m ? start.d : 1;
    const last = y === end.y && m === end.m ? end.d : daysInMonth(y, m);
    out.push({ period: periodId(y, m), weight: whole ? 1 : last - first + 1 });
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}

/**
 * Spread a contract's value over its service term, one line per calendar month:
 * line(n) = floor(total x cum(n) / W) - floor(total x cum(n-1) / W), where cum is months (whole-month term) or days
 * of service (partial first or last month) and W is the whole term. The sum of the lines is `totalCents` exactly.
 */
export function ratableMonthly(totalCents: number, startDate: string, endDate: string): ScheduleLine[] {
  assertCents(totalCents, "totalCents");
  const start = parseDate(startDate, "startDate");
  const end = parseDate(endDate, "endDate");
  if (endDate < startDate) throw new RangeError(`endDate ${endDate} is before startDate ${startDate}`);
  const weights = monthWeights(start, end);
  const whole = weights.reduce((n, w) => n + w.weight, 0);
  let cum = 0;
  let booked = 0;
  return weights.map((w) => {
    cum += w.weight;
    const through = mulDivFloor(totalCents, cum, whole);
    const amount = through - booked;
    booked = through;
    return { period: w.period, amount_cents: amount };
  });
}

/**
 * A percentage concession, applied prospectively: every period in [fromPeriod, untilPeriod] that has NOT been
 * recognised drops by floor(line x bps / 10000). Recognised periods are history and are never touched.
 */
export function revisePct(
  lines: readonly ScheduleLine[], fromPeriod: string, untilPeriod: string, bps: number, recognisedPeriods: ReadonlySet<string> | readonly string[],
): ScheduleLine[] {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) throw new RangeError(`bps must be an integer 0..10000, got ${bps}`);
  const recognised = recognisedPeriods instanceof Set ? recognisedPeriods : new Set(recognisedPeriods as readonly string[]);
  return lines.map((l) => {
    assertCents(l.amount_cents, `line ${l.period}`);
    const open = l.period >= fromPeriod && l.period <= untilPeriod && !recognised.has(l.period);
    return { period: l.period, amount_cents: open ? l.amount_cents - mulDivFloor(l.amount_cents, bps, BPS_DENOMINATOR) : l.amount_cents };
  });
}

/** Take a fixed amount off one period. Refuses a period the schedule does not have, and a line driven below zero. */
export function reduceOne(lines: readonly ScheduleLine[], period: string, cents: number): ScheduleLine[] {
  assertCents(cents, "cents");
  const target = lines.find((l) => l.period === period);
  if (!target) throw new RangeError(`schedule has no line for ${period}`);
  if (cents > target.amount_cents) throw new RangeError(`cannot take ${cents} off ${period}: the line is only ${target.amount_cents}`);
  return lines.map((l) => ({ period: l.period, amount_cents: l.period === period ? l.amount_cents - cents : l.amount_cents }));
}

export function sumLines(lines: readonly ScheduleLine[]): number {
  const total = lines.reduce((n, l) => n + l.amount_cents, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError("schedule total overflows a safe integer");
  return total;
}

/** Integer cents as "$12,345.67", by string arithmetic. For summaries only; never parsed back. */
export function usd(cents: number): string {
  const abs = Math.abs(cents);
  const whole = String((abs - (abs % 100)) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}$${whole}.${String(abs % 100).padStart(2, "0")}`;
}
