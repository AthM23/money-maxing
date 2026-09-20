import type { ToolEnv } from "./env.js";

export interface StepInput {
  kind: "tool_call" | "evidence_hit" | "kernel_mark" | "model_turn" | "route";
  tool?: string;
  input?: unknown;
  output?: unknown;
  tokens_in?: number;
  tokens_out?: number;
  cost_micros?: number;
  latency_ms?: number;
}

const MAX_JSON = 4000;

/** Append one step to the decision timeline. This is what the console shows and what training data is cut from. */
export function recordStep(env: ToolEnv, step: StepInput): void {
  const next = env.db.prepare("SELECT COALESCE(MAX(step_no), 0) + 1 AS n FROM decision_step WHERE decision_id = ?")
    .get(env.decision_id) as { n: number };
  env.db.prepare(
    `INSERT INTO decision_step (decision_id, step_no, ts, kind, tier, tool, input_json, output_json, tokens_in, tokens_out, cost_micros, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(env.decision_id, next.n, env.clock.now(), step.kind, env.tier, step.tool ?? null, clip(step.input), clip(step.output),
    step.tokens_in ?? null, step.tokens_out ?? null, step.cost_micros ?? null, step.latency_ms ?? null);
  if (step.cost_micros || step.kind === "model_turn") {
    env.db.prepare("UPDATE decision SET cost_micros = cost_micros + ?, model_calls = model_calls + ? WHERE id = ?")
      .run(step.cost_micros ?? 0, step.kind === "model_turn" ? 1 : 0, env.decision_id);
  }
}

function clip(value: unknown): string | null {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}…` : text;
}
