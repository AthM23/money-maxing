import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runDir } from "./paths.js";
import { renderJsonReport, renderMarkdownReport, type ReportArtifact } from "./report.js";

export interface WrittenReportPaths {
  dir: string;
  markdownPath: string;
  jsonPath: string;
}

/** ISO timestamp plus a short random suffix, so two runs in the same process never collide. */
export function defaultRunTimestamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return `${iso}-${randomBytes(3).toString("hex")}`;
}

export function writeReportFiles(
  artifact: ReportArtifact,
  timestamp: string = defaultRunTimestamp(),
): WrittenReportPaths {
  const dir = runDir(timestamp);
  mkdirSync(dir, { recursive: true });
  const markdownPath = path.join(dir, "report.md");
  const jsonPath = path.join(dir, "result.json");
  writeFileSync(markdownPath, renderMarkdownReport(artifact), "utf8");
  writeFileSync(jsonPath, renderJsonReport(artifact), "utf8");
  return { dir, markdownPath, jsonPath };
}
