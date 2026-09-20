import type { Db } from "../../ledger/db.js";
import { horizon } from "./weeks.js";

/** 'gl_cash_future': cash already booked in the GL for a date after the as-of date (a scheduled payment, a post-dated receipt). */
export type ForecastLineKind = "opening_cash" | "ar_open_invoice" | "ar_scheduled_billing" | "ap_open_bill" | "ap_recurring" | "gl_cash_future";

/** Cash the engine knows it does not see. Reported on every summary so nobody reads the outflows as complete. */
export const NOT_MODELLED = ["payroll"] as const;

/**
 * A version can leave out more than payroll (a contract billed annually, say). forecast_version has no column for
 * that, so each gap is stored with the version as a zero-amount marker row of this kind, its label in source_ref.
 * Markers are not cash: `forecastLines` never returns them, and they reach the reader through `not_modelled`.
 */
export const NOT_MODELLED_KIND = "not_modelled";

export interface ForecastLine {
  id: string;
  as_of: string;
  week: string;
  kind: ForecastLineKind;
  source_ref: string;
  /** Signed: inflows positive, outflows negative. */
  amount_cents: number;
  fact_id: string | null;
}

/** One weekly bucket. `outflow_cents` is a positive magnitude: closing = opening + inflow - outflow. */
export interface ForecastWeek {
  week: string;
  opening_cents: number;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  closing_cents: number;
}

export interface ForecastTotals {
  opening_cash_cents: number;
  /** Receipts in the horizon; the opening balance is not an inflow. */
  inflow_cents: number;
  /** Disbursements in the horizon, as a positive magnitude. */
  outflow_cents: number;
  closing_cash_cents: number;
  /** Lowest weekly closing balance, and the first week that reaches it. */
  min_cash_cents: number;
  min_cash_week: string;
  weeks: ForecastWeek[];
  by_kind: Record<string, number>;
}

export interface ForecastSummary extends ForecastTotals {
  as_of: string;
  as_of_date: string;
  version: number;
  built_at: string;
  reason: string;
  cause_event_id: number | null;
  cause_intent_id: string | null;
  line_count: number;
  not_modelled: readonly string[];
}

type Amount = Pick<ForecastLine, "week" | "kind" | "amount_cents">;

/**
 * Totals from the lines, and nothing else: the stored version row, the returned summary and the tool answer all come
 * through here, so "lines sum to bucket totals" and "weeks chain" hold by construction (closing(n) = opening(n+1)).
 */
export function summarise(lines: readonly Amount[], weeks: readonly string[]): ForecastTotals {
  const first = weeks[0];
  if (!first) throw new Error("summarise: empty horizon");
  const opening = lines.filter((l) => l.kind === "opening_cash").reduce((n, l) => n + l.amount_cents, 0);
  const byKind: Record<string, number> = {};
  for (const l of lines) byKind[l.kind] = (byKind[l.kind] ?? 0) + l.amount_cents;

  let running = opening;
  let min = { cents: Number.MAX_SAFE_INTEGER, week: first };
  const out: ForecastWeek[] = [];
  for (const week of weeks) {
    const flows = lines.filter((l) => l.week === week && l.kind !== "opening_cash");
    const inflow = flows.filter((l) => l.amount_cents > 0).reduce((n, l) => n + l.amount_cents, 0);
    const outflow = flows.filter((l) => l.amount_cents < 0).reduce((n, l) => n - l.amount_cents, 0);
    const bucket: ForecastWeek = { week, opening_cents: running, inflow_cents: inflow, outflow_cents: outflow, net_cents: inflow - outflow, closing_cents: running + inflow - outflow };
    running = bucket.closing_cents;
    if (running < min.cents) min = { cents: running, week };
    out.push(bucket);
  }
  return {
    opening_cash_cents: opening,
    inflow_cents: out.reduce((n, w) => n + w.inflow_cents, 0),
    outflow_cents: out.reduce((n, w) => n + w.outflow_cents, 0),
    closing_cash_cents: running, min_cash_cents: min.cents, min_cash_week: min.week, weeks: out, by_kind: byKind,
  };
}

interface VersionRow {
  as_of: string; as_of_date: string; version: number; built_at: string; reason: string;
  cause_event_id: number | null; cause_intent_id: string | null;
}

/** Newest version key: for one business date, or (no date) the newest version of the newest date. */
export function latestAsOf(db: Db, asOfDate?: string): string | undefined {
  const row = asOfDate
    ? db.prepare("SELECT as_of FROM forecast_version WHERE as_of_date = ? ORDER BY version DESC LIMIT 1").get(asOfDate)
    : db.prepare("SELECT as_of FROM forecast_version ORDER BY as_of_date DESC, version DESC LIMIT 1").get();
  return (row as { as_of: string } | undefined)?.as_of;
}

export function forecastLines(db: Db, asOf: string): ForecastLine[] {
  return db
    .prepare("SELECT id, as_of, week, kind, source_ref, amount_cents, fact_id FROM forecast_line WHERE as_of = ? AND kind <> ? ORDER BY week, kind, source_ref, id")
    .all(asOf, NOT_MODELLED_KIND) as ForecastLine[];
}

/** What this version says it does not see: payroll always, then the version's own markers. */
export function notModelled(db: Db, asOf: string): string[] {
  const rows = db.prepare("SELECT source_ref FROM forecast_line WHERE as_of = ? AND kind = ? ORDER BY source_ref").all(asOf, NOT_MODELLED_KIND) as Array<{ source_ref: string }>;
  return [...NOT_MODELLED, ...rows.map((r) => r.source_ref)];
}

/** One stored version (default: the latest), re-summed from its lines. Undefined when there is no such version. */
export function getForecast(db: Db, asOf?: string): ForecastSummary | undefined {
  const key = asOf ?? latestAsOf(db);
  if (!key) return undefined;
  const v = db
    .prepare("SELECT as_of, as_of_date, version, built_at, reason, cause_event_id, cause_intent_id FROM forecast_version WHERE as_of = ?")
    .get(key) as VersionRow | undefined;
  if (!v) return undefined;
  const lines = forecastLines(db, key);
  return { ...v, ...summarise(lines, horizon(v.as_of_date)), line_count: lines.length, not_modelled: notModelled(db, key) };
}
