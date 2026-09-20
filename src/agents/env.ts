import type { AutonomyLevel } from "../contract/types.js";
import type { Clock, RuntimeConfig } from "../runtime/config.js";
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
  autonomy_level: AutonomyLevel;
  intent_id: string;
  /** The decision opened at intake. Steps are metered against it. */
  decision_id: string;
  features?: Record<string, string | number | boolean>;
}
