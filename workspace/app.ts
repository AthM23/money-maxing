import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "../src/runtime/db.js";
import { ACTIONS } from "./actions.js";
import { assertSameOrigin, HttpError, readJson, sendJson, sendStatic } from "./http.js";
import { modelView } from "./model.js";
import { arAgeing, cashByWeek, closeView, forecastView, revenueView, trialBalance } from "./modules.js";
import { assertAllowed } from "./publicMode.js";
import { afterLedgerMoved, MOVES_THE_LEDGER } from "./ripple.js";
import { caseView, fleetView, overview, workpaperView } from "./views.js";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
export const BRAND = process.env.FOOTNOTE_BRAND ?? "Money Maxer";
const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend");
const SITE = join(FRONTEND, "index.html");
/** Lane C's other self-contained pages, each at a short address. `gate.ts` leaves the same addresses open. */
export const PAGES: Readonly<Record<string, string>> = { "/flow": "flow.html", "/flow.html": "flow.html" };
// The marketing pages carry their own inline style and script. connect-src lets them read this server's own API
// (the pipeline page quotes the live scoreboard) and the fine-tuned reader on the GX10 for the paste-a-document demo.
const SITE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://100.73.102.120:8000; frame-ancestors 'none'";

/**
 * Every request the workspace answers, whoever is listening: `server.ts` on this machine, `vercel.ts` as a hosted
 * read-only copy. One handler, so the read-only rule and the same-origin rule cannot differ between the two.
 */
export async function handle(db: Db, stores: string | null, readOnly: boolean, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET") return get(db, url, res, readOnly);
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

function get(db: Db, url: URL, res: ServerResponse, readOnly: boolean): void {
  if (url.pathname === "/api/overview") return sendJson(res, 200, { ...(overview(db, BRAND) as Record<string, unknown>), read_only: readOnly });
  if (url.pathname === "/api/fleet") return sendJson(res, 200, fleetView(db));
  if (url.pathname === "/api/model") return sendJson(res, 200, modelView());
  if (url.pathname === "/api/modules") return sendJson(res, 200, modules(db, url.searchParams.get("period") ?? ""));
  if (url.pathname === "/api/case") return found(res, caseView(db, url.searchParams.get("intent") ?? ""));
  if (url.pathname === "/api/workpaper") return found(res, workpaperView(db, url.searchParams.get("decision") ?? ""));
  // One address for both: the marketing page at the root, the workspace at /dashboard. Its scripts and styles keep their root paths.
  // `/index.html` too: the pages of `frontend/` link to each other by file name, as they do when opened from the folder.
  if (url.pathname === "/" || url.pathname === "/site" || url.pathname === "/index.html") return site(res);
  const page = PAGES[url.pathname];
  if (page) return existsSync(join(FRONTEND, page)) ? sendPage(res, join(FRONTEND, page)) : found(res, null);
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
  sendPage(res, SITE);
}

/** One self-contained page from `frontend/`: its own inline style and script, nothing from the network. */
function sendPage(res: ServerResponse, file: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": SITE_CSP, "x-content-type-options": "nosniff" });
  res.end(readFileSync(file));
}

/** Only an http(s) address is followed. Anything else is reported once at start-up and ignored. */
export function marketingUrl(): string | null {
  const raw = process.env.MARKETING_URL;
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
}

/** Every bill that is not yet paid, each with who accepted or rejected it. Uploads land here the moment they are filed. */
function billsOnFile(db: Db): { columns: string[]; rows: (string | number | null)[][]; money_columns: number[] } {
  const rows = db.prepare(`SELECT p.name AS vendor, b.vendor_invoice_no AS ref, b.bill_date, b.service_period, b.total_cents, b.status,
        (SELECT r.outcome || ' by ' || r.approver_id FROM bill_review r WHERE r.bill_id = b.id) AS review
      FROM bill b JOIN party p ON p.id = b.party_id WHERE b.status NOT IN ('paid') ORDER BY b.bill_date DESC LIMIT 50`)
    .all() as { vendor: string; ref: string; bill_date: string; service_period: string; total_cents: number; status: string; review: string | null }[];
  return { columns: ["Vendor", "Ref", "Bill date", "Period", "Amount", "Status", "Reviewed"], money_columns: [4],
    rows: rows.map((r) => [r.vendor, r.ref, r.bill_date, r.service_period, r.total_cents, r.status, r.review ?? "waiting"]) };
}

/** Forecast, close, revenue and the standing reports for one month. A month that is not YYYY-MM is refused. */
function modules(db: Db, period: string): unknown {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new HttpError(400, "period must be YYYY-MM");
  const lastDay = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { period, forecast: forecastView(db), close: closeView(db), revenue: revenueView(db),
    reports: { ageing: arAgeing(db, lastDay), trial_balance: trialBalance(db, period), cash_by_week: cashByWeek(db, period), bills: billsOnFile(db) } };
}

function found(res: ServerResponse, body: unknown): void {
  if (body === null) throw new HttpError(404, "not found");
  sendJson(res, 200, body);
}
