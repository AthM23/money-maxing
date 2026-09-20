import type { Route } from "../contract/types.js";
import type { Investigator } from "../agents/investigator.js";
import { runCase } from "../agents/runCase.js";
import type { AutonomySetting } from "../runtime/autonomy.js";
import type { Clock, RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { intentStanding, type IntentStatus } from "../runtime/intentStatus.js";
import { pickOpenIntents, type PickedIntent, type SkippedIntent } from "./pickup.js";

/** After this many attempts with nothing to show, a case goes to a person instead of being retried. */
const MAX_ATTEMPTS = 3;

export interface WorkerOptions {
  /** Model tiers, cheapest first. Empty means code only: whatever tier 0 cannot settle goes to a person. */
  investigators: Investigator[];
  /** Defaults to "earned": each proposed entry runs at the level its kind holds on the ladder. */
  autonomy_level?: AutonomySetting;
  function?: string;
  limit?: number;
  max_turns?: number;
  clock?: Clock;
  config?: RuntimeConfig;
  onWorked?: (worked: WorkedIntent) => void;
}

export interface WorkedIntent {
  intent_id: string;
  function: string;
  routes: Route[];
  final_route: Route | null;
  tier_used: number;
  decision_id: string | null;
  status: IntentStatus;
  elapsed_ms: number;
  /** Set when the run threw. The case stays open for another pass until the attempts run out. */
  error?: string;
}

export interface WorkerReport {
  worked: WorkedIntent[];
  skipped: SkippedIntent[];
}

/**
 * One pass over the open intents. Each case goes through the router, cheapest tier first, at the autonomy its
 * kind of entry has earned. One failing case never stops the pass.
 */
export async function runOpenIntents(db: Db, opts: WorkerOptions): Promise<WorkerReport> {
  const { ready, skipped } = pickOpenIntents(db, { function: opts.function, limit: opts.limit });
  const worked: WorkedIntent[] = [];
  for (const intent of ready) {
    const result = await workOne(db, intent, opts);
    worked.push(result);
    opts.onWorked?.(result);
  }
  return { worked, skipped };
}

async function workOne(db: Db, intent: PickedIntent, opts: WorkerOptions): Promise<WorkedIntent> {
  const started = Date.now();
  const base = { intent_id: intent.intent_id, function: intent.function };
  try {
    const r = await runCase(db, intent.case_file, {
      mode: "live", autonomy_level: opts.autonomy_level ?? "earned", investigators: opts.investigators,
      max_turns: opts.max_turns, clock: opts.clock, config: opts.config,
    });
    return { ...base, routes: r.routes, final_route: r.final_route, tier_used: r.tier_used, decision_id: r.decision_id,
      status: intentStanding(db, intent.intent_id), elapsed_ms: Date.now() - started };
  } catch (err) {
    const status = giveUpIfExhausted(db, intent.intent_id);
    return { ...base, routes: [], final_route: null, tier_used: 0, decision_id: null, status, elapsed_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err) };
  }
}

/** A run that threw (a model outage, say) leaves the case open for the next pass, up to a limit. */
function giveUpIfExhausted(db: Db, intentId: string): IntentStatus {
  const attempts = db.prepare("SELECT COUNT(*) AS n FROM decision WHERE intent_id = ? AND mode = 'live' AND tier >= 1").get(intentId) as { n: number };
  const status: IntentStatus = attempts.n >= MAX_ATTEMPTS ? "waiting_on_human" : "open";
  db.prepare("UPDATE intent SET status = ?, closed_at = NULL WHERE id = ? AND status != 'abandoned'").run(status, intentId);
  return status;
}
