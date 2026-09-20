import type { AutonomyLevel } from "../contract/types.js";
import { earnedLevel } from "../runtime/autonomy.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { LIVE_POINT_PREFIX } from "./harvest.js";

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

/**
 * Two kinds of evidence, one row each. Replay of closed periods: did the agent's entry match what the humans had
 * booked. The live month: did a person approve or reject the entry the agent proposed. Replays of points cut from
 * the live month are left out, or the same case would count twice; entries that only carry out a person's own
 * answer (router:resume) are not the agent's proposal and are left out too.
 */
const EVIDENCE_SQL = `
  SELECT p.function AS function, d.kind AS kind,
         CASE WHEN r.agrees = 1 OR r.triage = 'human_inconsistent' THEN 1 ELSE 0 END AS agrees,
         CASE WHEN ${COVERED_SQL} THEN 1 ELSE 0 END AS covered
  FROM replay_result r JOIN decision_point p ON p.id = r.decision_point_id JOIN decision d ON d.id = r.decision_id
  WHERE substr(p.id, 1, ${LIVE_POINT_PREFIX.length}) != '${LIVE_POINT_PREFIX}'
  UNION ALL
  SELECT d.function, d.kind, CASE WHEN a.outcome = 'approved' THEN 1 ELSE 0 END, CASE WHEN ${COVERED_SQL} THEN 1 ELSE 0 END
  FROM approval a JOIN decision d ON d.id = a.decision_id
  WHERE a.approver_kind = 'human' AND d.mode = 'live' AND d.proposal_json IS NOT NULL AND d.actor != 'router:resume'`;

/**
 * Autonomy is earned per kind of entry the agent proposes, because that is what it would post on its own. The
 * measure is precision: of the times the agent proposed this kind, how often the humans had booked, or went on to
 * approve, the same. Auto takes 95% on at least five COVERED decisions (code, an approved policy or an active
 * fact); agreement reached by free inference never counts towards auto. Post-with-review takes 80% overall;
 * otherwise shadow. Human inconsistency is not held against the agent. Counts are stored, never just a percentage.
 */
export function rebuildLadder(db: Db, clock: Clock): LadderRow[] {
  const rows = db
    .prepare(
      `SELECT function, kind, COUNT(*) AS n, SUM(agrees) AS agree, SUM(covered) AS covered_n, SUM(covered * agrees) AS covered_agree
       FROM (${EVIDENCE_SQL}) GROUP BY function, kind ORDER BY function, kind`,
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
