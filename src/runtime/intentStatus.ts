import type { Clock } from "./config.js";
import type { Db } from "./db.js";
import { bankTxnAppliedCents } from "./kernelContext.js";
import { getBankTxn, getDoc, safeJson } from "./lookups.js";

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
    .prepare("SELECT posted_at, actor, tier, kind FROM decision WHERE intent_id = ? AND mode = 'live' ORDER BY rowid DESC LIMIT 1")
    .get(intentId) as { posted_at: string | null; actor: string; tier: number | null; kind: string } | undefined;
  if (!newest) return "open";
  if (newest.posted_at) return afterPosting(db, intentId, newest.kind);
  return newest.actor === UNSETTLED_ACTOR && (newest.tier ?? 0) === 0 ? "open" : "waiting_on_human";
}

/**
 * An intent closes when its end condition holds in the ledger, not when an entry posts (the drift monitor writes
 * the condition: the bank line fully applied, the documents settled). Cash applied with money still owed leaves
 * the case open, to be planned again from the ledger as it now stands. A dispute hold settles nothing by design:
 * that case is with people. An intent that carries no end condition closes when its newest entry takes effect.
 */
function afterPosting(db: Db, intentId: string, newestKind: string): IntentStatus {
  const row = db.prepare("SELECT end_condition_json FROM intent WHERE id = ?").get(intentId) as { end_condition_json: string | null } | undefined;
  const end = row?.end_condition_json ? (safeJson(row.end_condition_json) as { bank_txn_applied?: string; docs_settled?: string[] } | null) : null;
  if (!end || endConditionHolds(db, end)) return "resolved";
  return newestKind === "dispute_hold" ? "waiting_on_human" : "open";
}

function endConditionHolds(db: Db, end: { bank_txn_applied?: string; docs_settled?: string[] }): boolean {
  if (end.bank_txn_applied) {
    const txn = getBankTxn(db, end.bank_txn_applied);
    if (txn && bankTxnAppliedCents(db, txn.id) < Math.abs(txn.amount_cents)) return false;
  }
  return (end.docs_settled ?? []).every((id) => (getDoc(db, id)?.open_cents ?? 0) === 0);
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
