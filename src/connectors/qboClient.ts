import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Minimal QuickBooks Online REST client for the sandbox company: OAuth2 refresh, query, create, read, delete,
 * deactivate. No SDK: global `fetch`, injectable for tests. Nothing here has run against Intuit yet (no credentials
 * at the time of writing), so every field name or behaviour taken from memory of the docs is marked UNVERIFIED.
 */

export const QBO_SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_REFRESH_TOKEN_FILE = "data/qbo-refresh-token.txt"; // data/ is gitignored
// UNVERIFIED: 75 is the minor version the task brief names; Intuit retires old ones, so a Fault naming minorversion means bump this.
export const QBO_MINOR_VERSION = "75";

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  realmId: string;
  refreshToken: string;
  baseUrl: string;
}

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;

export interface QboClientOptions {
  fetch?: FetchLike;
  /** Called when Intuit hands back a refresh token different from the one sent. Default: write `data/qbo-refresh-token.txt`. */
  onRefreshToken?: (token: string) => void | Promise<void>;
  /** Injectable so retry tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Id + SyncToken: what QBO needs to address one version of a record for update or delete. */
export interface QboRef { Id: string; SyncToken: string }
export type QboEntity = QboRef & Record<string, unknown>;

const REQUIRED_ENV = ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REALM_ID", "QBO_REFRESH_TOKEN"] as const;

/**
 * Reads the four credentials, throwing ONE error that names every missing variable. Intuit rotates refresh tokens,
 * so the token file written by `saveRefreshTokenToFile` wins over the env var: the env value is only the first token.
 */
export function qboConfigFromEnv(env: Record<string, string | undefined> = process.env, tokenFile: string = QBO_REFRESH_TOKEN_FILE): QboConfig {
  const rotated = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
  const val = (k: (typeof REQUIRED_ENV)[number]): string => (env[k] ?? "").trim();
  const missing = REQUIRED_ENV.filter((k) => val(k) === "" && !(k === "QBO_REFRESH_TOKEN" && rotated !== ""));
  if (missing.length > 0) {
    throw new Error(`QuickBooks is not configured: missing ${missing.join(", ")}. Add them to .env (client id and secret from the Intuit developer app, realm id and refresh token from the OAuth playground).`);
  }
  return {
    clientId: val("QBO_CLIENT_ID"), clientSecret: val("QBO_CLIENT_SECRET"), realmId: val("QBO_REALM_ID"),
    refreshToken: rotated !== "" ? rotated : val("QBO_REFRESH_TOKEN"),
    baseUrl: (env.QBO_BASE_URL ?? "").trim().replace(/\/+$/, "") || QBO_SANDBOX_BASE_URL,
  };
}

export function saveRefreshTokenToFile(token: string, tokenFile: string = QBO_REFRESH_TOKEN_FILE): void {
  mkdirSync(dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, `${token}\n`, "utf8");
}

/** QBO query strings escape a single quote (and a backslash) with a backslash. */
export function qboEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class QboError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
    this.name = "QboError";
  }
}

/** Pulls the human text out of a QBO Fault. Data faults use `Fault.Error[]`; auth faults have been seen lower-cased. */
function faultText(body: unknown): string {
  if (typeof body !== "object" || body === null) return typeof body === "string" ? body.slice(0, 300) : "";
  const b = body as Record<string, unknown>;
  const fault = (b.Fault ?? b.fault) as Record<string, unknown> | undefined; // UNVERIFIED: the lower-case variant on 401s
  if (fault && typeof fault === "object") {
    const errs = (fault.Error ?? fault.error) as Array<Record<string, unknown>> | undefined;
    const parts = (Array.isArray(errs) ? errs : []).map((e) => {
      const msg = String(e.Message ?? e.message ?? ""), detail = String(e.Detail ?? e.detail ?? ""), code = e.code !== undefined ? ` [code ${String(e.code)}]` : "";
      return `${msg}${detail && detail !== msg ? `: ${detail}` : ""}${code}`;
    });
    return `${String(fault.type ?? "Fault")}: ${parts.join("; ")}`;
  }
  if (typeof b.error === "string") return `${b.error}${typeof b.error_description === "string" ? `: ${b.error_description}` : ""}`; // token endpoint shape
  return JSON.stringify(body).slice(0, 300);
}

const MAX_RETRIES = 3;
/** Intuit's limit on the `requestid` query parameter (36 for batch, which this client does not use). */
export const QBO_REQUEST_ID_MAX = 50;

export interface QboWriteOptions {
  /**
   * Intuit's idempotency key, sent as the `requestid` query parameter: a second request with the same value gets the
   * ORIGINAL response back instead of making a second object. It must be unique per company per logical write, so
   * derive it from what the object IS (its natural key), never from a per-run random id. Only a write that carries
   * one is sent again after a 5xx. Semantics are from Intuit's docs and blog, UNVERIFIED against the sandbox: no write
   * was allowed when this was written.
   */
  requestId?: string;
}

