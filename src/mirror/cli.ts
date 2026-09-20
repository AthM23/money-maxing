import { QboClient, qboConfigFromEnv } from "../connectors/qboClient.js";
import { loadEnv } from "../env.js";
import { dbPath, openWorldDb } from "../ledger/db.js";
import { liveQboClient, mirrorOnce, type MirrorStep } from "./index.js";
import { resetMirror } from "./reset.js";

/**
 * `tsx src/mirror/cli.ts [--dry-run] [--reset] [--verbose]`. Live by default since 20 Sep: what the agents post belongs
 * in QuickBooks, and `--reset` takes it back out, so a run is no longer one-way. The client is built from .env the way
 * the QuickBooks seeder does; a live pass also retries whatever an earlier dry run or failure left behind. `--dry-run`
 * builds every body and writes it to mirror_log, sending nothing. `--reset` deletes what the mirror made in QuickBooks
 * (never what the seeder made) and forgets it locally, then stops. `--live` is still accepted and changes nothing.
 */

const DETAIL_WIDTH = 160;

function line(s: MirrorStep, verbose: boolean): string {
  const detail = s.detail ?? "";
  const shown = verbose || detail.length <= DETAIL_WIDTH ? detail : `${detail.slice(0, DETAIL_WIDTH)}…`;
  return `${s.status.padEnd(8)} ${s.decision_id}  ${s.kind}${s.external_id ? ` -> ${s.external_id}` : ""}  ${shown.replace(/\s*\n\s*/g, " ")}`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = !argv.includes("--dry-run");
  loadEnv();
  const db = openWorldDb(dbPath());
  try {
    if (argv.includes("--reset")) {
      const r = await resetMirror(db, new QboClient(qboConfigFromEnv()), (s) => process.stdout.write(`${s}
`));
      for (const f of r.failed) process.stdout.write(`FAILED to delete ${f.entity} ${f.id}: ${f.error}
`);
      process.stdout.write(`mirror reset: removed ${JSON.stringify(r.removed)}, ${r.failed.length} failed; local mirror log cleared, the next pass mirrors everything again
`);
      if (r.failed.length > 0) process.exitCode = 1;
      return;
    }
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
