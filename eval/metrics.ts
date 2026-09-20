import { ROUTES, type Route } from "../src/contract/types.js";
import type { CaseRow } from "./cases.js";
import { gradeAll, type CaseGrade } from "./grade.js";
import type { CaseOutcome } from "./sut.js";

export interface Ratio {
  k: number;
  n: number;
  /** null, never NaN, when n is 0 — there is nothing to divide. */
  value: number | null;
}

export function makeRatio(k: number, n: number): Ratio {
  return { k, n, value: n > 0 ? k / n : null };
}

export type ConfusionColumn = Route | "NOT_RUN";

export interface ConfusionMatrix {
  expectedRoutes: readonly Route[];
  actualColumns: readonly ConfusionColumn[];
  counts: Record<Route, Record<ConfusionColumn, number>>;
}

export interface OutOfScopeCase {
  case_id: string;
  expected_route: Route;
  actual_route: Route | "NOT_RUN";
  verdict: CaseGrade["verdict"];
}

export interface OutOfScopeReport {
  accuracy: Ratio;
  cases: OutOfScopeCase[];
}

export interface InvariantCase {
  case_id: string;
  title: string;
  qualifier?: string;
}

export interface Metrics {
  cases_total: number;
  cases_run: number;
  auto_clear_rate: Ratio;
  auto_clear_precision: Ratio;
  false_auto_posts: number;
  exception_recall: Ratio;
  cost_per_1000_usd: number | null;
  /** These three breakdowns span every graded (routed) case, NOT_RUN included — unlike the five
   *  headline numbers above, which are scoped to cases that ran. See computeMetrics. */
  accuracy_by_route: Record<string, Ratio>;
  accuracy_by_pack: Record<string, Ratio>;
  accuracy_by_tier: Record<string, Ratio>;
  confusion_matrix: ConfusionMatrix;
  out_of_scope: OutOfScopeReport;
  invariants: InvariantCase[];
}

export function computeMetrics(rows: readonly CaseRow[], outcomes: ReadonlyMap<string, CaseOutcome>): Metrics {
  const { graded, invariants } = gradeAll(rows, outcomes);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const ran = graded.filter((g) => g.actual_route !== "NOT_RUN");

  return {
    cases_total: graded.length,
    cases_run: ran.length,
    auto_clear_rate: computeAutoClearRate(ran),
    auto_clear_precision: computeAutoClearPrecision(ran),
    false_auto_posts: graded.filter((g) => g.is_false_auto_post).length,
    exception_recall: computeExceptionRecall(ran),
    cost_per_1000_usd: computeCostPer1000(outcomes, ran),
    accuracy_by_route: groupAccuracy(graded, (g) => g.expected_route),
    accuracy_by_pack: groupAccuracy(graded, (g) => getRow(rowsById, g.case_id).pack),
    accuracy_by_tier: groupAccuracy(graded, (g) => getRow(rowsById, g.case_id).tier),
    confusion_matrix: buildConfusionMatrix(graded),
    out_of_scope: computeOutOfScope(graded, rowsById),
    invariants: invariants.map(toInvariantCase),
  };
}

function getRow(rowsById: ReadonlyMap<string, CaseRow>, caseId: string): CaseRow {
  const row = rowsById.get(caseId);
  if (!row) {
    throw new Error(`metrics: no case row found for graded case ${caseId}`);
  }
  return row;
}

function toInvariantCase(row: CaseRow): InvariantCase {
  return { case_id: row.id, title: row.title, qualifier: row.route_qualifier };
}

/** share of ran cases actually cleared unattended. */
function computeAutoClearRate(ran: readonly CaseGrade[]): Ratio {
  const autoCount = ran.filter((g) => g.actual_route === "AUTO").length;
  return makeRatio(autoCount, ran.length);
}

/** share of ran AUTO outcomes that were correct. null, not 0, when nothing auto-cleared. */
function computeAutoClearPrecision(ran: readonly CaseGrade[]): Ratio {
  const autoOutcomes = ran.filter((g) => g.actual_route === "AUTO");
  const correctAuto = autoOutcomes.filter((g) => g.verdict === "correct").length;
  return makeRatio(correctAuto, autoOutcomes.length);
}

/** share of ran, genuinely-exceptional cases (expected != AUTO) that were kept out of AUTO. */
function computeExceptionRecall(ran: readonly CaseGrade[]): Ratio {
  const exceptions = ran.filter((g) => g.expected_route !== "AUTO");
  const recalled = exceptions.filter((g) => g.actual_route !== "AUTO").length;
  return makeRatio(recalled, exceptions.length);
}

/** mean cost_micros over ran cases that reported a cost, *1000, converted micros -> dollars,
 *  rounded to 2dp. null (never NaN) when no ran case reported a cost. */
function computeCostPer1000(outcomes: ReadonlyMap<string, CaseOutcome>, ran: readonly CaseGrade[]): number | null {
  const costs: number[] = [];
  for (const grade of ran) {
    const cost = outcomes.get(grade.case_id)?.cost_micros;
    if (typeof cost === "number") costs.push(cost);
  }
  if (costs.length === 0) return null;

  const meanMicros = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  const microsPer1000Txns = meanMicros * 1000;
  const dollarsPer1000Txns = microsPer1000Txns / 1_000_000;
  return Math.round(dollarsPer1000Txns * 100) / 100;
}

function groupAccuracy(graded: readonly CaseGrade[], keyOf: (g: CaseGrade) => string): Record<string, Ratio> {
  const groups = new Map<string, { k: number; n: number }>();
  for (const grade of graded) {
    const key = keyOf(grade);
    const group = groups.get(key) ?? { k: 0, n: 0 };
    group.n += 1;
    if (grade.verdict === "correct") group.k += 1;
    groups.set(key, group);
  }
  const result: Record<string, Ratio> = {};
  for (const [key, { k, n }] of groups) {
    result[key] = makeRatio(k, n);
  }
  return result;
}

function emptyCounts(actualColumns: readonly ConfusionColumn[]): Record<Route, Record<ConfusionColumn, number>> {
  const counts = {} as Record<Route, Record<ConfusionColumn, number>>;
  for (const expected of ROUTES) {
    const row = {} as Record<ConfusionColumn, number>;
    for (const actual of actualColumns) {
      row[actual] = 0;
    }
    counts[expected] = row;
  }
  return counts;
}

/** expected (5 routes) x actual (5 routes + NOT_RUN), over every graded case. */
function buildConfusionMatrix(graded: readonly CaseGrade[]): ConfusionMatrix {
  const actualColumns: readonly ConfusionColumn[] = [...ROUTES, "NOT_RUN"];
  const counts = emptyCounts(actualColumns);
  for (const grade of graded) {
    counts[grade.expected_route][grade.actual_route] += 1;
  }
  return { expectedRoutes: ROUTES, actualColumns, counts };
}

/** The rows the spec rules out (tax, FX, multi-entity, Stripe, voice) — kept visible, not mixed
 *  silently into the headline numbers. See tests/README.md's scope-gaps section. */
function computeOutOfScope(graded: readonly CaseGrade[], rowsById: ReadonlyMap<string, CaseRow>): OutOfScopeReport {
  const scoped = graded.filter((g) => !getRow(rowsById, g.case_id).in_spec_scope);
  const correct = scoped.filter((g) => g.verdict === "correct").length;
  return {
    accuracy: makeRatio(correct, scoped.length),
    cases: scoped.map(({ case_id, expected_route, actual_route, verdict }) => ({
      case_id,
      expected_route,
      actual_route,
      verdict,
    })),
  };
}
