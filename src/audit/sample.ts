import type { Mark } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { mulberry32, seedFromString, shuffle } from "./prng.js";
import { PERIOD_PREDICATE, entryAmountCents, parseProposal } from "./shared.js";
import type { Sample, SampleItem } from "./types.js";

export interface SampleInput {
  period: string;
  /** Any text. The same seed on the same data redraws the same sample. */
  seed: string;
  /** How many items to draw from the remainder, on top of the must-test stratum. */
  size: number;
  materiality_cents: number;
}

interface PopulationRow {
  decision_id: string;
  autonomy_level: string;
  tier: number | null;
  proposal_json: string;
}

/**
 * Risk-weighted selection over the live decisions that took effect in the period. Everything that
 * looks risky is examined in full; the rest is a seeded random draw, so the two strata are never
 * mixed and neither one is projected onto the other.
 */
export function drawSample(db: Db, input: SampleInput): Sample {
  const rows = readPopulation(db, input.period);
  const mustTest: SampleItem[] = [];
  const remainder: string[] = [];
  for (const row of rows) {
    const reasons = mustTestReasons(db, row, input.materiality_cents);
    if (reasons.length > 0) mustTest.push({ decision_id: row.decision_id, stratum: "must_test", reasons });
    else remainder.push(row.decision_id);
  }
  return {
    period: input.period,
    seed: input.seed,
    materiality_cents: input.materiality_cents,
    population_size: rows.length,
    must_test: mustTest,
    random: drawRandom(remainder, input),
  };
}

/** The draw order is what the seed fixes; the reported order is sorted so two runs compare cleanly. */
function drawRandom(remainder: readonly string[], input: SampleInput): SampleItem[] {
  const next = mulberry32(seedFromString(`${input.period}:${input.seed}`));
  const size = Math.max(0, Math.trunc(input.size));
  return shuffle(remainder, next)
    .slice(0, size)
    .sort()
    .map((id) => ({ decision_id: id, stratum: "random" as const, reasons: [`seeded random draw (seed ${input.seed})`] }));
}

/** Ordered by id, so the sample does not depend on the order SQLite happens to hand rows back in. */
function readPopulation(db: Db, period: string): PopulationRow[] {
  return db
    .prepare(
      `SELECT d.id AS decision_id, d.autonomy_level, d.tier, d.proposal_json
       FROM decision d
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.proposal_json IS NOT NULL
         AND ${PERIOD_PREDICATE}
       ORDER BY d.id`,
    )
    .all(period, period) as PopulationRow[];
}

/** Any one of these puts an item in the must-test stratum, and each one is reported by name. */
function mustTestReasons(db: Db, row: PopulationRow, materialityCents: number): string[] {
  const reasons: string[] = [];
  const proposal = parseProposal(row.proposal_json);
  if (!proposal) return [`proposal_json no longer parses as a Proposal`];
  const amount = entryAmountCents(proposal);
  if (amount >= materialityCents) reasons.push(`entry moves ${amount} cents, at or above materiality ${materialityCents}`);
  if (hasJudgmentMark(db, row.decision_id)) reasons.push("latest proposal workpaper still carries a judgment mark");
  if (agentApproved(db, row.decision_id)) reasons.push("approved by a controller_agent, not by a person");
  if (row.autonomy_level === "auto" && (row.tier ?? 0) >= 1) reasons.push(`posted on auto by model tier ${row.tier}`);
  return reasons;
}

/** The last proposal-stage workpaper: judgment the preparer left on the table and nobody re-performed. */
function hasJudgmentMark(db: Db, decisionId: string): boolean {
  const rows = db
    .prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid")
    .all(decisionId) as { marks_json: string }[];
  const proposals = rows
    .map((row) => safeJson(row.marks_json) as { stage?: string; marks?: Mark[] } | null)
    .filter((paper) => paper?.stage === "proposal");
  const latest = proposals[proposals.length - 1];
  return (latest?.marks ?? []).some((m) => m.status === "judgment");
}

/** An agent approving an agent is the riskiest path through the system, so it is never sampled away. */
function agentApproved(db: Db, decisionId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS hit FROM approval WHERE decision_id = ? AND approver_kind = 'controller_agent' LIMIT 1")
    .get(decisionId) as { hit: number } | undefined;
  return row !== undefined;
}
