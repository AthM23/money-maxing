import { CaseFile, type AutonomyLevel, type Route } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { proposeEntry, type ProposeResult, type RuntimeDeps } from "../runtime/proposeEntry.js";
import { caseFeatures, planTier0 } from "./tier0.js";

export interface RouteOutcome {
  /** What tier 0 managed on its own. `needs_agent` means a model tier has to investigate the remainder. */
  status: "done" | "needs_agent" | "invalid";
  results: ProposeResult[];
  routes: Route[];
  unexplained_cents: number;
  model_calls: 0;
  notes: string[];
}

export interface RouteMeta {
  mode: "live" | "replay";
  autonomy_level: AutonomyLevel;
  as_of?: string;
}

/**
 * Cheapest tier first. Tier 0 is code: an exact match, an active fact or an approved policy. Whatever it cannot
 * explain is handed up with the notes on why each fact or policy was not used.
 */
export function routeTier0(db: Db, input: unknown, meta: RouteMeta, deps: RuntimeDeps = {}): RouteOutcome {
  const parsed = CaseFile.safeParse(input);
  if (!parsed.success) {
    const notes = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return { status: "invalid", results: [], routes: [], unexplained_cents: 0, model_calls: 0, notes };
  }
  const c = parsed.data;
  const plan = planTier0(db, c, meta.as_of);
  const results: ProposeResult[] = [];
  for (const proposal of plan.proposals) {
    const r = proposeEntry(db, proposal,
      { actor: "router:tier0", mode: meta.mode, autonomy_level: meta.autonomy_level, tier: 0, as_of: meta.as_of, features: caseFeatures(c) }, deps);
    results.push(r);
    if (r.status === "rejected" || r.status === "invalid" || r.status === "blocked") break;
  }
  const rejected = results.some((r) => r.status === "rejected" || r.status === "invalid");
  const routes = results.flatMap((r) => ("route" in r ? [r.route] : r.status === "blocked" ? ["BLOCK" as const] : []));
  const needsAgent = rejected || plan.unexplained_cents > 0;
  return { status: needsAgent ? "needs_agent" : "done", results, routes, unexplained_cents: plan.unexplained_cents, model_calls: 0, notes: plan.notes };
}
