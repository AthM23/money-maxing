import type { CaseFile } from "../contract/types.js";
import type { ToolCallResult } from "./toolset.js";

export interface InvestigationTask {
  case_file: CaseFile;
  tier: number;
  system_prompt: string;
  /** The opening message for this case, written by the function's pack. */
  task_message: string;
  /** Why tier 0 did not settle it: refused facts, policies whose condition missed. */
  notes: string[];
  max_turns: number;
}

export interface InvestigationReport {
  outcome: "proposed" | "escalated" | "refused" | "handed_off" | "budget_exhausted";
  summary: string;
  places_looked: string[];
  /** Filled by model-backed investigators; a scripted one leaves them out. */
  model_calls?: number;
  cost_micros?: number;
}

export type ToolCaller = (tool: string, input: unknown) => ToolCallResult;

/**
 * Whatever drives the tool calls: the Claude Agent SDK, another harness, or a script in tests.
 * It can only act through `call`, so every harness is metered and gated the same way.
 */
export interface Investigator {
  name: string;
  investigate(task: InvestigationTask, call: ToolCaller): Promise<InvestigationReport>;
}
