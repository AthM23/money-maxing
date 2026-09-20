import { z } from "zod";
import { emit, poll, type BusEvent } from "../../bus/bus.js";
import type { Db } from "../../ledger/db.js";
import { systemClock, type Clock } from "../../runtime/config.js";
import { worldToday } from "../asOf.js";
import { recordRipple } from "../ripple.js";
import { buildForecast } from "./build.js";
import { diffVersions, type ForecastDiff } from "./diff.js";
import { forecastLines, getForecast, latestAsOf, type ForecastSummary } from "./read.js";
import { horizon, horizonEnd } from "./weeks.js";

export const FORECAST_SUBSCRIBER = "forecast";

/** The part of `rev.schedule.revised` this engine reads (full payload: src/engines/README.md). */
const Revised = z.object({
  contract_id: z.string().min(1),
  party_id: z.string().min(1),
  to_version: z.number().int(),
  until: z.string().nullable().optional(),
  monthly_delta_cents: z.number().int().nullable().optional(),
  /** Only the periods that changed. Optional: without it the engine cannot rebuild the pre-revision side and diffs against whatever stands. */
  lines: z.array(z.object({ period: z.string().min(1), before_cents: z.number().int(), after_cents: z.number().int() })).optional(),
});
type Revised = z.infer<typeof Revised>;

/** Payload of `forecast.updated`, exactly as the README fixes it. */
export interface ForecastUpdatedPayload {
  as_of: string; as_of_date: string; version: number; prior_as_of: string; reason: string; cause_event_id: number;
  opening_cash_cents: number; inflow_cents: number; outflow_cents: number; delta_inflow_cents: number;
  delta_by_week: Array<{ week: string; before_cents: number; after_cents: number }>;
  beyond_horizon: { monthly_delta_cents: number; through: string } | null;
  min_cash_cents: number; min_cash_week: string;
}

export interface ForecastOnceOptions {
  /** Overrides the world's today (tests, and a database with no bank lines yet). */
  as_of_date?: string;
  /** Told about every event that produced no version: a re-delivery, or a payload this engine cannot read. */
  on_skip?: (event_id: number, reason: string) => void;
}

