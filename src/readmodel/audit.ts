import { readFileSync } from "node:fs";
import type { AuditPack } from "../audit/types.js";
import type { AuditSummaryView } from "./types.js";

/** Read a previously built audit pack (pnpm auditpack's JSON output) and surface its summary and findings, verbatim. */
export function buildAuditSummary(path: string): AuditSummaryView {
  const pack = JSON.parse(readFileSync(path, "utf8")) as AuditPack;
  const findings = [...pack.reperformance.flatMap((r) => r.findings), ...pack.controls.findings];
  return { path, summary: pack.summary, findings };
}
