import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arTaskMessage } from "./ar/prompt.js";
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
}

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
      const stream = sdk.query({
        prompt: arTaskMessage(task.case_file, task.notes),
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
        },
      });
      let cost = 0;
      let turns = 0;
      for await (const message of stream) {
        if (DEBUG) debugMessage(message);
        if (message.type === "system" && message.subtype === "init" && (message.tools ?? []).length < ALL_TOOLS.length) {
          // Without its tools the model writes tool calls as prose. Stop here and say so.
          await stream.interrupt().catch(() => undefined);
          return { outcome: "budget_exhausted", summary: `the agent was given ${(message.tools ?? []).length} of ${ALL_TOOLS.length} tools; a tool schema is being rejected`, places_looked: [], model_calls: 0, cost_micros: 0 };
        }
        if (message.type !== "result") continue;
        cost = message.total_cost_usd ?? 0;
        turns = message.num_turns ?? 0;
      }
      const base: InvestigationReport = finished ?? { outcome: "budget_exhausted", summary: "ended without calling finish", places_looked: [] };
      return { ...base, model_calls: turns, cost_micros: Math.round(cost * 1_000_000) };
    },
  };
}

function toReport(output: unknown): InvestigationReport {
  const parsed = FinishInput.safeParse(output);
  if (!parsed.success) return { outcome: "budget_exhausted", summary: "finish output was malformed", places_looked: [] };
  return { outcome: parsed.data.outcome, summary: parsed.data.summary, places_looked: parsed.data.places_looked };
}

/** Tiers 1 to 3, cheapest first. Tier 0 is code and lives in src/router. */
export function defaultTiers(): Investigator[] {
  return [
    claudeInvestigator({ name: "haiku", model: "claude-haiku-4-5", max_budget_usd: 0.15 }),
    claudeInvestigator({ name: "sonnet", model: "claude-sonnet-5", max_budget_usd: 0.6 }),
    claudeInvestigator({ name: "opus", model: "claude-opus-5", max_budget_usd: 1.5 }),
  ];
}
