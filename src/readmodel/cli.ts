import { existsSync } from "node:fs";
import { flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { openDb } from "../runtime/db.js";
import { buildConsoleState } from "./state.js";

const USAGE = "usage: tsx src/readmodel/cli.ts <db> [--decision <id>] [--audit <pack.json>]";

/** Print the whole console state for one database as JSON, so the UI can render it with no other call. Read-only. */
function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : USAGE);
    return 1;
  }
  const auditPath = flagString(args, "audit");
  if (auditPath && !existsSync(auditPath)) {
    warn(`no audit pack at ${auditPath}`);
    return 1;
  }
  const db = openDb(dbPath);
  const state = buildConsoleState(db, { decision_id: flagString(args, "decision"), audit_pack_path: auditPath });
  out(JSON.stringify(state, null, 2));
  return 0;
}

runCli(main);
