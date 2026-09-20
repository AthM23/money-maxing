import { existsSync } from "node:fs";

/** Load the repo's git-ignored `.env` into process.env for CLIs. Variables already set in the shell win. */
export function loadEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch (err) {
    process.stderr.write(`could not read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
