import type { CaseFile } from "../contract/types.js";
import { apExtraChecks, apFeatures, AP_SYSTEM_PROMPT, apTaskMessage, planApTier0 } from "../agents/ap/index.js";
import { AR_SYSTEM_PROMPT, arTaskMessage } from "../agents/ar/prompt.js";
import { planAccrualTier0 } from "../agents/close/accruals.js";
import { CLOSE_SYSTEM_PROMPT, closeTaskMessage } from "../agents/close/prompt.js";
import { caseFeatures, planTier0, type Tier0Plan } from "../router/tier0.js";
import { DEFAULT_CONFIG, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import type { CaseFeatures } from "../runtime/persist.js";

/** Everything that differs between finance functions. The router, the agents and the kernel gates are shared. */
export interface Pack {
  /** The code tier: what this function settles with no model call, and why not when it cannot. */
  planTier0(db: Db, c: CaseFile, asOf?: string): Tier0Plan;
  /** The flat facts of a case that a compiled policy's condition is tested against. */
  features(c: CaseFile): CaseFeatures;
  system_prompt: string;
  taskMessage(c: CaseFile, notes: string[]): string;
}

const PACKS: Partial<Record<CaseFile["function"], Pack>> = {
  ar: { planTier0, features: caseFeatures, system_prompt: AR_SYSTEM_PROMPT, taskMessage: arTaskMessage },
  ap: { planTier0: planApTier0, features: apFeatures, system_prompt: AP_SYSTEM_PROMPT, taskMessage: apTaskMessage },
  // Close: accruals for recurring expenses nobody has billed yet. Code estimates a steady one; a moving one is read, not averaged.
  close: { planTier0: planAccrualTier0, features: caseFeatures, system_prompt: CLOSE_SYSTEM_PROMPT, taskMessage: closeTaskMessage },
};

/** A function with no pack is never run on another function's prompt: the case goes to a person. */
export function packFor(fn: CaseFile["function"]): Pack | undefined {
  return PACKS[fn];
}

/** The configuration every entry point uses: the runtime defaults plus each pack's kernel checks. */
export const APP_CONFIG: RuntimeConfig = {
  ...DEFAULT_CONFIG,
  pack_checks: { ap: (db) => apExtraChecks(db) },
};
