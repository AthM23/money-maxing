import type { AutonomySetting } from "../runtime/autonomy.js";
import type { Clock, RuntimeConfig } from "../runtime/config.js";
import type { DocLite } from "../kernel/types.js";
import type { Db } from "../runtime/db.js";

/** What every tool call can see. `as_of` is the replay guard: nothing recorded after it exists for the agent. */
export interface ToolEnv {
  db: Db;
  clock: Clock;
  config: RuntimeConfig;
  mode: "live" | "replay";
  as_of?: string;
  actor: string;
  tier: number;
  /** The highest model tier configured for this run. Only tier 2 and above may ask a person, when one exists. */
  max_tier?: number;
  autonomy_level: AutonomySetting;
  intent_id: string;
  /** Date of the case in hand. */
  entry_date?: string;
  /** The decision opened at intake. Steps are metered against it. */
  decision_id: string;
  features?: Record<string, string | number | boolean>;
  /** Replay only: document balances as they stood at the decision. */
  replay_docs?: DocLite[];
}
