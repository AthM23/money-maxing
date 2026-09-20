import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { summariseInput, summariseOutput } from "./traceText.js";

/**
 * The trace of one case, for a person who wants to see what the agents actually did: every turn anyone took on it
 * (code, a document reader, a model tier, the controller agent, a person), in order, with what was looked at, what the
 * kernel refused, what was asked, who answered, and what each turn cost in time and money. Read from the rows the
 * runtime already writes (`decision`, `decision_step`, `escalation`, `approval`); nothing here writes.
 */
export type Lane = "code" | "reader" | "model" | "controller" | "person";
export type StepStatus = "ok" | "refused" | "waiting" | "info";

export interface TraceMark { check: string; detail: string }

export interface TraceStep {
  at: string;
  kind: "tool" | "proposal" | "question" | "answer" | "approval" | "posted" | "reading" | "outcome";
  title: string;
  detail: string | null;
  status: StepStatus;
  latency_ms: number | null;
  /** The kernel's failed checks, when this step is a draft it refused. */
  refused_on: TraceMark[];
  /** What the tool was given and what it gave back, as stored, for the detail panel. Null for steps that are not tool calls. */
  input: string | null;
  output: string | null;
}

export interface TraceSpan {
  decision_id: string | null;
  lane: Lane;
  actor: string;
  label: string;
  /** The model this turn ran on ("claude-haiku-4-5"), or how else it was decided: "code", "a person", a scripted stand-in's name. */
  model: string;
  kind: string | null;
  route: string | null;
  outcome: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  model_calls: number;
  cost_micros: number;
  steps: TraceStep[];
}

export interface CaseTrace {
  intent_id: string;
  started_at: string | null;
  ended_at: string | null;
  spans: TraceSpan[];
  totals: { turns: number; tool_calls: number; model_calls: number; cost_micros: number; kernel_refusals: number; questions: number; approvals: number; posted: number };
}

interface DecisionRow {
  id: string; actor: string; tier: number | null; kind: string | null; route: string | null; model_calls: number | null;
  cost_micros: number | null; latency_ms: number | null; posted_at: string | null; created_at: string;
}
interface StepRow { step_no: number; ts: string; kind: string; tool: string | null; input_json: string | null; output_json: string | null; latency_ms: number | null }

const MODEL_NAMES: Record<number, string> = { 1: "Haiku", 2: "Sonnet", 3: "Opus" };
/** The tiers as `src/agents/sdk.ts` configures them. An actor that names none of them was not one of these models. */
const MODEL_IDS: Record<string, string> = { haiku: "claude-haiku-4-5", sonnet: "claude-sonnet-5", opus: "claude-opus-5" };
const DETAIL_MAX = 6000;

export function buildCaseTrace(db: Db, intentId: string): CaseTrace {
  const decisions = db
    .prepare(
      `SELECT id, actor, tier, kind, route, model_calls, cost_micros, latency_ms, posted_at, created_at
       FROM decision WHERE intent_id = ? AND mode = 'live' ORDER BY rowid`,
    )
    .all(intentId) as DecisionRow[];
  const spans = [...decisions.map((d) => decisionSpan(db, d)), ...answerSpans(db, intentId)]
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  return { intent_id: intentId, started_at: spans[0]?.started_at ?? null, ended_at: latest(spans), spans, totals: totalsOf(spans) };
}

function decisionSpan(db: Db, d: DecisionRow): TraceSpan {
  const rows = db.prepare("SELECT step_no, ts, kind, tool, input_json, output_json, latency_ms FROM decision_step WHERE decision_id = ? ORDER BY step_no").all(d.id) as StepRow[];
  const steps = [...rows.flatMap((r) => stepOf(r)), ...approvalSteps(db, d.id)];
  if (d.posted_at) steps.push({ at: d.posted_at, kind: "posted", title: "Posted to the ledger", detail: d.kind, status: "ok", latency_ms: null, refused_on: [], input: null, output: null });
  steps.sort((a, b) => a.at.localeCompare(b.at));
  const lane = laneOf(d.actor, d.tier);
  const end = [d.created_at, ...steps.map((s) => s.at)].sort().at(-1) ?? d.created_at;
  const ranFor = Math.max(d.latency_ms ?? 0, Date.parse(lastWorkAt(rows, d.created_at)) - Date.parse(d.created_at));
  return {
    decision_id: d.id, lane, actor: d.actor, label: labelOf(lane, d), model: modelOf(lane, d.actor), kind: d.kind, route: d.route, outcome: outcomeOf(d, rows, steps),
    started_at: d.created_at, ended_at: end, duration_ms: ranFor, model_calls: d.model_calls ?? 0, cost_micros: d.cost_micros ?? 0, steps,
  };
}

