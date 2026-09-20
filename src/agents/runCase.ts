import { CaseFile, type AutonomyLevel, type Route } from "../contract/types.js";
import { DEFAULT_CONFIG, systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { openDecision, setRoute } from "../runtime/persist.js";
import { caseFeatures } from "../router/tier0.js";
import { routeTier0 } from "../router/route.js";
import { AR_SYSTEM_PROMPT } from "./ar/prompt.js";
import type { ToolEnv } from "./env.js";
import type { InvestigationReport, Investigator } from "./investigator.js";
import { recordStep } from "./steps.js";
import { callTool, type ToolCallResult } from "./toolset.js";

export interface RunCaseOptions {
  mode: "live" | "replay";
  autonomy_level: AutonomyLevel;
  as_of?: string;
  /** Investigators by tier, cheapest first. Tier numbers start at 1; tier 0 is code. */
  investigators: Investigator[];
  max_turns?: number;
  clock?: Clock;
  config?: RuntimeConfig;
}

export interface CaseResult {
  status: "done" | "invalid";
  routes: Route[];
  /** The route of the judgment part of the case: what the corpus scores. */
  final_route: Route | null;
  tier_used: number;
  decision_id: string | null;
  report: InvestigationReport | null;
  notes: string[];
}

/** One case, cheapest tier first. Code, then models in order; a kernel reject or an empty hand moves it up one tier. */
export async function runCase(db: Db, input: unknown, opts: RunCaseOptions): Promise<CaseResult> {
  const parsed = CaseFile.safeParse(input);
  if (!parsed.success) return { status: "invalid", routes: [], final_route: null, tier_used: 0, decision_id: null, report: null, notes: parsed.error.issues.map((i) => i.message) };
  const c = parsed.data;
  const deps = { clock: opts.clock ?? systemClock, config: opts.config ?? DEFAULT_CONFIG };
  const t0 = routeTier0(db, c, { mode: opts.mode, autonomy_level: opts.autonomy_level, as_of: opts.as_of }, deps);
  if (t0.status === "done") {
    return { status: "done", routes: t0.routes, final_route: t0.routes.at(-1) ?? null, tier_used: 0, decision_id: null, report: null, notes: t0.notes };
  }
  let last: CaseResult | null = null;
  for (const [i, investigator] of opts.investigators.entries()) {
    last = await runTier(db, c, i + 1, investigator, t0.notes, t0.routes, opts, deps);
    if (last.final_route !== null) return last;
  }
  return last ?? { status: "done", routes: t0.routes, final_route: null, tier_used: 0, decision_id: null, report: null, notes: t0.notes };
}

async function runTier(
  db: Db, c: CaseFile, tier: number, investigator: Investigator, notes: string[], priorRoutes: Route[],
  opts: RunCaseOptions, deps: { clock: Clock; config: RuntimeConfig },
): Promise<CaseResult> {
  const decisionId = openDecision(db, deps.clock, {
    intent_id: c.intent_id, function: c.function, mode: opts.mode, actor: `agent:${c.function}:${investigator.name}`,
    autonomy_level: opts.autonomy_level, tier,
  });
  const env: ToolEnv = {
    db, clock: deps.clock, config: deps.config, mode: opts.mode, as_of: opts.as_of, actor: `agent:${c.function}:${investigator.name}`,
    tier, autonomy_level: opts.autonomy_level, intent_id: c.intent_id, decision_id: decisionId, features: caseFeatures(c),
    replay_docs: c.docs_snapshot,
  };
  const seen: ToolCallResult[] = [];
  const call = (tool: string, toolInput: unknown): ToolCallResult => {
    const r = callTool(env, tool, toolInput);
    if (tool === "propose_entry" || tool === "escalate") seen.push(r);
    return r;
  };
  const report = await investigator.investigate(
    { case_file: c, tier, system_prompt: AR_SYSTEM_PROMPT, notes, max_turns: opts.max_turns ?? 15 }, call);
  if (report.model_calls || report.cost_micros) {
    db.prepare("UPDATE decision SET model_calls = model_calls + ?, cost_micros = cost_micros + ? WHERE id = ?")
      .run(report.model_calls ?? 0, report.cost_micros ?? 0, decisionId);
  }
  const route = settleRoute(db, decisionId, report, seen);
  recordStep(env, { kind: "route", output: { route, outcome: report.outcome, places_looked: report.places_looked } });
  return { status: "done", routes: route ? [...priorRoutes, route] : priorRoutes, final_route: route, tier_used: tier, decision_id: decisionId, report, notes };
}

/** The route comes from what actually happened at the write tools, never from what the agent says it did. */
function settleRoute(db: Db, decisionId: string, report: InvestigationReport, seen: ToolCallResult[]): Route | null {
  const stored = db.prepare("SELECT route FROM decision WHERE id = ?").get(decisionId) as { route: Route | null } | undefined;
  if (stored?.route) return stored.route;
  const outputs = seen.map((s) => s.output as { status?: string });
  if (outputs.some((o) => o.status === "opened" || o.status === "already_open")) {
    setRoute(db, decisionId, "ESCALATE");
    return "ESCALATE";
  }
  if (report.outcome === "refused" && report.places_looked.length > 0) {
    setRoute(db, decisionId, "REFUSE");
    return "REFUSE";
  }
  return null;
}
