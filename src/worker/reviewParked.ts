import type { Controller } from "../agents/controller.js";
import type { Investigator } from "../agents/investigator.js";
import { reviewAndRevise, type ReviewLoopResult } from "../agents/review.js";
import type { AutonomySetting } from "../runtime/autonomy.js";
import type { Clock, RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";

export interface ParkedReview {
  decision_id: string;
  loop: ReviewLoopResult;
}

export interface ReviewOptions {
  autonomy_level?: AutonomySetting;
  /** A ceiling on reviewer calls in one pass. Each one is a call to the strongest model. */
  max_reviews?: number;
  clock?: Clock;
  config?: RuntimeConfig;
}

/**
 * Every parked entry gets one independent review before a person sees it. Reviewed once: an entry that already
 * carries a controller note or any approval is left for the person it is waiting on.
 */
export async function reviewParked(db: Db, controller: Controller, investigators: Investigator[], opts: ReviewOptions = {}): Promise<ParkedReview[]> {
  const parked = db
    .prepare(
      `SELECT d.id FROM decision d
       WHERE d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)
         AND NOT EXISTS (SELECT 1 FROM decision_step s WHERE s.decision_id = d.id AND s.tool LIKE 'controller:%')
       ORDER BY d.rowid LIMIT ?`,
    )
    .all(opts.max_reviews ?? -1) as { id: string }[];
  const reviews: ParkedReview[] = [];
  for (const p of parked) {
    const loop = await reviewAndRevise(db, controller, p.id, investigators,
      { clock: opts.clock, config: opts.config, autonomy_level: opts.autonomy_level ?? "earned" });
    reviews.push({ decision_id: p.id, loop });
  }
  return reviews;
}