/** How long the turn itself ran: up to its last tool call or route, not up to a person's approval hours later. */
function lastWorkAt(rows: StepRow[], fallback: string): string {
  return rows.map((r) => r.ts).sort().at(-1) ?? fallback;
}

function stepOf(r: StepRow): TraceStep[] {
  const input = safeJson(r.input_json ?? "null");
  const output = safeJson(r.output_json ?? "null") as Record<string, unknown> | unknown[] | null;
  const io = { input: pretty(r.input_json), output: pretty(r.output_json) };
  if (r.kind === "route") return [{ at: r.ts, kind: "outcome", title: "Turn ended", detail: summariseOutput(output), status: "info", latency_ms: null, refused_on: [], ...io }];
  if (r.kind === "model_turn") return [{ at: r.ts, kind: "reading", title: r.tool ?? "model turn", detail: summariseOutput(output), status: readingStatus(output), latency_ms: r.latency_ms, refused_on: [], ...io }];
  if (r.kind !== "tool_call" || !r.tool) return [];
  const status = (output && !Array.isArray(output) ? String(output.status ?? "") : "");
  if (r.tool === "propose_entry") return [{ ...proposalStep(r, status, output), ...io }];
  if (r.tool === "escalate") return [{ at: r.ts, kind: "question", title: status === "handed_up" ? "Wanted to ask a person" : "Asked a person", detail: summariseOutput(output), status: status === "opened" ? "waiting" : "info", latency_ms: r.latency_ms, refused_on: [], ...io }];
  return [{ at: r.ts, kind: "tool", title: r.tool, detail: `${summariseInput(input)} → ${summariseOutput(output)}`, status: "ok", latency_ms: r.latency_ms, refused_on: [], ...io }];
}

function proposalStep(r: StepRow, status: string, output: unknown): Omit<TraceStep, "input" | "output"> {
  const failed = ((output as { failed?: { check: string; detail: string }[] } | null)?.failed ?? []).map((m) => ({ check: m.check, detail: m.detail }));
  const refused = status === "rejected" || status === "blocked";
  const title = refused ? "Draft entry refused by the kernel" : status === "pending_approval" ? "Entry accepted by the kernel, parked for a person" : `Entry ${status || "proposed"}`;
  return { at: r.ts, kind: "proposal", title, detail: refused ? failed.map((m) => m.check).join(", ") : summariseOutput(output), status: refused ? "refused" : "ok", latency_ms: r.latency_ms, refused_on: failed };
}

function readingStatus(output: unknown): StepStatus {
  return (output as { outcome?: string } | null)?.outcome === "rejected" ? "refused" : "ok";
}

function approvalSteps(db: Db, decisionId: string): TraceStep[] {
  const rows = db.prepare("SELECT approver_id, approver_kind, outcome, note, approved_at FROM approval WHERE decision_id = ? ORDER BY approved_at")
    .all(decisionId) as { approver_id: string; approver_kind: string; outcome: string; note: string | null; approved_at: string }[];
  return rows.map((a) => ({
    at: a.approved_at, kind: "approval" as const, title: `${a.outcome === "approved" ? "Approved" : "Declined"} by ${a.approver_id}`,
    detail: [a.approver_kind === "human" ? "a person" : "the controller agent", a.note].filter(Boolean).join(" · "),
    status: a.outcome === "approved" ? "ok" as const : "refused" as const, latency_ms: null, refused_on: [], input: null, output: null,
  }));
}

