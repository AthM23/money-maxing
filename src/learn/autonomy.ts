import type { AutonomyLevel } from "../contract/types.js";
import { earnedLevel } from "../runtime/autonomy.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";

export interface LadderStats {
  agree: number;
  n: number;
  /** The same counts over covered decisions only: reached by code, an approved policy or an active fact. */
  covered_agree: number;
  covered_n: number;
}

export interface LadderRow extends LadderStats {
  function: string;
  kind: string;
  covered: boolean;
  level: AutonomyLevel;
}

const AUTO_RATE = 0.95;
const AUTO_MIN_N = 5;
const REVIEW_RATE = 0.8;

const COVERED_SQL = `(d.tier = 0 OR json_array_length(json_extract(d.proposal_json, '$.policy_refs')) > 0
  OR json_array_length(json_extract(d.proposal_json, '$.fact_refs')) > 0)`;
const AGREES_SQL = "(r.agrees = 1 OR r.triage = 'human_inconsistent')";

/**
 * Autonomy is earned per kind of entry the agent proposes, because that is what it would post on its own. The
 * measure is precision: of the times the agent proposed this kind, how often the humans had booked the same.
 * Auto takes 95% on at least five COVERED decisions (code, an approved policy or an active fact); agreement reached
 * by free inference never counts towards auto. Post-with-review takes 80% overall; otherwise shadow. Human
 * inconsistency is not held against the agent. Counts are stored, never just a percentage.
 */
export function rebuildLadder(db: Db, clock: Clock): LadderRow[] {
  const rows = db
    .prepare(
      `SELECT p.function AS function, d.kind AS kind, COUNT(*) AS n,
              SUM(CASE WHEN ${AGREES_SQL} THEN 1 ELSE 0 END) AS agree,
              SUM(CASE WHEN ${COVERED_SQL} THEN 1 ELSE 0 END) AS covered_n,
              SUM(CASE WHEN ${COVERED_SQL} AND ${AGREES_SQL} THEN 1 ELSE 0 END) AS covered_agree
       FROM replay_result r JOIN decision_point p ON p.id = r.decision_point_id JOIN decision d ON d.id = r.decision_id
       GROUP BY p.function, d.kind ORDER BY p.function, d.kind`,
    )
    .all() as Array<LadderStats & { function: string; kind: string }>;
  const ladder = rows.map((r) => ({ ...r, covered: meetsAutoBar(r), level: levelFor(r) }));
  const upsert = db.prepare(
    `INSERT INTO autonomy (function, kind, agree, n, covered, level, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(function, kind) DO UPDATE SET agree = excluded.agree, n = excluded.n, covered = excluded.covered,
       level = excluded.level, updated_at = excluded.updated_at`,
  );
  for (const r of ladder) upsert.run(r.function, r.kind, r.agree, r.n, r.covered ? 1 : 0, r.level, clock.now());
  return ladder;
}

function meetsAutoBar(s: LadderStats): boolean {
  return s.covered_n >= AUTO_MIN_N && s.covered_agree / s.covered_n >= AUTO_RATE;
}

export function levelFor(s: LadderStats): AutonomyLevel {
  if (s.n === 0) return "shadow";
  if (meetsAutoBar(s)) return "auto";
  return s.agree / s.n >= REVIEW_RATE ? "review" : "shadow";
}

/** The level a kind has earned. A kind never seen starts in shadow. */
export function autonomyFor(db: Db, fn: string, kind: string): AutonomyLevel {
  return earnedLevel(db, fn, kind);
}
