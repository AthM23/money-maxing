import type { ToolEnv } from "../agents/env.js";
import { callTool, type ToolCallResult } from "../agents/toolset.js";
import { AUDITOR_DENIED_TOOLS, WRITE_TOOLS } from "../contract/tools.js";

/**
 * `finish` only ends the run and writes nothing, so the auditor keeps it. Every other write tool goes:
 * the auditor reads the record, it never adds to it.
 */
const KEPT_WRITE_TOOLS: ReadonlySet<string> = new Set(["finish"]);

/** The registry spells a tool `memory.facts`; the agent toolset spells the same tool `memory_facts`. */
function spellings(name: string): string[] {
  return [name, name.replaceAll(".", "_")];
}

/**
 * Auditor independence as a list of names the tool layer refuses, not a sentence in a prompt.
 * A prompt can be argued with; this cannot. It covers both spellings so neither layer is a way round.
 */
export const AUDITOR_FENCE: ReadonlySet<string> = new Set([
  ...AUDITOR_DENIED_TOOLS.flatMap(spellings),
  ...WRITE_TOOLS.filter((name) => !KEPT_WRITE_TOOLS.has(name)).flatMap(spellings),
]);

/**
 * The auditor's door to the toolset. A denied tool comes back as a refused result the model can read,
 * never as a throw and never as silence — and it is refused before `callTool`, so nothing is metered
 * against the decision and no preparer memory is touched on the way past.
 */
export function auditorCallTool(env: ToolEnv, tool: string, input: unknown): ToolCallResult {
  if (!AUDITOR_FENCE.has(tool)) return callTool(env, tool, input);
  return {
    ok: false,
    output: {
      error: `auditor independence: ${tool} is outside the auditor's allow-list`,
      reason: isWriteTool(tool)
        ? "the auditor reads the record and never writes to it"
        : "preparer memory would tell the auditor why the preparer thought it was fine",
    },
  };
}

function isWriteTool(tool: string): boolean {
  return WRITE_TOOLS.some((name) => spellings(name).includes(tool));
}
