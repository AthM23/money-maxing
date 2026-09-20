import type { AutonomyLevel } from "../contract/types.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";

export interface LadderRow {
  function: string;
  kind: string;
  agree: number;
  n: number;
  covered: boolean;
  level: AutonomyLevel;
}

const AUTO_RATE = 0.95;
const AUTO_MIN_N = 5;
const REVIEW_RATE = 0.8;

/**
 * Autonomy is earned per decision kind from replay: auto-post at 95% agreement with at least five cases AND an
 * approved policy or active fact covering the kind; post-with-review at 80%; otherwise shadow. Human inconsistency
 * is not counted against the agent. Counts are stored, never just a percentage.
 */
export function rebuildLadder(db: Db, clock: Clock): LadderRow[] {
  const rows = db
    .prepare(
      `SELECT p.function AS function, p.kind AS kind,
              SUM(CASE WHEN r.agrees = 1 OR r.triage = 'human_inconsistent' THEN 1 ELSE 0 END) AS agree, COUNT(*) AS n
       FROM replay_result r JOIN decision_point p ON p.id = r.decision_point_id GROUP BY p.function, p.kind`,
    )
    .all() as { function: string; kind: string; agree: number; n: number }[];
  const ladder = rows.map((r) => {
    const covered = isCovered(db, r.function, r.kind);
    return { ...r, covered, level: levelFor(r.agree, r.n, covered) };
  });
  const upsert = db.prepare(
    `INSERT INTO autonomy (function, kind, agree, n, covered, level, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(function, kind) DO UPDATE SET agree = excluded.agree, n = excluded.n, covered = excluded.covered,
       level = excluded.level, updated_at = excluded.updated_at`,
  );
  for (const r of ladder) upsert.run(r.function, r.kind, r.agree, r.n, r.covered ? 1 : 0, r.level, clock.now());
  return ladder;
}

export function levelFor(agree: number, n: number, covered: boolean): AutonomyLevel {
  if (n === 0) return "shadow";
  const rate = agree / n;
  if (rate >= AUTO_RATE && n >= AUTO_MIN_N && covered) return "auto";
  return rate >= REVIEW_RATE ? "review" : "shadow";
}

/** The level a live decision of this kind runs at. A kind never replayed starts in shadow. */
export function autonomyFor(db: Db, fn: string, kind: string): AutonomyLevel {
  const row = db.prepare("SELECT level FROM autonomy WHERE function = ? AND kind = ?").get(fn, kind) as { level: AutonomyLevel } | undefined;
  return row?.level ?? "shadow";
}

/** Covered means the agent reached its answers through an approved policy or an active fact, not free inference. */
function isCovered(db: Db, fn: string, kind: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM replay_result r
       JOIN decision_point p ON p.id = r.decision_point_id JOIN decision d ON d.id = r.decision_id
       WHERE p.function = ? AND p.kind = ? AND (r.agrees = 1 OR r.triage = 'human_inconsistent')
         AND (json_array_length(json_extract(d.proposal_json, '$.policy_refs')) > 0
           OR json_array_length(json_extract(d.proposal_json, '$.fact_refs')) > 0)`,
    )
    .get(fn, kind) as { n: number };
  return row.n > 0;
}
