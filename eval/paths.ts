import { fileURLToPath } from "node:url";
import path from "node:path";

/** eval/ itself. Every other path here is resolved from it, never from process.cwd(),
 *  so loadCases()/writeReportFiles() work the same whether run via `pnpm eval`, a test
 *  runner, or `node --import tsx eval/run.ts` from some other directory. */
const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.join(EVAL_DIR, "..");
export const DEFAULT_CASES_PATH = path.join(REPO_ROOT, "tests", "cases.csv");

/** Where one eval run's report.md and result.json land. runs/ is git-ignored. */
export function runDir(timestamp: string): string {
  return path.join(REPO_ROOT, "runs", "eval", timestamp);
}
