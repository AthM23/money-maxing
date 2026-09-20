import type { CliOptions } from "./cli-args.js";
import type { Metrics, Ratio } from "./metrics.js";
import { formatRatio, formatUsd, markdownTable } from "./report-format.js";

export interface RunMeta {
  timestamp: string;
  sut_name: string;
  stage: CliOptions["stage"];
  baseline: boolean;
  seed: number;
  pack_filter?: string;
  cases_considered: number;
}

export interface ReportArtifact {
  meta: RunMeta;
  metrics: Metrics;
}

export function renderJsonReport(artifact: ReportArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

export function renderMarkdownReport(artifact: ReportArtifact): string {
  const sections = [
    renderHeader(artifact.meta),
    renderHeadlineNumbers(artifact.metrics),
    renderAccuracyBreakdowns(artifact.metrics),
    renderConfusionMatrix(artifact.metrics),
    renderOutOfScope(artifact.metrics),
    renderInvariants(artifact.metrics),
  ];
  return `${sections.join("\n\n")}\n`;
}

function renderHeader(meta: RunMeta): string {
  const packLine = meta.pack_filter ? `, pack \`${meta.pack_filter}\`` : "";
  return [
    "# Eval report",
    "",
    `Run at ${meta.timestamp} — SUT \`${meta.sut_name}\`, stage \`${meta.stage}\`${packLine}, ` +
      `baseline=${meta.baseline}, seed=${meta.seed}. ${meta.cases_considered} cases considered.`,
  ].join("\n");
}

function renderHeadlineNumbers(metrics: Metrics): string {
  const rows = [
    ["Auto-clear rate", formatRatio(metrics.auto_clear_rate), "70-85% credible; higher invites suspicion"],
    ["Auto-clear precision", formatRatio(metrics.auto_clear_precision), "100% — must not move"],
    ["False auto-posts", String(metrics.false_auto_posts), "0"],
    ["AUTO results whose journal was not checked", String(metrics.auto_posts_journal_unchecked), "0: until then an AUTO is right on its route only"],
    ["Exception recall", formatRatio(metrics.exception_recall), "100%"],
    ["Cost per 1,000 transactions", formatUsd(metrics.cost_per_1000_usd), "beat the rules-disabled baseline"],
  ];
  return [
    "## Headline numbers",
    "",
    `${metrics.cases_run} / ${metrics.cases_total} routed cases ran.`,
    "",
    markdownTable(["Metric", "Value", "Target"], rows),
  ].join("\n");
}

function renderAccuracyBreakdowns(metrics: Metrics): string {
  const byRoute = renderGroupTable("By expected route", metrics.accuracy_by_route);
  const byPack = renderGroupTable("By pack", metrics.accuracy_by_pack);
  const byTier = renderGroupTable("By tier", metrics.accuracy_by_tier);
  return ["## Accuracy breakdown (all graded cases, NOT_RUN included)", "", byRoute, "", byPack, "", byTier].join(
    "\n",
  );
}

function renderGroupTable(title: string, groups: Record<string, Ratio>): string {
  const rows = Object.entries(groups).map(([key, ratio]) => [key, formatRatio(ratio)]);
  return [`### ${title}`, "", markdownTable(["Group", "Accuracy"], rows)].join("\n");
}

function renderConfusionMatrix(metrics: Metrics): string {
  const { expectedRoutes, actualColumns, counts } = metrics.confusion_matrix;
  const rows = expectedRoutes.map((expected) => [
    expected,
    ...actualColumns.map((actual) => String(counts[expected][actual])),
  ]);
  return ["## Confusion matrix (expected / actual)", "", markdownTable(["Expected \\ Actual", ...actualColumns], rows)].join(
    "\n",
  );
}

function renderOutOfScope(metrics: Metrics): string {
  const { accuracy, cases } = metrics.out_of_scope;
  const rows = cases.map((c) => [c.case_id, c.expected_route, c.actual_route, c.verdict]);
  return [
    "## Out of spec scope (in_spec_scope = no)",
    "",
    `Accuracy: ${formatRatio(accuracy)}. Reported separately — see tests/README.md for why these stay out.`,
    "",
    markdownTable(["Case", "Expected", "Actual", "Verdict"], rows),
  ].join("\n");
}

function renderInvariants(metrics: Metrics): string {
  const rows = metrics.invariants.map((inv) => [inv.case_id, inv.title, inv.qualifier ?? ""]);
  return ["## Invariants (not routed, not scored here)", "", markdownTable(["Case", "Title", "Qualifier"], rows)].join(
    "\n",
  );
}
