import { CaseFile, type Route } from "../contract/types.js";
import type { AutonomySetting } from "../runtime/autonomy.js";
import type { Db } from "../runtime/db.js";
import { proposeEntry, type ProposeResult, type RuntimeDeps } from "../runtime/proposeEntry.js";
import { packFor } from "../packs/index.js";

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
  autonomy_level: AutonomySetting;
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
  const pack = packFor(c.function);
  if (!pack) {
    return { status: "needs_agent", results: [], routes: [], unexplained_cents: c.shortfall_cents, model_calls: 0, notes: [`no pack is built for function ${c.function}`] };
  }
  const plan = pack.planTier0(db, c, meta.as_of);
  const results: ProposeResult[] = [];
  for (const [i, proposal] of plan.proposals.entries()) {
    const r = proposeEntry(db, proposal,
      { actor: "router:tier0", mode: meta.mode, autonomy_level: meta.autonomy_level, tier: 0, as_of: meta.as_of, features: plan.features_by_index?.[i] ?? pack.features(c),
        replay_docs: c.docs_snapshot }, deps);
    results.push(r);
    if (r.status === "rejected" || r.status === "invalid" || r.status === "blocked") break;
    if (r.status === "pending_approval" && proposal.kind === "apply_payment") {
      // What follows was planned on the assumption that this cash lands (a parked fee or credit blocks nothing else). Until a person approves it, nothing is
      // adjusted on top of it; the case comes round again afterwards and is planned from the ledger as it then stands.
      return { status: "done", results, routes: routesOf(results), unexplained_cents: 0, model_calls: 0,
        notes: [...plan.notes, `${proposal.kind} is waiting for approval; the rest of the plan waits for it`] };
    }
  }
  const rejected = results.some((r) => r.status === "rejected" || r.status === "invalid");
  const routes = routesOf(results);
  const needsAgent = rejected || plan.unexplained_cents > 0;
  return { status: needsAgent ? "needs_agent" : "done", results, routes, unexplained_cents: plan.unexplained_cents, model_calls: 0, notes: plan.notes };
}

function routesOf(results: ProposeResult[]): Route[] {
  return results.flatMap((r) => ("route" in r ? [r.route] : r.status === "blocked" ? ["BLOCK" as const] : []));
}
