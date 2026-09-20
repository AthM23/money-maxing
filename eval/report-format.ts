import type { Ratio } from "./metrics.js";

/** Every ratio is rendered as "k / n" first — the percentage is a secondary annotation. */
export function formatRatio(ratio: Ratio): string {
  const fraction = `${ratio.k} / ${ratio.n}`;
  if (ratio.value === null) return `${fraction} (n/a)`;
  return `${fraction} (${(ratio.value * 100).toFixed(1)}%)`;
}

export function formatUsd(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(2)}`;
}

export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `|${headers.map(() => "---").join("|")}|`;
  const bodyLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, dividerLine, ...bodyLines].join("\n");
}
