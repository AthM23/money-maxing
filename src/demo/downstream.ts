import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { openWorldDb, type Db } from "../ledger/db.js";
import { runSpine, type SpineReport } from "../spine/run.js";

const USAGE = "usage: pnpm downstream <db> --stores <dir>";

/**
 * Everything downstream of cash, with no model and no stand-in: lane B's revenue schedules, forecast, close checklist
 * and the QuickBooks mirror as a dry run, each reacting to what is already in the ledger. `pnpm spine` does the same
 * but always brings an investigator: the model tiers when a key is set (a paid pass over every open case), otherwise a
 * scripted tier 1 that hands every case off, after which a real model pass finds nothing left open. Here judgment is
 * left exactly where it stands, so a case only code has tried stays open for the model.
 */
export async function refreshDownstream(db: Db, storesDir: string): Promise<SpineReport> {
  return runSpine(db, { investigators: [], stores_dir: storesDir, qbo: { dry_run: true } });
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const dbPath = args.positional[0];
  const stores = flagString(args, "stores");
  if (!dbPath || !stores) {
    warn(USAGE);
    return 1;
  }
  for (const path of [dbPath, stores]) {
    if (!existsSync(path)) {
      warn(`${path} does not exist`);
      return 1;
    }
  }
  const r = await refreshDownstream(openWorldDb(dbPath), stores);
  const done = r.checklist.filter((i) => i.status === "done").length;
  out(`downstream ${r.period}: ${r.cases} case(s) re-read in code · engine passes ${r.engine_passes} · close ${done}/${r.checklist.length} · AR ${r.ar_tied ? "tied" : "NOT TIED"}`);
  return r.ar_tied ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(main);
