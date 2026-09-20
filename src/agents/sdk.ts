import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InvestigationReport, InvestigationTask, Investigator, ToolCaller } from "./investigator.js";
import { ALL_TOOLS } from "./toolset.js";
import { FinishInput } from "./tools/write.js";

const SERVER = "footnote";
const DEBUG = process.env.FOOTNOTE_DEBUG_SDK === "1";

/** FOOTNOTE_DEBUG_SDK=1 prints which tools the model was given and what it said. Never prints credentials. */
function debugMessage(message: { type: string } & Record<string, unknown>): void {
  if (message.type === "system") process.stderr.write(`[sdk] init tools=${JSON.stringify(message.tools ?? [])} mcp=${JSON.stringify(message.mcp_servers ?? [])}\n`);
  else if (message.type === "assistant") process.stderr.write(`[sdk] assistant ${JSON.stringify((message.message as { content?: unknown })?.content ?? "").slice(0, 600)}\n`);
  else if (message.type === "result") process.stderr.write(`[sdk] result ${JSON.stringify({ subtype: message.subtype, turns: message.num_turns, cost: message.total_cost_usd })}\n`);
}

export interface ClaudeInvestigatorOptions {
  /** e.g. "claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5". */
  model: string;
  name: string;
  /** Hard dollar cap per decision. The run stops and the case goes up a tier or to a person. */
  max_budget_usd?: number;
  /** Hard wall-clock cap. A model call that hangs must not hold the whole worker: the case moves on. */
  max_seconds?: number;
}

const DEFAULT_MAX_SECONDS = 240;
/** How long a run that has been asked to stop is given to say what it used, before it is cut off. */
const GRACE_SECONDS = 8;

/**
 * The Claude Agent SDK as one Investigator. The model gets our tools and nothing else: no file, shell or web
 * tools, an empty working directory, and no user or project settings. Everything it does goes through `call`.
 */
export function claudeInvestigator(opts: ClaudeInvestigatorOptions): Investigator {
  return {
    name: opts.name,
    async investigate(task: InvestigationTask, call: ToolCaller): Promise<InvestigationReport> {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      let finished: InvestigationReport | null = null;
      const tools = ALL_TOOLS.map((spec) =>
        sdk.tool(spec.name, spec.description, spec.input.shape, async (args: Record<string, unknown>) => {
          const r = call(spec.name, args);
          if (spec.name === "finish" && r.ok) finished = toReport(r.output);
          return { content: [{ type: "text" as const, text: JSON.stringify(r.output) }], isError: !r.ok };
        }, { alwaysLoad: true }),
      );
      const abort = new AbortController();
      const stream = sdk.query({
        prompt: task.task_message,
        options: {
          model: opts.model,
          systemPrompt: task.system_prompt,
          tools: [],
          // Built-in tools are off, so there is no tool search to load deferred schemas: every tool is always loaded.
          mcpServers: { [SERVER]: sdk.createSdkMcpServer({ name: SERVER, version: "0.1.0", tools, alwaysLoad: true }) },
          allowedTools: ALL_TOOLS.map((t) => `mcp__${SERVER}__${t.name}`),
          settingSources: [],
          cwd: mkdtempSync(join(tmpdir(), "footnote-agent-")),
          maxTurns: task.max_turns,
          maxBudgetUsd: opts.max_budget_usd ?? 0.75,
          abortController: abort,
        },
      });
      const seconds = opts.max_seconds ?? DEFAULT_MAX_SECONDS;
      const usage = await usageWithin(stream as SdkStream, seconds, GRACE_SECONDS, () => abort.abort());
      if (usage.timed_out) {
        // The turns it took are known either way. The cost is known only if the run reported it while stopping; a
        // zero here means "not recorded", and the trace says so rather than showing $0.
        return { outcome: "budget_exhausted", summary: `no answer within ${seconds} seconds; the run was stopped`, places_looked: [], model_calls: usage.turns, cost_micros: Math.round(usage.cost * 1_000_000) };
      }
      if (usage.problem) return { outcome: "budget_exhausted", summary: usage.problem, places_looked: [], model_calls: 0, cost_micros: 0 };
      const base: InvestigationReport = finished ?? { outcome: "budget_exhausted", summary: "ended without calling finish", places_looked: [] };
      return { ...base, model_calls: usage.turns, cost_micros: Math.round(usage.cost * 1_000_000) };
    },
  };
}

