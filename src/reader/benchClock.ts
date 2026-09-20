import type { Clock } from "../runtime/config.js";

/** A fixed clock after every document's date, so a run is reproducible. */
export const fixedBenchClock: Clock = { now: () => "2026-08-01T12:00:00.000Z" };
