import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { out, runCli, warn } from "../../cli/flags.js";
import { APP_CONFIG } from "../../packs/index.js";
import { systemClock } from "../../runtime/config.js";
import { openDb } from "../../runtime/db.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { openAccrualCases, unbilledExpenses } from "./accruals.js";

/**
 * pnpm accruals <db> <YYYY-MM>: the close's own monitor, then the code tier. Opens one case per recurring vendor
 * expense with nothing booked for the month and lets code estimate the steady ones. No model is called: a case code
 * leaves open is worked by `pnpm worker <db> --intent <id>`, which is paid.
 */
async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [dbPath, period] = argv;
  if (!dbPath || !existsSync(dbPath) || !/^\d{4}-\d{2}$/.test(period ?? "")) {
    warn("usage: pnpm accruals <db> <YYYY-MM>");
    return 1;
  }
  const db = openDb(dbPath);
  const opened = openAccrualCases(db, systemClock, period!);
  const report = await runOpenIntents(db, { investigators: [], config: APP_CONFIG, function: "close" });
  out(`accruals ${period}: ${opened.length} case(s) opened · ${report.worked.filter((w) => w.routes.includes("PROPOSE")).length} prepared by code and parked · ${report.worked.filter((w) => w.routes.length === 0).length} left for a model`);
  for (const u of unbilledExpenses(db, period!)) out(`  ${u.intent_id}  ${u.party} · ${u.account_name} · ${u.steady ? "steady" : "moves"} · ${u.status}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(main);
