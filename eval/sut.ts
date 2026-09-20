import { readFileSync } from "node:fs";
import { z } from "zod";
import { Route } from "../src/contract/types.js";
import type { CaseRow } from "./cases.js";

/** What the system under test produced for one case, in the harness's own vocabulary. */
export interface CaseOutcome {
  case_id: string;
  route: Route | "NOT_RUN";
  block_rule?: string;
  refuse_places_looked?: string[];
  escalate_unknown?: string;
  auto_posted_entry_matches_key?: boolean;
  cost_micros?: number;
  model_calls?: number;
  latency_ms?: number;
  error?: string;
}

export interface RunOptions {
  /** True disables the deterministic tier and routes everything through the model (README item 6). */
  baseline: boolean;
  seed: number;
}

export interface SystemUnderTest {
  name: string;
  runCase(c: CaseRow, opts: RunOptions): Promise<CaseOutcome>;
}

/** Nothing plugged in yet: every case comes back unrun. The harness's own baseline-of-baselines. */
export const notImplementedSut: SystemUnderTest = {
  name: "not-implemented",
  async runCase(c) {
    return { case_id: c.id, route: "NOT_RUN" };
  },
};

const CaseOutcomeSchema = z.object({
  case_id: z.string().min(1),
  route: z.union([Route, z.literal("NOT_RUN")]),
  block_rule: z.string().min(1).optional(),
  refuse_places_looked: z.array(z.string()).optional(),
  escalate_unknown: z.string().min(1).optional(),
  auto_posted_entry_matches_key: z.boolean().optional(),
  cost_micros: z.number().nonnegative().optional(),
  model_calls: z.number().int().nonnegative().optional(),
  latency_ms: z.number().nonnegative().optional(),
  error: z.string().optional(),
});

/**
 * Replays outcomes recorded by a real run, keyed by case_id, so the grader and reporter can be
 * built and tested before the real system exists, then later fed its actual output. Cases absent
 * from the file come back NOT_RUN rather than throwing — a partial recording is a valid input.
 */
export function recordedSut(path: string): SystemUnderTest {
  const byId = readRecordedOutcomes(path);
  return {
    name: `recorded:${path}`,
    async runCase(c) {
      return byId.get(c.id) ?? { case_id: c.id, route: "NOT_RUN" };
    },
  };
}

function readRecordedOutcomes(path: string): Map<string, CaseOutcome> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`could not read outcomes file at ${path}: ${(err as Error).message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`outcomes file at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  const result = z.array(CaseOutcomeSchema).safeParse(json);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`outcomes file at ${path} failed validation: ${detail}`);
  }
  return new Map(result.data.map((outcome) => [outcome.case_id, outcome]));
}
