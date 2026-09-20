import type { Clock } from "./config.js";
import type { Db } from "./db.js";

export type IntentStatus = "open" | "waiting_on_human" | "resolved";

/** The router's own record that nothing settled a case. Tier 0 means only code has tried so far. */
export const UNSETTLED_ACTOR = "router:unsettled";

/**
 * Where an intent stands, read from what actually happened to its decisions rather than from what any caller
 * believes. Resolved: the newest live decision took effect and nothing is parked or unanswered. Open: untouched, or
 * only the code tier has tried, so a pass with model tiers can still settle it. Anything else belongs to a person:
 * something is parked or asked, a tier refused or was blocked, or every model tier tried and none settled it.
 */
export function intentStanding(db: Db, intentId: string): IntentStatus {
  const waiting = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM decision d WHERE d.intent_id = ? AND d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')) AS parked,
         (SELECT COUNT(*) FROM escalation e JOIN decision d ON d.id = e.decision_id
            WHERE d.intent_id = ? AND e.answered_at IS NULL) AS asking`,
    )
    .get(intentId, intentId) as { parked: number; asking: number };
  if (waiting.parked > 0 || waiting.asking > 0) return "waiting_on_human";
  const newest = db
    .prepare("SELECT posted_at, actor, tier FROM decision WHERE intent_id = ? AND mode = 'live' ORDER BY rowid DESC LIMIT 1")
    .get(intentId) as { posted_at: string | null; actor: string; tier: number | null } | undefined;
  if (!newest) return "open";
  if (newest.posted_at) return "resolved";
  return newest.actor === UNSETTLED_ACTOR && (newest.tier ?? 0) === 0 ? "open" : "waiting_on_human";
}

/** Write the standing back to the intent. An abandoned intent stays abandoned. */
export function settleIntent(db: Db, clock: Clock, intentId: string): IntentStatus {
  const status = intentStanding(db, intentId);
  db.prepare(
    `UPDATE intent SET status = ?, closed_at = CASE WHEN ? = 'resolved' THEN COALESCE(closed_at, ?) ELSE NULL END
     WHERE id = ? AND status != 'abandoned'`,
  ).run(status, status, clock.now(), intentId);
  return status;
}
