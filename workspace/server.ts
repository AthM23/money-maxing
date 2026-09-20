import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flagInt, parseArgs, warn } from "../src/cli/flags.js";
import { openDb, type Db } from "../src/runtime/db.js";
import { ACTIONS } from "./actions.js";
import { assertSameOrigin, HttpError, readJson, sendJson, sendStatic } from "./http.js";
import { arAgeing, cashByWeek, closeView, forecastView, revenueView, trialBalance } from "./modules.js";
import { caseView, fleetView, overview, workpaperView } from "./views.js";

const USAGE = "usage: pnpm workspace <db> [--port 4320]";
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
const BRAND = process.env.FOOTNOTE_BRAND ?? "Money Maxer";

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
  createServer((req, res) => void handle(db, req, res)).listen(port, "127.0.0.1", () => {
    process.stdout.write(`${BRAND} workspace: http://localhost:${port}  (db ${dbPath})\n`);
  });
}

async function handle(db: Db, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET") return get(db, url, res);
    if (req.method === "POST" && url.pathname.startsWith("/api/do/")) {
      assertSameOrigin(req);
      const action = ACTIONS[url.pathname.slice("/api/do/".length)];
      if (!action) throw new HttpError(404, "no such action");
      return sendJson(res, 200, await action(db, await readJson(req)));
    }
    throw new HttpError(405, "method not allowed");
  } catch (err) {
    // The message, never the stack: this page may be on a projector.
    const status = err instanceof HttpError ? err.status : 500;
    sendJson(res, status, { error: err instanceof Error ? err.message : "something went wrong" });
  }
}

function get(db: Db, url: URL, res: ServerResponse): void {
  if (url.pathname === "/api/overview") return sendJson(res, 200, overview(db, BRAND));
  if (url.pathname === "/api/fleet") return sendJson(res, 200, fleetView(db));
  if (url.pathname === "/api/modules") return sendJson(res, 200, modules(db, url.searchParams.get("period") ?? ""));
  if (url.pathname === "/api/case") return found(res, caseView(db, url.searchParams.get("intent") ?? ""));
  if (url.pathname === "/api/workpaper") return found(res, workpaperView(db, url.searchParams.get("decision") ?? ""));
  if (url.pathname.startsWith("/api/")) throw new HttpError(404, "not found");
  sendStatic(res, PUBLIC, url.pathname);
}

/** Forecast, close, revenue and the standing reports for one month. A month that is not YYYY-MM is refused. */
function modules(db: Db, period: string): unknown {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new HttpError(400, "period must be YYYY-MM");
  const lastDay = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { period, forecast: forecastView(db), close: closeView(db), revenue: revenueView(db),
    reports: { ageing: arAgeing(db, lastDay), trial_balance: trialBalance(db, period), cash_by_week: cashByWeek(db, period) } };
}

function found(res: ServerResponse, body: unknown): void {
  if (body === null) throw new HttpError(404, "not found");
  sendJson(res, 200, body);
}

main();
