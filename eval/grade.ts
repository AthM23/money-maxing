import type { Route } from "../src/contract/types.js";
import type { CaseRow } from "./cases.js";
import type { CaseOutcome } from "./sut.js";

export type GradeVerdict = "correct" | "incorrect" | "not_run";

export interface CaseGrade {
  case_id: string;
  expected_route: Route;
  actual_route: Route | "NOT_RUN";
  verdict: GradeVerdict;
  /** Its own axis, independent of verdict: a wrong or wrongly-keyed unattended post.
   *  A case can be "correct" (route matched, AUTO has no other obligation) and still be
   *  a false auto-post, when auto_posted_entry_matches_key is explicitly false. See below. */
  is_false_auto_post: boolean;
  reason?: string;
}

export interface GradeSummary {
  graded: CaseGrade[];
  /** INVARIANT rows: engineering properties, not routed cases. Reported, never scored here. */
  invariants: CaseRow[];
}

/** Partitions rows into invariants (reported separately) and routed cases, then grades the latter.
 *  A row with no recorded outcome is graded as NOT_RUN rather than omitted. */
export function gradeAll(rows: readonly CaseRow[], outcomes: ReadonlyMap<string, CaseOutcome>): GradeSummary {
  const invariants = rows.filter((row) => row.expected_route === "INVARIANT");
  const graded = rows
    .filter((row) => row.expected_route !== "INVARIANT")
    .map((row) => gradeCase(row, outcomes.get(row.id) ?? { case_id: row.id, route: "NOT_RUN" }));
  return { graded, invariants };
}

export function gradeCase(row: CaseRow, outcome: CaseOutcome): CaseGrade {
  if (row.expected_route === "INVARIANT") {
    throw new Error(`gradeCase: ${row.id} is an INVARIANT case, not a routed one — use gradeAll to partition first`);
  }
  const expectedRoute = row.expected_route;
  const isFalseAuto = isFalseAutoPost(expectedRoute, outcome);

  if (outcome.route === "NOT_RUN") {
    return {
      case_id: row.id,
      expected_route: expectedRoute,
      actual_route: outcome.route,
      verdict: "not_run",
      is_false_auto_post: isFalseAuto,
    };
  }

  const { ok, reason } = checkRouteAndObligation(expectedRoute, outcome);
  const verdict: GradeVerdict = ok ? "correct" : "incorrect";
  return {
    case_id: row.id,
    expected_route: expectedRoute,
    actual_route: outcome.route,
    verdict,
    is_false_auto_post: isFalseAuto,
    reason,
  };
}

/** The cardinal sin, scored on its own: actual AUTO where expected isn't, or a matching AUTO
 *  whose posted entry doesn't match the key. Absence of that key check is not a false post —
 *  only an explicit `false` is. */
export function isFalseAutoPost(expectedRoute: Route, outcome: CaseOutcome): boolean {
  if (outcome.route !== "AUTO") return false;
  if (expectedRoute !== "AUTO") return true;
  return outcome.auto_posted_entry_matches_key === false;
}

function checkRouteAndObligation(expectedRoute: Route, outcome: CaseOutcome): { ok: boolean; reason?: string } {
  if (outcome.route !== expectedRoute) {
    return { ok: false, reason: `expected ${expectedRoute}, got ${outcome.route}` };
  }
  return checkObligation(outcome);
}

/** correct = route matched AND the route's own obligation holds. AUTO and PROPOSE carry none. */
function checkObligation(outcome: CaseOutcome): { ok: boolean; reason?: string } {
  if (outcome.route === "BLOCK" && !outcome.block_rule) {
    return { ok: false, reason: "BLOCK requires a non-empty block_rule" };
  }
  if (outcome.route === "REFUSE" && (outcome.refuse_places_looked ?? []).length === 0) {
    return { ok: false, reason: "REFUSE requires a non-empty refuse_places_looked" };
  }
  if (outcome.route === "ESCALATE" && !outcome.escalate_unknown) {
    return { ok: false, reason: "ESCALATE requires a non-empty escalate_unknown" };
  }
  return { ok: true };
}
