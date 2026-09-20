import { ROUTES, type Route } from "../contract/types.js";
import type { Db } from "../runtime/db.js";

export interface Scoreboard {
  intents: number;
  resolved: number;
  waiting_on_human: number;
  /** Live decisions that reached a route. */
  decisions: number;
  by_route: Record<Route, number>;
  /** Decisions reached by code (tier 0: an exact match, an active fact or an approved policy), with no model call. Reached, not posted: some of them park. */
  decided_by_code: number;
  decided_by_model: number;
  /** Took effect with no person involved. */
  auto_posted: number;
  /** Accepted by the kernel and waiting for a person or the controller. */
  parked: number;
  model_calls: number;
  cost_micros: number;
  questions: number;
  /** A question whose key had already been asked. A repeat question is a memory failure. */
  repeat_questions: number;
  human_approvals: number;
  controller_approvals: number;
  /** Independent reviews run, and what they cost in tokens. Not in cost_micros: the reviewer reports tokens, not dollars. */
  controller_reviews: number;
  controller_tokens: number;
  blocked: number;
  /** Documents a small model read, and how many of those readings code could verify and used. */
  documents_read: number;
  readings_used: number;
  /** Tick marks the kernel could re-perform in code, over all tick marks, on first proposal. */
  checkable_num: number;
  checkable_den: number;
}

const LIVE = "d.mode = 'live' AND d.actor != 'seed' AND (? IS NULL OR d.function = ?)";

/** Everything here is counted from the record. Nothing is estimated and nothing is self-reported by a model. */
export function scoreboard(db: Db, fn?: string): Scoreboard {
  const f = [fn ?? null, fn ?? null];
  const one = (sql: string, args: unknown[] = f): number => (db.prepare(sql).get(...args) as { n: number | null }).n ?? 0;
  const routes = db.prepare(`SELECT d.route AS route, COUNT(*) AS n FROM decision d WHERE ${LIVE} AND d.route IS NOT NULL GROUP BY d.route`)
    .all(...f) as { route: Route; n: number }[];
  const by_route = Object.fromEntries(ROUTES.map((r) => [r, routes.find((x) => x.route === r)?.n ?? 0])) as Record<Route, number>;
  const intent = "FROM intent WHERE owner NOT IN ('seed','replay') AND (? IS NULL OR function = ?)";
  return {
    intents: one(`SELECT COUNT(*) AS n ${intent}`),
    resolved: one(`SELECT COUNT(*) AS n ${intent} AND status = 'resolved'`),
    waiting_on_human: one(`SELECT COUNT(*) AS n ${intent} AND status = 'waiting_on_human'`),
    decisions: routes.reduce((n, r) => n + r.n, 0),
    by_route,
    decided_by_code: one(`SELECT COUNT(*) AS n FROM decision d WHERE ${LIVE} AND d.route IS NOT NULL AND d.tier = 0`),
    decided_by_model: one(`SELECT COUNT(*) AS n FROM decision d WHERE ${LIVE} AND d.route IS NOT NULL AND d.tier >= 1`),
    auto_posted: one(`SELECT COUNT(*) AS n FROM decision d WHERE ${LIVE} AND d.route = 'AUTO' AND d.posted_at IS NOT NULL`),
    parked: one(`SELECT COUNT(*) AS n FROM decision d WHERE ${LIVE} AND d.route = 'PROPOSE' AND d.posted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')`),
    model_calls: one(`SELECT SUM(d.model_calls) AS n FROM decision d WHERE ${LIVE}`),
    cost_micros: one(`SELECT SUM(d.cost_micros) AS n FROM decision d WHERE ${LIVE}`),
    questions: one(`SELECT COUNT(*) AS n FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE ${LIVE}`),
    repeat_questions: one(`SELECT COUNT(*) - COUNT(DISTINCT e.dedupe_key) AS n FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE ${LIVE}`),
    human_approvals: approvals(db, "human", f),
    controller_approvals: approvals(db, "controller_agent", f),
    controller_reviews: one(`SELECT COUNT(*) AS n FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE ${LIVE} AND s.tool LIKE 'controller:%'`),
    controller_tokens: one(`SELECT SUM(COALESCE(s.tokens_in, 0) + COALESCE(s.tokens_out, 0)) AS n FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE ${LIVE} AND s.tool LIKE 'controller:%'`),
    documents_read: one(`SELECT COUNT(*) AS n FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE ${LIVE} AND s.tool LIKE 'reader:%'`),
    readings_used: one(`SELECT COUNT(*) AS n FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE ${LIVE} AND s.tool LIKE 'reader:%' AND json_extract(s.output_json, '$.outcome') = 'applied'`),
    blocked: one(`SELECT COUNT(*) AS n FROM blocked_attempt b JOIN decision d ON d.id = b.decision_id WHERE ${LIVE}`),
    ...checkable(db, f),
  };
}

function approvals(db: Db, kind: "human" | "controller_agent", f: unknown[]): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM approval a JOIN decision d ON d.id = a.decision_id WHERE ${LIVE} AND a.approver_kind = ? AND a.outcome = 'approved'`)
    .get(...f, kind) as { n: number };
  return row.n;
}

function checkable(db: Db, f: unknown[]): Pick<Scoreboard, "checkable_num" | "checkable_den"> {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(w.checkable_num), 0) AS num, COALESCE(SUM(w.checkable_den), 0) AS den
       FROM workpaper w JOIN decision d ON d.id = w.decision_id
       WHERE ${LIVE} AND json_extract(w.marks_json, '$.stage') = 'proposal'`,
    )
    .get(...f) as { num: number; den: number };
  return { checkable_num: row.num, checkable_den: row.den };
}

export interface RunDelta {
  metric: string;
  run1: number;
  run2: number;
}

/** The same month twice. Only the numbers that memory can move are compared. */
export function compareRuns(run1: Scoreboard, run2: Scoreboard): RunDelta[] {
  const keys = ["decisions", "decided_by_code", "decided_by_model", "auto_posted", "parked", "model_calls", "cost_micros", "questions",
    "repeat_questions", "human_approvals", "controller_approvals", "resolved", "waiting_on_human", "blocked", "documents_read", "readings_used"] as const;
  return keys.map((k) => ({ metric: k, run1: run1[k], run2: run2[k] }));
}