/** A person's answer is its own turn on the case: who answered, what they said, and how long the question waited. */
function answerSpans(db: Db, intentId: string): TraceSpan[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.asked_user, e.asked_at, e.answered_at, e.answer_json FROM escalation e JOIN decision d ON d.id = e.decision_id
       WHERE d.intent_id = ? AND e.answered_at IS NOT NULL ORDER BY e.answered_at`,
    )
    .all(intentId) as { id: string; asked_user: string; asked_at: string; answered_at: string; answer_json: string }[];
  return rows.map((e) => {
    const answer = (safeJson(e.answer_json) as { answered_by?: string; treatment?: string; uses?: string; valid_to?: string; text?: string } | null) ?? {};
    const scope = [answer.treatment, answer.uses, answer.valid_to ? `until ${answer.valid_to}` : null].filter(Boolean).join(" · ");
    const step: TraceStep = { at: e.answered_at, kind: "answer", title: `Answered by ${answer.answered_by ?? e.asked_user}`, detail: [scope, answer.text].filter(Boolean).join(" — "), status: "ok", latency_ms: null, refused_on: [], input: null, output: pretty(e.answer_json) };
    return {
      decision_id: null, lane: "person" as const, actor: answer.answered_by ?? e.asked_user, label: "A person's answer", model: "a person", kind: answer.treatment ?? null, route: null,
      outcome: "answered", started_at: e.answered_at, ended_at: e.answered_at, duration_ms: 0, model_calls: 0, cost_micros: 0, steps: [step],
    };
  });
}

/** Says what actually ran. A scripted stand-in in a rehearsal is named as one, never as a model. */
function modelOf(lane: Lane, actor: string): string {
  if (lane === "code") return "code";
  if (lane === "reader") return actor.slice("reader:".length);
  const name = actor.split(":").at(-1) ?? actor;
  return MODEL_IDS[name] ?? (lane === "model" ? `${name} (scripted stand-in, not a model)` : name);
}

function pretty(json: string | null): string | null {
  if (json === null) return null;
  const parsed = safeJson(json);
  const text = parsed === null ? json : JSON.stringify(parsed, null, 2);
  return text.length <= DETAIL_MAX ? text : `${text.slice(0, DETAIL_MAX)}\n… (${text.length - DETAIL_MAX} more characters in the database)`;
}

function laneOf(actor: string, tier: number | null): Lane {
  if (actor.startsWith("reader:")) return "reader";
  if (actor.startsWith("controller")) return "controller";
  if (tier !== null && tier >= 1) return "model";
  return "code";
}

function labelOf(lane: Lane, d: DecisionRow): string {
  if (lane === "reader") return `Document reader (${d.actor.slice("reader:".length)})`;
  if (lane === "model") return `${MODEL_NAMES[d.tier ?? 0] ?? "Model"} · tier ${d.tier}`;
  if (lane === "controller") return "Controller agent";
  if (d.actor === "router:resume") return "Code, carrying out a person's answer";
  if (d.actor === "router:unsettled") return "Code: nothing more it can settle";
  return "Code tier";
}

function outcomeOf(d: DecisionRow, rows: StepRow[], steps: TraceStep[]): string {
  if (d.posted_at) return steps.some((s) => s.kind === "approval") ? "posted after approval" : "posted, no person involved";
  if (steps.some((s) => s.kind === "approval" && s.status === "refused")) return "declined by a person";
  if (d.route === "PROPOSE") return "parked for a person";
  if (d.route === "ESCALATE") return "asked a person";
  if (d.route === "BLOCK" || d.route === "REFUSE") return `${d.route.toLowerCase()}ed`;
  const ended = safeJson(rows.filter((r) => r.kind === "route").at(-1)?.output_json ?? "null") as { outcome?: string } | null;
  if (ended?.outcome === "handed_off") return "handed up to a stronger tier";
  if (ended?.outcome === "budget_exhausted") return "ran out of time or budget";
  return ended?.outcome ?? "left open";
}

function latest(spans: TraceSpan[]): string | null {
  return spans.map((s) => s.ended_at).sort().at(-1) ?? null;
}

function totalsOf(spans: TraceSpan[]): CaseTrace["totals"] {
  const steps = spans.flatMap((s) => s.steps);
  return {
    turns: spans.length, tool_calls: steps.filter((s) => s.kind === "tool").length,
    model_calls: spans.reduce((n, s) => n + s.model_calls, 0), cost_micros: spans.reduce((n, s) => n + s.cost_micros, 0),
    kernel_refusals: steps.filter((s) => s.kind === "proposal" && s.status === "refused").length,
    questions: steps.filter((s) => s.kind === "question" && s.status === "waiting").length,
    approvals: steps.filter((s) => s.kind === "approval").length, posted: steps.filter((s) => s.kind === "posted").length,
  };
}
