import { CaseFile, type Route } from "../contract/types.js";
import type { AutonomySetting } from "../runtime/autonomy.js";
import { systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { settleIntent, UNSETTLED_ACTOR } from "../runtime/intentStatus.js";
import { safeJson } from "../runtime/lookups.js";
import { openDecision, setRoute } from "../runtime/persist.js";
import { APP_CONFIG, packFor, type Pack } from "../packs/index.js";
import { routeTier0 } from "../router/route.js";
import type { ToolEnv } from "./env.js";
import type { InvestigationReport, Investigator } from "./investigator.js";
import { recordStep } from "./steps.js";
import { callTool, type ToolCallResult } from "./toolset.js";

export interface RunCaseOptions {
  mode: "live" | "replay";
  /** A fixed level, or "earned" to run each proposed entry at the level its kind holds on the ladder. */
  autonomy_level: AutonomySetting;
  as_of?: string;
  /** Investigators by tier, cheapest first. Tier numbers start at 1; tier 0 is code. */
  investigators: Investigator[];
  max_turns?: number;
  /** Skip the cheaper tiers, e.g. when a reviewer sent the case back. 1-based; tier 0 (code) always runs first. */
  start_tier?: number;
  /** Extra context for the investigators, e.g. the reviewer's concerns. */
  extra_notes?: string[];
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
  const result = await runTiers(db, parsed.data, opts);
  if (opts.mode === "live") {
    const clock = opts.clock ?? systemClock;
    if (result.final_route === null) recordUnsettled(db, clock, parsed.data, result);
    settleIntent(db, clock, parsed.data.intent_id);
  }
  return result;
}

/**
 * Nothing settled the case. Say so on the record as its newest decision, so that it never reads as done just
 * because the cash application posted. The tier on the record is how far the attempt got: at tier 0 only code has
 * tried and the case stays open for a pass with model tiers; past that, the agents are out of ideas and it is a
 * person's. A function with no pack was never attempted at all, so it goes straight to a person.
 */
function recordUnsettled(db: Db, clock: Clock, c: CaseFile, result: CaseResult): void {
  const attempted = packFor(c.function) !== undefined;
  const id = openDecision(db, clock, {
    intent_id: c.intent_id, function: c.function, mode: "live", actor: attempted ? UNSETTLED_ACTOR : "router:no_pack",
    autonomy_level: "shadow", tier: result.tier_used,
  });
  db.prepare("INSERT INTO decision_step (decision_id, step_no, ts, kind, tier, output_json) VALUES (?, 1, ?, 'route', ?, ?)")
    .run(id, clock.now(), result.tier_used, JSON.stringify({ route: null, reason: "no tier reached a route", notes: result.notes }));
}

async function runTiers(db: Db, c: CaseFile, opts: RunCaseOptions): Promise<CaseResult> {
  const deps = { clock: opts.clock ?? systemClock, config: opts.config ?? APP_CONFIG };
  db.prepare("UPDATE intent SET case_json = COALESCE(case_json, ?) WHERE id = ?").run(JSON.stringify(c), c.intent_id);
  const t0 = routeTier0(db, c, { mode: opts.mode, autonomy_level: opts.autonomy_level, as_of: opts.as_of }, deps);
  if (t0.status === "done") {
    return { status: "done", routes: t0.routes, final_route: t0.routes.at(-1) ?? null, tier_used: 0, decision_id: null, report: null, notes: t0.notes };
  }
  let last: CaseResult | null = null;
  const notes = [...unexplainedNote(c, t0.unexplained_cents), ...t0.notes, ...priorReviewNotes(db, c.intent_id), ...(opts.extra_notes ?? [])];
  const pack = packFor(c.function);
  // No pack, no agent: a case is never worked on another function's instructions.
  const investigators = pack ? opts.investigators : [];
  for (const [i, investigator] of investigators.entries()) {
    if (!pack || i + 1 < (opts.start_tier ?? 1)) continue;
    last = await runTier(db, c, i + 1, investigator, notes, t0.routes, opts, { ...deps, pack });
    if (last.final_route !== null) return last;
    if (last.report) notes.push(`tier ${i + 1} (${investigator.name}) stopped: ${last.report.outcome}. ${last.report.summary}`);
  }
  return last ?? { status: "done", routes: t0.routes, final_route: null, tier_used: 0, decision_id: null, report: null, notes: t0.notes };
}

/** When code has already explained part of the difference, the judgment tier is told how much is actually left to explain. */
function unexplainedNote(c: CaseFile, unexplainedCents: number): string[] {
  if (unexplainedCents <= 0 || unexplainedCents === c.shortfall_cents) return [];
  return [`Only ${unexplainedCents} cents of the ${c.shortfall_cents} cent difference are unexplained; the rest is already booked or explained in the notes below. Resolve ${unexplainedCents} cents, no more.`];
}

/**
 * What an independent reviewer already said about an earlier draft on this case. Whoever prepares the next draft
 * starts from those concerns, whenever the case comes round, instead of repeating the draft that was declined.
 */
function priorReviewNotes(db: Db, intentId: string): string[] {
  const rows = db
    .prepare(
      `SELECT s.output_json FROM decision_step s JOIN decision d ON d.id = s.decision_id
       WHERE d.intent_id = ? AND d.mode = 'live' AND s.tool LIKE 'controller:%'
         AND EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.approver_kind = 'controller_agent' AND a.outcome = 'rejected')
       ORDER BY d.rowid, s.step_no`,
    )
    .all(intentId) as { output_json: string | null }[];
  return rows.flatMap((row) => {
    const verdict = row.output_json ? (safeJson(row.output_json) as { note?: string; concerns?: string[] } | null) : null;
    if (!verdict?.note) return [];
    return [`An independent controller declined an earlier draft: ${verdict.note}`, ...(verdict.concerns ?? []).map((c) => `Concern: ${c}`)];
  });
}

async function runTier(
  db: Db, c: CaseFile, tier: number, investigator: Investigator, notes: string[], priorRoutes: Route[],
  opts: RunCaseOptions, deps: { clock: Clock; config: RuntimeConfig; pack: Pack },
): Promise<CaseResult> {
  const decisionId = openDecision(db, deps.clock, {
    intent_id: c.intent_id, function: c.function, mode: opts.mode, actor: `agent:${c.function}:${investigator.name}`,
    autonomy_level: opts.autonomy_level, tier,
  });
  const env: ToolEnv = {
    db, clock: deps.clock, config: deps.config, mode: opts.mode, as_of: opts.as_of, actor: `agent:${c.function}:${investigator.name}`,
    tier, max_tier: opts.investigators.length, autonomy_level: opts.autonomy_level, intent_id: c.intent_id, decision_id: decisionId, features: deps.pack.features(c),
    replay_docs: c.docs_snapshot, entry_date: c.entry_date,
  };
  const seen: ToolCallResult[] = [];
  const call = (tool: string, toolInput: unknown): ToolCallResult => {
    const r = callTool(env, tool, toolInput);
    if (tool === "propose_entry" || tool === "escalate") seen.push(r);
    return r;
  };
  const report = await investigator.investigate(
    { case_file: c, tier, system_prompt: deps.pack.system_prompt, task_message: deps.pack.taskMessage(c, notes), notes, max_turns: opts.max_turns ?? 15 }, call);
  if (report.model_calls || report.cost_micros) {
    db.prepare("UPDATE decision SET model_calls = model_calls + ?, cost_micros = cost_micros + ? WHERE id = ?")
      .run(report.model_calls ?? 0, report.cost_micros ?? 0, decisionId);
  }
  const route = settleRoute(db, decisionId, report, seen);
  recordStep(env, { kind: "route", output: { route, outcome: report.outcome, places_looked: report.places_looked } });
  return { status: "done", routes: route ? [...priorRoutes, route] : priorRoutes, final_route: route, tier_used: tier, decision_id: decisionId, report, notes };
}

const SEVERITY: readonly Route[] = ["BLOCK", "ESCALATE", "REFUSE", "PROPOSE", "AUTO"];

/** The route comes from what actually happened at the write tools, never from what the agent says it did. */
function settleRoute(db: Db, decisionId: string, report: InvestigationReport, seen: ToolCallResult[]): Route | null {
  const actor = db.prepare("SELECT actor, intent_id FROM decision WHERE id = ?").get(decisionId) as { actor: string; intent_id: string };
  const routed = db.prepare("SELECT route FROM decision WHERE intent_id = ? AND actor = ? AND route IS NOT NULL AND rowid >= (SELECT rowid FROM decision WHERE id = ?)")
    .all(actor.intent_id, actor.actor, decisionId) as { route: Route }[];
  // An agent may propose more than one entry. The case is scored on the most restrictive thing that happened.
  const worst = SEVERITY.find((r) => routed.some((d) => d.route === r));
  if (worst) return worst;
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
