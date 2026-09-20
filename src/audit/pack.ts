import { APP_CONFIG } from "../packs/index.js";
import type { Clock, RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { emit } from "../runtime/events.js";
import { runControlTests } from "./controls.js";
import { rerunDecision } from "./rerun.js";
import { drawSample } from "./sample.js";
import type { AuditPack, Finding, FindingType, PackSummary, RerunResult } from "./types.js";

export interface PackInput {
  period: string;
  seed: string;
  /** Size of the random stratum. The must-test stratum is whatever the risk criteria catch. */
  size: number;
  /** Defaults to the application's own configuration, packs and all. See `buildAuditPack`. */
  config?: RuntimeConfig;
}

/**
 * The whole pack in one pass: draw the sample, re-perform every item in it, run the control tests,
 * and raise one event per finding. Everything in the result is JSON-serialisable, because the point
 * of the pack is that somebody else can re-run it from the seed and get the same thing back.
 *
 * The configuration defaults to APP_CONFIG, the one the rest of the application posts on: on the bare
 * runtime defaults a function's pack checks are missing, and every AP entry then re-performs as an X2
 * failure ("no pack checks are configured"), which buries the findings this pack exists to surface.
 */
export function buildAuditPack(db: Db, clock: Clock, input: PackInput): AuditPack {
  const config = input.config ?? APP_CONFIG;
  const sample = drawSample(db, {
    period: input.period,
    seed: input.seed,
    size: input.size,
    materiality_cents: config.materiality_cents,
  });
  const reperformance = [...sample.must_test, ...sample.random].map((item) => rerunDecision(db, item.decision_id, config));
  const controls = runControlTests(db, { period: input.period, materiality_cents: config.materiality_cents });
  const findings = [...reperformance.flatMap((result) => result.findings), ...controls.findings];
  const pack: AuditPack = {
    period: input.period,
    seed: input.seed,
    materiality_cents: config.materiality_cents,
    population_size: sample.population_size,
    sample,
    reperformance,
    controls,
    summary: summarise(reperformance, findings),
  };
  raise(db, clock, pack, findings);
  return pack;
}

/** One event per finding, then one to say the pack is closed. The bus is how the rest of the system hears. */
function raise(db: Db, clock: Clock, pack: AuditPack, findings: readonly Finding[]): void {
  for (const item of findings) {
    emit(db, clock, {
      topic: "audit.finding.raised",
      from_function: "audit",
      intent_id: null,
      payload: { period: pack.period, seed: pack.seed, type: item.type, detail: item.detail, refs: item.refs },
    });
  }
  emit(db, clock, {
    topic: "audit.pack.ready",
    from_function: "audit",
    intent_id: null,
    payload: {
      period: pack.period,
      seed: pack.seed,
      population_size: pack.population_size,
      agent_approved: pack.controls.agent_approved,
      ...pack.summary,
    },
  });
}

function summarise(reperformance: readonly RerunResult[], findings: readonly Finding[]): PackSummary {
  const clean = reperformance.filter((result) => result.findings.length === 0).length;
  const byType: Partial<Record<FindingType, number>> = {};
  for (const item of findings) byType[item.type] = (byType[item.type] ?? 0) + 1;
  return {
    sampled: reperformance.length,
    reperformed_clean: clean,
    reperformed_clean_share: reperformance.length === 0 ? 1 : clean / reperformance.length,
    findings_total: findings.length,
    findings_by_type: byType,
  };
}