function requestIdParam(requestId: string | undefined): string {
  if (requestId === undefined) return "";
  if (requestId === "" || requestId.length > QBO_REQUEST_ID_MAX) throw new Error(`QBO requestid must be 1 to ${QBO_REQUEST_ID_MAX} characters, got ${requestId.length}`);
  return `&requestid=${encodeURIComponent(requestId)}`;
}

/** Id + SyncToken name one version of one record for ever (ids are not reused, the token only grows), so they key the delete or update of it. */
function versionRequestId(entity: string, op: string, ref: QboRef): string {
  return createHash("sha256").update(JSON.stringify([entity.toLowerCase(), op, ref.Id, ref.SyncToken])).digest("hex").slice(0, 40);
}

export class QboClient {
  private readonly fetchFn: FetchLike;
  private readonly onRefreshToken: (token: string) => void | Promise<void>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private refreshToken: string;
  private access: { token: string; expiresAt: number } | undefined;

  constructor(private readonly config: QboConfig, opts: QboClientOptions = {}) {
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.onRefreshToken = opts.onRefreshToken ?? ((t) => saveRefreshTokenToFile(t));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.refreshToken = config.refreshToken;
  }

  /** `select * from Customer where ...` → the matching rows (empty array when none: QBO then omits the entity key). */
  async query<T = QboEntity>(sql: string): Promise<T[]> {
    const body = await this.request("GET", `/query?query=${encodeURIComponent(sql)}&minorversion=${QBO_MINOR_VERSION}`);
    const qr = (body as { QueryResponse?: Record<string, unknown> }).QueryResponse ?? {};
    for (const v of Object.values(qr)) if (Array.isArray(v)) return v as T[];
    return [];
  }

  /** Without `opts.requestId` a create is sent exactly once: a 5xx may mean "created, then the gateway gave up", and sending it again would make a second object. */
  async create<T = QboEntity>(entity: string, payload: Record<string, unknown>, opts: QboWriteOptions = {}): Promise<T> {
    const path = `/${entity.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}${requestIdParam(opts.requestId)}`;
    return this.unwrap<T>(entity, await this.request("POST", path, payload, undefined, opts.requestId !== undefined));
  }

  /** Read by id: the way to get the current SyncToken before a delete or update. */
  async read<T = QboEntity>(entity: string, id: string): Promise<T> {
    return this.unwrap<T>(entity, await this.request("GET", `/${entity.toLowerCase()}/${encodeURIComponent(id)}?minorversion=${QBO_MINOR_VERSION}`));
  }

  /** Hard delete. Transactions only (Invoice, Bill, Payment, ...): name-list entities must be `deactivate`d. */
  async remove(entity: string, ref: QboRef): Promise<void> {
    // UNVERIFIED: delete is a POST to the entity endpoint with ?operation=delete and a body of just {Id, SyncToken}
    // Sent again after a 5xx under a requestid of its own: a replay can at worst earn a Stale Object fault, never a second effect.
    const path = `/${entity.toLowerCase()}?operation=delete&minorversion=${QBO_MINOR_VERSION}${requestIdParam(versionRequestId(entity, "delete", ref))}`;
    await this.request("POST", path, { Id: ref.Id, SyncToken: ref.SyncToken }, undefined, true);
  }

  /** Customer, Vendor, Item cannot be deleted; a sparse update to Active=false hides them and frees nothing but the list. */
  async deactivate<T = QboEntity>(entity: string, ref: QboRef): Promise<T> {
    // UNVERIFIED: sparse update with only Active is accepted for Customer and Vendor; Item may insist on Name/Type being resent
    const path = `/${entity.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}${requestIdParam(versionRequestId(entity, "deactivate", ref))}`;
    return this.unwrap<T>(entity, await this.request("POST", path, { Id: ref.Id, SyncToken: ref.SyncToken, sparse: true, Active: false }, undefined, true));
  }

  /**
   * Attach a TEXT file to an entity: multipart/form-data POST to `/upload` with a JSON part `file_metadata_01`
   * (`{AttachableRef:[{EntityRef:{type,value}}], FileName, ContentType}`) and the bytes in `file_content_01`. The form
   * is built with the global FormData/Blob, then serialised to a string so it travels through the same authenticated
   * `send` as every other call. Text only: a binary file would not survive the string round trip.
   * NEVER sent again after a 5xx: nothing found says `/upload` honours `requestid` (UNVERIFIED), so a replay could attach
   * the file twice. The caller looks the file up by name and tries again on its next pass instead.
   * UNVERIFIED against Intuit (no write was allowed when this was written): part names, and the response shape
   * `{AttachableResponse:[{Attachable:{Id,...}} | {Fault}]}`, are from the Attachable docs.
   */
  async upload<T = QboEntity>(metadata: Record<string, unknown>, file: { name: string; contentType: string; content: string }): Promise<T> {
    const form = new FormData();
    form.append("file_metadata_01", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "attachment.json");
    form.append("file_content_01", new Blob([file.content], { type: file.contentType }), file.name);
    const encoded = new Response(form); // lets the platform pick the boundary and write the part headers
    const contentType = encoded.headers.get("content-type") ?? "multipart/form-data";
    const body = await this.request("POST", `/upload?minorversion=${QBO_MINOR_VERSION}`, undefined, { body: await encoded.text(), contentType });
    const first = ((body as { AttachableResponse?: unknown } | undefined)?.AttachableResponse as Array<Record<string, unknown>> | undefined)?.[0];
    if (first?.Fault !== undefined) throw new QboError(`QBO POST /upload failed: ${faultText(first)}`, 200, body);
    return this.unwrap<T>("Attachable", first);
  }

