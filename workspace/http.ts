import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

const MAX_BODY_BYTES = 64 * 1024;
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

/** A file from the public folder and nowhere else: the path is normalised and must stay inside the root. */
export function sendStatic(res: ServerResponse, root: string, urlPath: string): void {
  const relative = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, relative);
  const type = TYPES[extname(file)];
  if (!file.startsWith(root) || !type) return sendJson(res, 404, { error: "not found" });
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

/** A JSON body of bounded size. Anything else is the caller's mistake and is said so plainly. */
export function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return reject(new HttpError(415, "send application/json"));
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new HttpError(413, "request body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new HttpError(400, "the body is not JSON")); }
    });
    req.on("error", () => reject(new HttpError(400, "could not read the request")));
  });
}

/**
 * The workspace posts entries and records approvals, so a page on another origin must not be able to drive it through
 * the visitor's browser. A write has to come from this server's own page: same Origin as Host.
 */
export function assertSameOrigin(req: IncomingMessage): void {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) throw new HttpError(403, "writes are accepted from the workspace page only");
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, "bad Origin header"); }
  if (originHost !== host) throw new HttpError(403, "writes are accepted from the workspace page only");
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