/** Integer cents as signed dollars, by string arithmetic (no float touches the amount). */
export function signedUsd(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = cents < 0 ? "−" : cents > 0 ? "+" : "";
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** Make sure a version exists for the date (default: the world's today), so the next revision has something to diff against. */
export function ensureBaseline(db: Db, asOfDate?: string, clock: Clock = systemClock): ForecastSummary {
  const date = asOfDate ?? worldToday(db);
  const existing = latestAsOf(db, date);
  if (existing) return getForecast(db, existing)!;
  return buildForecast(db, { as_of_date: date, reason: "baseline" }, clock);
}

/** True when a stored version already bills the contract at the revision's AFTER amounts, i.e. it was built after the schedule changed. */
function reflectsRevision(db: Db, asOf: string, p: Revised): boolean {
  const changed = new Map((p.lines ?? []).filter((l) => l.before_cents !== l.after_cents).map((l) => [`${p.contract_id}:${l.period}`, l.after_cents]));
  return forecastLines(db, asOf).some((l) => l.kind === "ar_scheduled_billing" && changed.get(l.source_ref) === l.amount_cents);
}

/**
 * The "before" side of a revision: this as-of date with the schedule as it stood before. By the time the event is
 * read the schedule has already changed, so a version built now would be "after" on both sides and the diff would say
 * "unchanged" (it did, whenever the world's today had moved since the last baseline). A version for this date that
 * predates the revision is the before side as it stands; otherwise one is built with the event's own `before_cents`.
 */
function priorVersion(db: Db, p: Revised, asOfDate: string, clock: Clock): ForecastSummary {
  const existing = latestAsOf(db, asOfDate);
  if (existing && !reflectsRevision(db, existing, p)) return getForecast(db, existing)!;
  const overrides = (p.lines ?? []).map((l) => ({ contract_id: p.contract_id, period: l.period, amount_cents: l.before_cents }));
  if (overrides.length === 0) return ensureBaseline(db, asOfDate, clock);
  return buildForecast(db, { as_of_date: asOfDate, reason: "baseline (pre-revision)", schedule_overrides: overrides }, clock);
}

/** The reduction carries on past week 13 when the concession outlives the horizon; the payload says so instead of hiding it. */
function beyondHorizon(p: Revised, asOfDate: string): ForecastUpdatedPayload["beyond_horizon"] {
  if (!p.until || !p.monthly_delta_cents) return null;
  return p.until > horizonEnd(horizon(asOfDate)) ? { monthly_delta_cents: p.monthly_delta_cents, through: p.until } : null;
}

const contractInflows = (db: Db, asOf: string, contractId: string): number =>
  forecastLines(db, asOf).filter((l) => l.kind === "ar_scheduled_billing" && l.source_ref.startsWith(`${contractId}:`)).reduce((n, l) => n + l.amount_cents, 0);

function rippleSummary(db: Db, p: Revised, version: number, diff: ForecastDiff, delta: number): string {
  const party = (db.prepare("SELECT name FROM party WHERE id = ?").get(p.party_id) as { name: string } | undefined)?.name ?? p.party_id;
  const changed = diff.by_source_ref.filter((c) => c.kind === "ar_scheduled_billing" && c.source_ref.startsWith(`${p.contract_id}:`));
  const uniform = changed.length > 0 && changed.every((c) => c.delta_cents === changed[0]!.delta_cents);
  const count = `${changed.length} invoice${changed.length === 1 ? "" : "s"}`;
  const head = changed.length === 0
    ? `13-week forecast v${version}: ${party} inflows unchanged in the horizon`
    : `13-week forecast v${version}: ${party} inflows ${signedUsd(delta)} in the horizon (${count}${uniform ? ` × ${signedUsd(changed[0]!.delta_cents)}` : ""})`;
  return p.until && p.monthly_delta_cents ? `${head}; ${signedUsd(p.monthly_delta_cents)} a month through ${p.until}` : head;
}

/**
 * One `rev.schedule.revised` event: a new version, its diff, the events and the ripple, in one transaction, so a
 * crash leaves either all of it or none and the re-delivered event starts clean. Returns null when already handled.
 */
function handleRevision(db: Db, e: BusEvent, p: Revised, asOfDate: string, clock: Clock): ForecastUpdatedPayload | null {
  return db.transaction((): ForecastUpdatedPayload | null => {
    if (db.prepare("SELECT 1 FROM forecast_version WHERE cause_event_id = ?").get(e.id)) return null;
    const prior = priorVersion(db, p, asOfDate, clock);
    const next = buildForecast(db, {
      as_of_date: asOfDate, reason: `rev.schedule.revised ${p.contract_id} v${p.to_version}`,
      cause_event_id: e.id, cause_intent_id: e.intent_id ?? undefined,
    }, clock);
    const diff = diffVersions(db, prior.as_of, next.as_of);
    const payload: ForecastUpdatedPayload = {
      as_of: next.as_of, as_of_date: asOfDate, version: next.version, prior_as_of: prior.as_of, reason: next.reason, cause_event_id: e.id,
      opening_cash_cents: next.opening_cash_cents, inflow_cents: next.inflow_cents, outflow_cents: next.outflow_cents,
      delta_inflow_cents: diff.delta_inflow_cents,
      delta_by_week: diff.changed_weeks.map((w) => ({ week: w.week, before_cents: w.before_cents, after_cents: w.after_cents })),
      beyond_horizon: beyondHorizon(p, asOfDate), min_cash_cents: next.min_cash_cents, min_cash_week: next.min_cash_week,
    };
    emit(db, { topic: "forecast.updated", from_function: "forecast", intent_id: e.intent_id, payload: { ...payload } }, clock);
    if (next.min_cash_cents < 0) {
      emit(db, {
        topic: "forecast.min_cash.breach", from_function: "forecast", intent_id: e.intent_id,
        payload: { as_of: next.as_of, as_of_date: asOfDate, version: next.version, week: next.min_cash_week, min_cash_cents: next.min_cash_cents, shortfall_cents: -next.min_cash_cents, cause_event_id: e.id },
      }, clock);
    }
    if (e.intent_id) {
      const [before, after] = [contractInflows(db, prior.as_of, p.contract_id), contractInflows(db, next.as_of, p.contract_id)];
      recordRipple(db, {
        intent_id: e.intent_id, function: "forecast", kind: "forecast_version", ref: next.as_of, event_id: e.id,
        before_cents: before, after_cents: after, delta_cents: after - before, summary: rippleSummary(db, p, next.version, diff, after - before),
      }, clock);
    }
    return payload;
  })();
}

/**
 * Poll the bus once as subscriber 'forecast'. Returns one `forecast.updated` payload per new version built, so an
 * empty array means the pass changed nothing (a re-delivered event builds nothing). A payload this engine cannot read
 * is skipped and reported through `on_skip`, never thrown: a throw would wedge the cursor on that event for good.
 */
export async function forecastOnce(db: Db, clock: Clock = systemClock, opts: ForecastOnceOptions = {}): Promise<ForecastUpdatedPayload[]> {
  const updates: ForecastUpdatedPayload[] = [];
  await poll(db, FORECAST_SUBSCRIBER, ["rev.schedule.revised"], (e) => {
    const parsed = Revised.safeParse(e.payload);
    if (!parsed.success) return opts.on_skip?.(e.id, `unreadable payload: ${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
    const update = handleRevision(db, e, parsed.data, opts.as_of_date ?? worldToday(db), clock);
    if (update) updates.push(update);
    else opts.on_skip?.(e.id, "already handled");
  });
  return updates;
}
