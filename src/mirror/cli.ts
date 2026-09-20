import { loadEnv } from "../env.js";
import { dbPath, openWorldDb } from "../ledger/db.js";
import { liveQboClient, mirrorOnce, type MirrorStep } from "./index.js";

/**
 * `tsx src/mirror/cli.ts [--live] [--verbose]`. Default is a dry run: every body is built and written to mirror_log,
 * nothing is sent. `--live` builds the real client from .env the way the QuickBooks seeder does, and also retries
 * whatever an earlier dry run or failure left behind.
 */

const DETAIL_WIDTH = 160;

function line(s: MirrorStep, verbose: boolean): string {
  const detail = s.detail ?? "";
  const shown = verbose || detail.length <= DETAIL_WIDTH ? detail : `${detail.slice(0, DETAIL_WIDTH)}…`;
  return `${s.status.padEnd(8)} ${s.decision_id}  ${s.kind}${s.external_id ? ` -> ${s.external_id}` : ""}  ${shown.replace(/\s*\n\s*/g, " ")}`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  loadEnv();
  const db = openWorldDb(dbPath());
  try {
    const result = await mirrorOnce(db, live ? { client: liveQboClient() } : { dry_run: true });
    for (const s of result.steps) process.stdout.write(`${line(s, argv.includes("--verbose"))}\n`);
    const count = (status: string): number => result.steps.filter((s) => s.status === status).length;
    process.stdout.write(
      `mirror (${live ? "LIVE" : "dry run"}): ${result.events} events, ${result.retried} decisions retried, ${result.steps.length} steps: ` +
      `${count("mirrored")} mirrored, ${count("dry_run")} dry_run, ${count("skipped")} skipped, ${count("failed")} failed\n`,
    );
    if (count("failed") > 0) process.exitCode = 1;
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
