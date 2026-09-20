import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { out, runCli, warn } from "../cli/flags.js";
import { openDb } from "../runtime/db.js";
import { seedDemoWorld } from "./seed.js";

/** `pnpm demo:seed <db>` — a fresh database holding the small demo July. It never touches an existing file. */
function main(): number {
  const dbPath = process.argv[2];
  if (!dbPath) {
    warn("usage: pnpm demo:seed <db>");
    return 1;
  }
  if (existsSync(dbPath)) {
    warn(`${dbPath} already exists; choose another path`);
    return 1;
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  seedDemoWorld(db);
  const n = db.prepare("SELECT COUNT(*) AS n FROM intent WHERE status = 'open'").get() as { n: number };
  out(`seeded ${dbPath}: ${n.n} open intent(s). next: pnpm worker ${dbPath} --code-only`);
  return 0;
}

runCli(main);
