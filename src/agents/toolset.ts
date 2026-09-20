import type { ToolEnv } from "./env.js";
import { recordStep } from "./steps.js";
import { READ_TOOL_SPECS, type ToolSpec } from "./tools/read.js";
import { WRITE_TOOL_SPECS } from "./tools/write.js";

export const ALL_TOOLS: readonly ToolSpec[] = [...READ_TOOL_SPECS, ...WRITE_TOOL_SPECS];

export interface ToolCallResult {
  ok: boolean;
  output: unknown;
}

/**
 * The single door every tool call goes through, whichever harness drives the model: validate the input,
 * run the handler, meter the step. A thrown error comes back as data for the model, never as a crash.
 */
export function callTool(env: ToolEnv, name: string, rawInput: unknown): ToolCallResult {
  const spec = ALL_TOOLS.find((t) => t.name === name);
  if (!spec) return finishCall(env, name, rawInput, false, { error: `unknown tool ${name}` });
  const parsed = spec.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return finishCall(env, name, rawInput, false, { error: "invalid input", issues });
  }
  const started = Date.now();
  try {
    const output = spec.run(parsed.data as Record<string, unknown>, env);
    return finishCall(env, name, parsed.data, true, output, Date.now() - started);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return finishCall(env, name, parsed.data, false, { error: message }, Date.now() - started);
  }
}

function finishCall(env: ToolEnv, tool: string, input: unknown, ok: boolean, output: unknown, latencyMs?: number): ToolCallResult {
  recordStep(env, { kind: "tool_call", tool, input, output, latency_ms: latencyMs });
  return { ok, output };
}
