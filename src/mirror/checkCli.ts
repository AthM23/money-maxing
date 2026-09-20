import { loadEnv } from "../env.js";
import { dbPath, openWorldDb } from "../ledger/db.js";
import { liveQboClient } from "./index.js";
import { tieOut, tieOutText } from "./tieout.js";

/** `tsx src/mirror/checkCli.ts [--json]`: AR and AP here against QuickBooks, document by document. Read-only on both sides; exit 1 when something differs. */
async function main(): Promise<void> {
  loadEnv();
  const db = openWorldDb(dbPath());
  try {
    const result = await tieOut(db, liveQboClient());
    process.stdout.write(`${process.argv.includes("--json") ? JSON.stringify(result, null, 2) : tieOutText(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
