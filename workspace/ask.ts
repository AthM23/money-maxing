import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Db } from "../src/runtime/db.js";
import { HttpError } from "./http.js";
import { TOOLS, toolByName, type BookTool, type ToolResult } from "./tools.js";

/**
 * "Ask the books", two ways. In code mode a question is matched to a tool by its words: free, instant, and enough for
 * the standing reports. In agent mode a Claude model reads the question, chooses tools, and writes two or three
 * sentences around what they returned. Either way every table on the page is a tool's result, computed by code from
 * the ledger: the model chooses and explains, it never produces a number of its own.
 */
export const ASK_MODELS = ["code", "claude-haiku-4-5", "claude-opus-5"] as const;
export type AskModel = (typeof ASK_MODELS)[number];

export interface AskAnswer {
  model: AskModel;
  text: string;
  /** Every tool that actually ran, in order, with how long it took and how many rows it returned: the page shows these as receipts. */
  used: { tool: string; title: string; input: unknown; result: ToolResult; ms: number; rows: number }[];
  usage: { input_tokens: number; output_tokens: number; turns: number } | null;
  elapsed_ms: number;
}

const SYSTEM = `You answer questions about one company's books for its CFO, inside a finance workspace.
Use the tools: they are read-only reports computed by code from the ledger. Every amount in a tool result is already written out in dollars: copy amounts exactly as given, and never convert, round, add up or restate a number in another form.
Say only what the tool results state. Do not guess at causes, motives or what might be going on.
The page shows each tool's table under your answer, so do not repeat tables: say what matters in two to four plain sentences, then stop. Plain text only: no markdown, no bullet points, no bold.
If the question asks you to change, approve or post anything, say that changes are made by a person under "Input needed", and offer the report that helps them decide.
If no tool covers the question, say which reports you can build. The company is fictional and the month is simulated.`;

const KEYWORDS: [RegExp, string][] = [
  [/why|short|explain|receipt|wire|invoice\s|inv-/, "explain_receipt"], [/ag(e)?ing|owe|outstanding|receivable|\bar\b/, "ar_ageing"], [/trial|\btb\b|ledger|balance sheet/, "trial_balance"],
  [/forecast|runway|next weeks?|13.week/, "cash_forecast"], [/close|lock|checklist|month.end/, "close_status"], [/revenue|schedule|contract|deferred/, "revenue_schedules"],
  [/agent|model|cost|spend|refus|trace/, "agent_activity"], [/rule|polic|memory|learn|fact/, "policies_and_memory"], [/wait|need|approv|question|stuck|open|settled/, "waiting_on_people"], [/cash|bank|came in|received/, "cash_received"],
];

export async function ask(db: Db, question: string, period: string, model: AskModel): Promise<AskAnswer> {
  const started = Date.now();
  const answer = model === "code" ? askInCode(db, question, period) : await askAgent(db, question, period, model);
  return { ...answer, elapsed_ms: Date.now() - started };
}

/** Run one tool by name, as a tile on the Ask page or an MCP client would. */
export function runTool(db: Db, name: string, input: unknown, period: string): ToolResult {
  const tool = toolByName(name);
  if (!tool) throw new HttpError(404, `no tool named ${name}`);
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return tool.run({ db, period }, parsed.data);
}

function askInCode(db: Db, question: string, period: string): Omit<AskAnswer, "elapsed_ms"> {
  const q = question.toLowerCase();
  const name = KEYWORDS.find(([pattern]) => pattern.test(q))?.[1];
  if (!name) return { model: "code", text: `I can build these from the books: ${TOOLS.map((t) => t.title.toLowerCase()).join(", ")}.`, used: [], usage: null };
  // The one tool that takes an argument gets the question's own words to search with.
  const input = name === "explain_receipt" ? { customer: subjectOf(question) } : {};
  const used = timed(name, toolByName(name)!.title, input, () => runTool(db, name, input, period));
  return { model: "code", text: used.result.summary, used: [used], usage: null };
}

function timed(tool: string, title: string, input: unknown, run: () => ToolResult): AskAnswer["used"][number] {
  const started = performance.now();
  const result = run();
  return { tool, title, input, result, ms: Math.round((performance.now() - started) * 10) / 10, rows: result.table?.rows.length ?? 0 };
}

function subjectOf(question: string): string {
  const invoice = /inv-\d+/i.exec(question)?.[0];
  if (invoice) return invoice;
  const word = question.replace(/[?.!,]/g, "").split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}/.test(w) && !/^(Why|What|How|Who|Show|Explain|Is|Are|The)$/.test(w))[0];
  return word ?? question.slice(0, 40);
}

/**
 * A tool's table as the model reads it: one object per row, money written out by code ("USD 105,800.00"). The model
 * is never handed cents to convert: on the first real run it turned 10,580,000 cents into "USD 10,580.00".
 */
export function forReading(result: ToolResult): Record<string, string | number | null>[] {
  const t = result.table;
  if (!t) return [];
  const money = (v: string | number | null): string | null => (typeof v === "number" ? `USD ${(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v);
  return t.rows.map((row) => Object.fromEntries(t.columns.map((c, i) => [c, t.money_columns.includes(i) ? money(row[i] ?? null) : row[i] ?? null])));
}

async function askAgent(db: Db, question: string, period: string, model: Exclude<AskModel, "code">): Promise<Omit<AskAnswer, "elapsed_ms">> {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "No ANTHROPIC_API_KEY is set, so the agent cannot run. Choose \"Code only\": it builds the same reports for free.");
  const used: AskAnswer["used"] = [];
  const tools = (TOOLS as readonly BookTool[]).map((t) => betaZodTool({
    name: t.name, description: t.description, inputSchema: t.input,
    run: (input) => {
      const call = timed(t.name, t.title, input, () => t.run({ db, period }, input));
      used.push(call);
      const result = call.result;
      return JSON.stringify({ title: result.title, summary: result.summary, rows: forReading(result), source_tables: result.source });
    },
  }));
  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({ model, max_tokens: 1500, max_iterations: 6, system: SYSTEM, tools, messages: [{ role: "user", content: `The month being closed is ${period}. ${question}` }] });
  const usage = { input_tokens: 0, output_tokens: 0, turns: 0 };
  let text = "";
  for await (const message of runner) {
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    usage.turns += 1;
    if (message.stop_reason === "refusal") throw new HttpError(422, "The model declined to answer that.");
    text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || text;
  }
  return { model, text: text || "The model returned no text; the tool results are below.", used, usage };
}
