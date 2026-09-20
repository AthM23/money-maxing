import { fileURLToPath } from "node:url";
import { loadCases, type CaseRow } from "./cases.js";
import { parseCliArgs, type CliOptions } from "./cli-args.js";
import { computeMetrics, type Metrics } from "./metrics.js";
import { formatRatio, formatUsd } from "./report-format.js";
import { writeReportFiles } from "./report-writer.js";
import type { ReportArtifact, RunMeta } from "./report.js";
import { notImplementedSut, recordedSut, type CaseOutcome, type SystemUnderTest } from "./sut.js";
import { kernelPackSut } from "./suts/kernelPack.js";

/** Never throws: every failure path is caught and turned into an exit code, so this is directly
 *  testable without a subprocess. Exit 2 = false auto-post found, 1 = harness error, 0 = otherwise. */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const options = parseCliArgs(argv);
    const allRows = loadCases();
    const rows = filterRows(allRows, options);
    const sut = selectSut(options);
    const outcomes = await runAllCases(sut, rows, options);
    const metrics = computeMetrics(rows, outcomes);
    const artifact = buildArtifact(metrics, sut, options, rows.length);
    const paths = writeReportFiles(artifact);
    process.stdout.write(formatSummary(metrics, paths.markdownPath));
    return metrics.false_auto_posts > 0 ? 2 : 0;
  } catch (err) {
    process.stderr.write(`eval run failed: ${(err as Error).message}\n`);
    return 1;
  }
}

/** --outcomes takes priority when both are given; otherwise --sut kernel-pack opts into the real
 *  system, and anything else (including no --sut at all) keeps the original notImplementedSut. */
function selectSut(options: CliOptions): SystemUnderTest {
  if (options.outcomesPath) return recordedSut(options.outcomesPath);
  if (options.sut === "kernel-pack") return kernelPackSut;
  return notImplementedSut;
}

function filterRows(rows: readonly CaseRow[], options: CliOptions): CaseRow[] {
  return rows.filter((row) => {
    const stageOk = options.stage === "all" || row.min_fixture;
    const packOk = options.pack === undefined || row.pack === options.pack;
    return stageOk && packOk;
  });
}

async function runAllCases(
  sut: SystemUnderTest,
  rows: readonly CaseRow[],
  options: CliOptions,
): Promise<Map<string, CaseOutcome>> {
  const outcomes = new Map<string, CaseOutcome>();
  for (const row of rows) {
    const outcome = await sut.runCase(row, { baseline: options.baseline, seed: options.seed });
    outcomes.set(row.id, outcome);
  }
  return outcomes;
}

function buildArtifact(
  metrics: Metrics,
  sut: SystemUnderTest,
  options: CliOptions,
  casesConsidered: number,
): ReportArtifact {
  const meta: RunMeta = {
    timestamp: new Date().toISOString(),
    sut_name: sut.name,
    stage: options.stage,
    baseline: options.baseline,
    seed: options.seed,
    pack_filter: options.pack,
    cases_considered: casesConsidered,
  };
  return { meta, metrics };
}

function formatSummary(metrics: Metrics, reportPath: string): string {
  const lines = [
    `eval: ${metrics.cases_run} / ${metrics.cases_total} routed cases ran`,
    `  auto-clear rate:      ${formatRatio(metrics.auto_clear_rate)}`,
    `  auto-clear precision: ${formatRatio(metrics.auto_clear_precision)}`,
    `  false auto-posts:     ${metrics.false_auto_posts}`,
    `  AUTO, journal unchecked: ${metrics.auto_posts_journal_unchecked}`,
    `  exception recall:     ${formatRatio(metrics.exception_recall)}`,
    `  cost / 1,000 txns:    ${formatUsd(metrics.cost_per_1000_usd)}`,
    `  report: ${reportPath}`,
    "",
  ];
  return lines.join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === entry;
}

if (isMainModule()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