  /** Responses wrap the record under its capitalised entity name: `{ "Customer": {...}, "time": ... }`. */
  private unwrap<T>(entity: string, body: unknown): T {
    const b = (body ?? {}) as Record<string, unknown>;
    const key = Object.keys(b).find((k) => k.toLowerCase() === entity.toLowerCase());
    const rec = key !== undefined ? b[key] : undefined;
    if (typeof rec !== "object" || rec === null) throw new QboError(`QBO ${entity}: response carried no ${entity} object: ${JSON.stringify(body).slice(0, 200)}`, 200, body);
    return rec as T;
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.access && this.now() < this.access.expiresAt) return this.access.token;
    const sent = this.refreshToken;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const { status, body } = await this.send(QBO_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sent)}`,
    }, true); // a token refresh makes no QuickBooks object, so sending it again is harmless
    const b = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (status < 200 || status >= 300 || typeof b.access_token !== "string") {
      throw new QboError(`QBO token refresh failed (HTTP ${status}): ${faultText(body)}. If this says invalid_grant the refresh token is spent or expired: get a new one from the OAuth playground and delete ${QBO_REFRESH_TOKEN_FILE}.`, status, body);
    }
    const ttlSec = typeof b.expires_in === "number" ? b.expires_in : 3600;
    this.access = { token: b.access_token, expiresAt: this.now() + (ttlSec - 60) * 1000 }; // stop using it 60s early
    if (typeof b.refresh_token === "string" && b.refresh_token !== "" && b.refresh_token !== sent) {
      this.refreshToken = b.refresh_token; // the old one dies soon: persist before doing anything else
      await this.onRefreshToken(b.refresh_token);
    }
    return this.access.token;
  }

  /**
   * `raw` (used by `upload` only) sends an already-encoded body with its own Content-Type instead of a JSON payload.
   * `replaySafe` says a POST may be sent again after a 5xx: true only when its path carries a `requestid`. GETs always may.
   */
  private async request(method: "GET" | "POST", path: string, payload?: Record<string, unknown>, raw?: { body: string; contentType: string }, replaySafe = false): Promise<unknown> {
    const url = `${this.config.baseUrl}/v3/company/${this.config.realmId}${path}`;
    const contentType = raw ? raw.contentType : payload ? "application/json" : undefined;
    const sendBody = raw ? raw.body : payload ? JSON.stringify(payload) : undefined;
    const call = async (token: string) => this.send(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(contentType !== undefined ? { "Content-Type": contentType } : {}) },
      ...(sendBody !== undefined ? { body: sendBody } : {}),
    }, method === "GET" || replaySafe);
    let res = await call(await this.accessToken());
    if (res.status === 401) res = await call(await this.accessToken(true)); // stale or revoked access token: refresh once
    if (res.status < 200 || res.status >= 300) {
      throw new QboError(`QBO ${method} ${path.split("?")[0]} failed (HTTP ${res.status}): ${faultText(res.body)}`, res.status, res.body);
    }
    const fault = (res.body as { Fault?: unknown } | undefined)?.Fault; // belt and braces: a 200 carrying a Fault is still a failure
    if (fault !== undefined) throw new QboError(`QBO ${method} ${path.split("?")[0]} failed: ${faultText(res.body)}`, res.status, res.body);
    return res.body;
  }

  /**
   * One HTTP exchange, retried up to 3 times (0.5s/1s/2s). A 429 is always retried: the request was turned away, not
   * run. A 5xx is retried only when `retry5xx` says a replay cannot make a second object. Returns the last response either way.
   */
  private async send(url: string, init: { method: string; headers: Record<string, string>; body?: string }, retry5xx: boolean): Promise<{ status: number; body: unknown }> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(url, init);
      const text = await res.text();
      if ((res.status === 429 || (res.status >= 500 && retry5xx)) && attempt < MAX_RETRIES) {
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      let body: unknown = text;
      try { body = text === "" ? undefined : JSON.parse(text); } catch { /* HTML error page from a gateway: keep the text */ }
      return { status: res.status, body };
    }
  }
}
