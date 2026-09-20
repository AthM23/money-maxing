import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { flagInt, flagString, parseArgs, warn } from "../src/cli/flags.js";
import { openDb } from "../src/runtime/db.js";
import { BRAND, handle, marketingUrl } from "./app.js";
import { listening } from "./publicMode.js";
import { storesFor } from "./ripple.js";

const USAGE = "usage: pnpm workspace <db> [--port 4320] [--stores <dir>]";

/**
 * The workspace: one page over one database. It reads through `src/readmodel` and writes only through the functions
 * the command line and Slack already use. Bound to this machine; a write must come from the page itself.
 */
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : USAGE);
    process.exit(1);
  }
  const db = openDb(dbPath);
  const port = flagInt(args, "port") ?? 4320;
  if (process.env.MARKETING_URL && !marketingUrl()) warn("MARKETING_URL is not an http(s) address; the logo will open the local marketing page instead");
  const stores = storesFor(dbPath, flagString(args, "stores"));
  const { host, readOnly } = listening();
  createServer((req, res) => void handle(db, stores, readOnly, req, res)).listen(port, host, () => {
    process.stdout.write(`${BRAND}: http://localhost:${port}/dashboard  (marketing page at /; db ${dbPath}; other books ${stores ? `refresh from ${stores}` : "not refreshed: no stores folder"}${readOnly ? `; PUBLIC and read-only on ${host}` : ""})\n`);
  });
}

main();
