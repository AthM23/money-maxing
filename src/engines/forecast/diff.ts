import type { Db } from "../../ledger/db.js";
import { forecastLines, type ForecastLine } from "./read.js";

export interface WeekInflowChange { week: string; before_cents: number; after_cents: number; delta_cents: number }

export interface SourceChange {
  kind: string;
  source_ref: string;
  /** Null when the line exists on one side only. */
  week_before: string | null;
  week_after: string | null;
  before_cents: number;
  after_cents: number;
  delta_cents: number;
}

export interface ForecastDiff {
  prior_as_of: string;
  new_as_of: string;
  opening_before_cents: number; opening_after_cents: number;
  inflow_before_cents: number; inflow_after_cents: number; delta_inflow_cents: number;
  /** Positive magnitudes, as in the summary. */
  outflow_before_cents: number; outflow_after_cents: number; delta_outflow_cents: number;
  /** Change in closing cash at the end of the horizon; equals the sum of `by_source_ref` deltas. */
  delta_closing_cents: number;
  /** Inflows per week, every week either version has. */
  inflow_by_week: WeekInflowChange[];
  /** The same, only the weeks that moved. */
  changed_weeks: WeekInflowChange[];
  /** Lines that were added, removed, repriced or moved to another week. */
  by_source_ref: SourceChange[];
}

const isInflow = (l: ForecastLine): boolean => l.kind !== "opening_cash" && l.amount_cents > 0;
const isOutflow = (l: ForecastLine): boolean => l.kind !== "opening_cash" && l.amount_cents < 0;
const sum = (lines: ForecastLine[]): number => lines.reduce((n, l) => n + l.amount_cents, 0);

function inflowByWeek(before: ForecastLine[], after: ForecastLine[]): WeekInflowChange[] {
  const weeks = [...new Set([...before, ...after].map((l) => l.week))].sort();
  return weeks.map((week) => {
    const b = sum(before.filter((l) => l.week === week && isInflow(l)));
    const a = sum(after.filter((l) => l.week === week && isInflow(l)));
    return { week, before_cents: b, after_cents: a, delta_cents: a - b };
  });
}

function bySourceRef(before: ForecastLine[], after: ForecastLine[]): SourceChange[] {
  const key = (l: ForecastLine): string => `${l.kind}|${l.source_ref}`;
  const index = (lines: ForecastLine[]): Map<string, ForecastLine[]> => {
    const m = new Map<string, ForecastLine[]>();
    for (const l of lines) m.set(key(l), [...(m.get(key(l)) ?? []), l]);
    return m;
  };
  const [b, a] = [index(before), index(after)];
  const out: SourceChange[] = [];
  for (const k of [...new Set([...b.keys(), ...a.keys()])].sort()) {
    const [bl, al] = [b.get(k) ?? [], a.get(k) ?? []];
    const sample = (al[0] ?? bl[0])!;
    const change: SourceChange = {
      kind: sample.kind, source_ref: sample.source_ref, week_before: bl[0]?.week ?? null, week_after: al[0]?.week ?? null,
      before_cents: sum(bl), after_cents: sum(al), delta_cents: sum(al) - sum(bl),
    };
    if (change.delta_cents !== 0 || change.week_before !== change.week_after) out.push(change);
  }
  return out;
}

/** What changed between two stored versions: per week, per source line, and in total. Reads only; both versions stay as built. */
export function diffVersions(db: Db, priorAsOf: string, newAsOf: string): ForecastDiff {
  for (const k of [priorAsOf, newAsOf]) {
    if (!db.prepare("SELECT 1 FROM forecast_version WHERE as_of = ?").get(k)) throw new Error(`diffVersions: no forecast version ${k}`);
  }
  const [before, after] = [forecastLines(db, priorAsOf), forecastLines(db, newAsOf)];
  const opening = (lines: ForecastLine[]): number => sum(lines.filter((l) => l.kind === "opening_cash"));
  const [inB, inA] = [sum(before.filter(isInflow)), sum(after.filter(isInflow))];
  const [outB, outA] = [-sum(before.filter(isOutflow)), -sum(after.filter(isOutflow))];
  const weeks = inflowByWeek(before, after);
  return {
    prior_as_of: priorAsOf, new_as_of: newAsOf,
    opening_before_cents: opening(before), opening_after_cents: opening(after),
    inflow_before_cents: inB, inflow_after_cents: inA, delta_inflow_cents: inA - inB,
    outflow_before_cents: outB, outflow_after_cents: outA, delta_outflow_cents: outA - outB,
    delta_closing_cents: sum(after) - sum(before),
    inflow_by_week: weeks, changed_weeks: weeks.filter((w) => w.delta_cents !== 0),
    by_source_ref: bySourceRef(before, after),
  };
}