export interface Usage { cost: number; turns: number; problem?: string }
export type SdkStream = AsyncIterable<{ type: string } & Record<string, unknown>> & { interrupt(): Promise<unknown> };

/**
 * Run the stream against the clock and come back with what it used either way. A run reports its cost only in its
 * last message, so cutting it off loses the bill: a four-minute turn was once recorded as 0 calls and $0. On the
 * clock the run is first asked to stop, which still produces that last message, and given a few seconds; only if it
 * says nothing is it cut off, and then the turns counted so far are kept and the cost stays unknown.
 */
export async function usageWithin(stream: SdkStream, seconds: number, graceSeconds: number, cutOff: () => void): Promise<Usage & { timed_out: boolean }> {
  const seen: Usage = { cost: 0, turns: 0 };
  const consuming = consume(stream, seen);
  const first = await withinSeconds(seconds, consuming, () => undefined);
  if (first !== "timed_out") return { ...first, timed_out: false };
  await stream.interrupt().catch(() => undefined);
  // A run that was asked to stop may end by throwing. What was counted before that still stands.
  const late = await withinSeconds(graceSeconds, consuming.catch((): Usage => ({ ...seen })), cutOff);
  return late === "timed_out" ? { ...seen, timed_out: true } : { ...late, timed_out: true };
}

async function consume(stream: SdkStream, usage: Usage = { cost: 0, turns: 0 }): Promise<Usage> {
  for await (const message of stream) {
    if (DEBUG) debugMessage(message);
    const given = Array.isArray(message.tools) ? message.tools.length : ALL_TOOLS.length;
    if (message.type === "system" && message.subtype === "init" && given < ALL_TOOLS.length) {
      // Without its tools the model writes tool calls as prose. Stop here and say so.
      await stream.interrupt().catch(() => undefined);
      return { ...usage, problem: `the agent was given ${given} of ${ALL_TOOLS.length} tools; a tool schema is being rejected` };
    }
    // Every assistant message is one model turn. Counting them as they arrive means a run that is cut off still
    // says how many it took; the final result message, when there is one, is authoritative for both figures.
    if (message.type === "assistant") usage.turns += 1;
    if (message.type !== "result") continue;
    usage.cost = typeof message.total_cost_usd === "number" ? message.total_cost_usd : usage.cost;
    usage.turns = typeof message.num_turns === "number" ? message.num_turns : usage.turns;
  }
  return usage;
}

/** Whichever comes first: the work, or the clock. On the clock, `onTimeout` stops the work and the caller moves on. */
export async function withinSeconds<T>(seconds: number, work: Promise<T>, onTimeout: () => void): Promise<T | "timed_out"> {
  let timer: NodeJS.Timeout | undefined;
  const clock = new Promise<"timed_out">((resolve) => { timer = setTimeout(() => resolve("timed_out"), seconds * 1000); });
  try {
    const first = await Promise.race([work, clock]);
    if (first === "timed_out") {
      onTimeout();
      // The abandoned stream may still reject once aborted; that is expected and already accounted for.
      work.catch(() => undefined);
    }
    return first;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toReport(output: unknown): InvestigationReport {
  const parsed = FinishInput.safeParse(output);
  if (!parsed.success) return { outcome: "budget_exhausted", summary: "finish output was malformed", places_looked: [] };
  return { outcome: parsed.data.outcome, summary: parsed.data.summary, places_looked: parsed.data.places_looked };
}

/** Tiers 1 to 3, cheapest first. Tier 0 is code and lives in src/router. */
export function defaultTiers(): Investigator[] {
  return [
    claudeInvestigator({ name: "haiku", model: "claude-haiku-4-5", max_budget_usd: 0.15, max_seconds: 150 }),
    claudeInvestigator({ name: "sonnet", model: "claude-sonnet-5", max_budget_usd: 0.6, max_seconds: 240 }),
    claudeInvestigator({ name: "opus", model: "claude-opus-5", max_budget_usd: 1.5, max_seconds: 300 }),
  ];
}
