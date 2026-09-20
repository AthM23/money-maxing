import type { AutonomyLevel } from "../contract/types.js";
import type { Db } from "./db.js";

/** A fixed level, or "earned": whatever the ladder holds for the kind of entry actually being proposed. */
export type AutonomySetting = AutonomyLevel | "earned";

/** What the resolver needs to know about an entry. A Proposal fits. */
export interface AutonomySubject {
  function: string;
  kind: string;
  policy_refs: readonly string[];
  fact_refs: readonly string[];
}

/** The level a kind of entry has earned. A kind with no row has no track record, so it starts in shadow. */
export function earnedLevel(db: Db, fn: string, kind: string): AutonomyLevel {
  const row = db.prepare("SELECT level FROM autonomy WHERE function = ? AND kind = ?").get(fn, kind) as { level: AutonomyLevel } | undefined;
  return row?.level ?? "shadow";
}

/**
 * Autonomy belongs to the kind of entry, not to the case: one case can apply cash (routine) and then concede
 * revenue (judgment). So "earned" is resolved here, once the proposal is known. Even on a kind that has earned
 * auto, only compiled judgment posts alone: an entry reached by free inference (a model tier citing no approved
 * policy and no active fact) is held for review. The kernel separately checks that any cited policy or fact applies.
 */
export function resolveAutonomy(db: Db, setting: AutonomySetting, subject: AutonomySubject, tier: number | undefined): AutonomyLevel {
  if (setting !== "earned") return setting;
  const level = earnedLevel(db, subject.function, subject.kind);
  if (level !== "auto") return level;
  const compiled = tier === 0 || subject.policy_refs.length > 0 || subject.fact_refs.length > 0;
  return compiled ? "auto" : "review";
}
