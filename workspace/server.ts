import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flagInt, flagString, parseArgs, warn } from "../src/cli/flags.js";
import { openDb, type Db } from "../src/runtime/db.js";
import { ACTIONS } from "./actions.js";
import { assertSameOrigin, HttpError, readJson, sendJson, sendStatic } from "./http.js";
import { modelView } from "./model.js";
import { arAgeing, cashByWeek, closeView, forecastView, revenueView, trialBalance } from "./modules.js";
import { assertAllowed, listening } from "./publicMode.js";
import { afterLedgerMoved, MOVES_THE_LEDGER, storesFor } from "./ripple.js";
import { caseView, fleetView, overview, workpaperView } from "./views.js";

const USAGE = "usage: pnpm workspace <db> [--port 4320] [--stores <dir>]";
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
const BRAND = process.env.FOOTNOTE_BRAND ?? "Money Maxer";
const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend", "index.html");
// The marketing page is one self-contained file with its own inline style and script, and nothing from the network.
const SITE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";

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

async function handle(db: Db, stores: string | null, readOnly: boolean, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET") return get(db, url, res);
    if (req.method === "POST" && url.pathname.startsWith("/api/do/")) {
      assertSameOrigin(req);
      const action = ACTIONS[url.pathname.slice("/api/do/".length)];
      if (!action) throw new HttpError(404, "no such action");
      const name = url.pathname.slice("/api/do/".length);
      const body = await readJson(req);
      assertAllowed(name, body, readOnly);
      const result = await action(db, body);
      // The entry is in; now the other books react to it. Their outcome rides along, it never replaces the action's.
      const other_books = MOVES_THE_LEDGER.has(name) ? await afterLedgerMoved(db, stores) : undefined;
      return sendJson(res, 200, other_books && typeof result === "object" && result !== null ? { ...result, other_books } : result);
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
  if (url.pathname === "/api/model") return sendJson(res, 200, modelView());
  if (url.pathname === "/api/modules") return sendJson(res, 200, modules(db, url.searchParams.get("period") ?? ""));
  if (url.pathname === "/api/case") return found(res, caseView(db, url.searchParams.get("intent") ?? ""));
  if (url.pathname === "/api/workpaper") return found(res, workpaperView(db, url.searchParams.get("decision") ?? ""));
  // One address for both: the marketing page at the root, the workspace at /dashboard. Its scripts and styles keep their root paths.
  if (url.pathname === "/" || url.pathname === "/site") return site(res);
  if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") return sendStatic(res, PUBLIC, "/index.html");
  if (url.pathname.startsWith("/api/")) throw new HttpError(404, "not found");
  sendStatic(res, PUBLIC, url.pathname);
}

/** The root, and where the logo leads: the marketing page. Deployed elsewhere, that is MARKETING_URL; here it is the file in `frontend/`. */
function site(res: ServerResponse): void {
  const elsewhere = marketingUrl();
  const location = elsewhere ?? (existsSync(SITE) ? null : "/dashboard");
  if (location) {
    res.writeHead(302, { location });
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": SITE_CSP, "x-content-type-options": "nosniff" });
  res.end(readFileSync(SITE));
}

/** Only an http(s) address is followed. Anything else is reported once at start-up and ignored. */
function marketingUrl(): string | null {
  const raw = process.env.MARKETING_URL;
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
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
