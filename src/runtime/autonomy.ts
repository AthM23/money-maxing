import { ACCOUNTS } from "../contract/accounts.js";
import type { AutonomyLevel } from "../contract/types.js";
import type { Db } from "./db.js";

/** A fixed level, or "earned": whatever the ladder holds for the kind of entry actually being proposed. */
export type AutonomySetting = AutonomyLevel | "earned";

/** What the resolver needs to know about an entry. A Proposal fits. */
export interface AutonomySubject {
  function: string;
  kind: string;
  entries: ReadonlyArray<{ account: string }>;
  policy_refs: readonly string[];
  fact_refs: readonly string[];
}

const CONTROL_ACCOUNTS: ReadonlySet<string> = new Set([ACCOUNTS.cash, ACCOUNTS.ar, ACCOUNTS.ap]);

/** The level a kind of entry has earned. A kind with no row has no track record, so it starts in shadow. */
export function earnedLevel(db: Db, fn: string, kind: string): AutonomyLevel {
  const row = db.prepare("SELECT level FROM autonomy WHERE function = ? AND kind = ?").get(fn, kind) as { level: AutonomyLevel } | undefined;
  return row?.level ?? "shadow";
}

/**
 * Autonomy belongs to the kind of entry, not to the case: one case can apply cash (routine) and then concede
 * revenue (judgment). So "earned" is resolved here, once the proposal is known.
 *
 * Trust has to be earned only where there is judgment. A cash application planned by code that moves money between
 * control accounts and nothing else carries no judgment amount: the kernel re-performs all of it (the bank line, the
 * open balances, the party tie), so it may post on its own from the first day. The moment it touches any other
 * account (an overpayment held as a customer credit, say) it is judged like everything else.
 *
 * Even on a kind that has earned auto, only compiled judgment posts alone: an entry reached by free inference (a
 * model tier citing no approved policy and no active fact) is held for review. The kernel separately checks that
 * any cited policy or fact applies.
 */
export function resolveAutonomy(db: Db, setting: AutonomySetting, subject: AutonomySubject, tier: number | undefined): AutonomyLevel {
  if (setting !== "earned") return setting;
  if (tier === 0 && subject.kind === "apply_payment" && subject.entries.every((l) => CONTROL_ACCOUNTS.has(l.account))) return "auto";
  // Realized FX planned by code is the same kind of thing: arithmetic the kernel re-performs to the cent (F9) from
  // the two rates and the bank's own advice. There is no judgment in it to earn trust for.
  if (tier === 0 && subject.kind === "fx_realized") return "auto";
  const level = earnedLevel(db, subject.function, subject.kind);
  if (level !== "auto") return level;
  const compiled = tier === 0 || subject.policy_refs.length > 0 || subject.fact_refs.length > 0;
  return compiled ? "auto" : "review";
}
