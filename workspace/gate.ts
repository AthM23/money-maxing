import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * A password in front of the workspace, for a copy that is on the internet. The marketing page stays open; the
 * dashboard, its files and every `/api/` address ask for the password once and then remember the browser for thirty
 * days. The cookie is a keyed hash of the password, never the password: it cannot be read back, and changing the
 * password signs everyone out. This keeps a link from being wandered into; it is not an account system.
 *
 *   DASHBOARD_PASSWORD=... pnpm workspace <db>      optional on this machine, required by the hosted copy
 */
const COOKIE = "mm_dashboard";
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const MAX_FORM_BYTES = 4 * 1024;
// The marketing page, the logo it shows, and the other self-contained pages of `frontend/` (`PAGES` in app.ts).
const OPEN: ReadonlySet<string> = new Set(["/", "/site", "/logo.svg", "/flow", "/flow.html"]);
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'";

function pass(password: string): string {
  return createHmac("sha256", password).update("money-maxer dashboard").digest("hex");
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasPass(req: IncomingMessage, password: string): boolean {
  const cookies = (req.headers.cookie ?? "").split(";").map((c) => c.trim().split("="));
  const held = cookies.find(([name]) => name === COOKIE)?.[1];
  return held !== undefined && same(held, pass(password));
}

/**
 * True when the request has been answered here (the form, a refusal, or the sign-in itself) and must go no further.
 * False when it may pass: an open address, or a browser that has already signed in.
 */
export async function gate(password: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/login" && req.method === "POST") return signIn(password, req, res);
  if (OPEN.has(url.pathname) || hasPass(req, password)) return false;
  if (url.pathname.startsWith("/api/")) {
    send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Sign in at /dashboard first." }));
    return true;
  }
  send(res, 401, "text/html; charset=utf-8", page(false));
  return true;
}

async function signIn(password: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const given = new URLSearchParams(await readForm(req)).get("password") ?? "";
  if (!same(pass(given), pass(password))) {
    send(res, 401, "text/html; charset=utf-8", page(true));
    return true;
  }
  // Secure only over TLS: on this machine the workspace is plain http, and a Secure cookie would never come back.
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.writeHead(303, { location: "/dashboard", "cache-control": "no-store", "set-cookie": `${COOKIE}=${pass(password)}; Path=/; Max-Age=${THIRTY_DAYS_S}; HttpOnly; SameSite=Lax${secure}` });
  res.end();
  return true;
}

function readForm(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_FORM_BYTES) chunks.push(chunk);
    });
    req.on("end", () => resolve(size <= MAX_FORM_BYTES ? Buffer.concat(chunks).toString("utf8") : ""));
    req.on("error", () => resolve(""));
  });
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": PAGE_CSP });
  res.end(body);
}

/** The sign-in page: one file, the workspace's own ink, paper and lime, nothing from the network but the logo. */
function page(wrong: boolean): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Money Maxer</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: grid; place-items: center; padding: 22px; background: #dededa; color: #101012; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  main { width: 100%; max-width: 400px; background: #fff; border-radius: 32px; padding: 34px 34px 30px; box-shadow: 0 30px 80px rgba(0, 0, 0, .08); }
  .logo { display: flex; align-items: center; gap: 11px; font-weight: 800; font-size: 19.5px; letter-spacing: -.035em; margin-bottom: 26px; } .logo img { border-radius: 10px; }
  h1 { font-size: 25px; font-weight: 600; letter-spacing: -.025em; line-height: 1.2; }
  p { color: #6b6b66; margin: 6px 0 22px; }
  label { display: block; font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #9a9a94; margin-bottom: 8px; }
  input { width: 100%; font: inherit; color: inherit; background: #f6f6f3; border: 1px solid #ecece8; border-radius: 14px; padding: 13px 16px; outline: none; }
  input:focus { border-color: #101012; background: #fff; }
  .error { color: #b3362d; font-size: 13.5px; margin-top: 10px; }
  button { width: 100%; margin-top: 18px; border: 0; cursor: pointer; font: 600 14.5px inherit; border-radius: 999px; padding: 14px 22px; background: #101012; color: #fff; transition: transform .15s, box-shadow .15s; }
  button:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0, 0, 0, .14); }
  a { display: block; text-align: center; margin-top: 18px; color: #6b6b66; font-size: 13.5px; text-decoration: none; } a:hover { color: #101012; }
</style></head>
<body><main>
  <div class="logo"><img src="/logo.svg" width="34" height="34" alt="">Money Maxer</div>
  <h1>The dashboard is for the team and its guests</h1>
  <p>Enter the password once. This browser is remembered for thirty days.</p>
  <form method="post" action="/login">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    ${wrong ? '<div class="error" role="alert">That is not the password.</div>' : ""}
    <button type="submit">Open the dashboard</button>
  </form>
  <a href="/">← Back to the site</a>
</main></body></html>`;
}
