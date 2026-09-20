/**
 * Gmail: the live read connector and the seeder that backdates the world's mail into a real mailbox.
 *
 * Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (no SDK: plain `fetch` against the REST API).
 * OAuth scopes the refresh token must carry:
 *   - https://www.googleapis.com/auth/gmail.readonly  pull(): messages.list, messages.get, labels.list
 *   - https://www.googleapis.com/auth/gmail.insert    seedGmail(): messages.insert with internalDateSource=dateHeader
 *   - https://www.googleapis.com/auth/gmail.labels    seedGmail() only when the label does not exist yet (labels.create);
 *                                                     create the label by hand in the Gmail UI to avoid this scope
 *   - https://www.googleapis.com/auth/gmail.modify    seedGmail({ reset: true }) only: messages.trash
 *
 * Seeded mail carries `Message-ID: <fn:<world id>@northwind.test>` and `X-Footnote-Thread: <world thread id>`, so a
 * pull of the live mailbox yields the same external_id and thread_id as the local store built from the world file.
 */
import type { World, WorldMail } from "../seed/world.js";
import type { Connector, MailPayload, RawItem } from "./types.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEED_DOMAIN = "northwind.test";
const THREAD_HEADER = "X-Footnote-Thread";
/**
 * Verified live 2026-09-19: messages.insert REPLACES a `Message-ID: <fn:...>` with one of Gmail's own, so the
 * Message-ID cannot carry the world id. Custom X- headers are kept verbatim; this one is the id of record.
 */
const ID_HEADER = "X-Footnote-Id";
export const GMAIL_ENV_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const;
export const DEFAULT_GMAIL_LABEL = "footnote";

/** The slice of `fetch` this module uses, so a test can stand in for Google. The global `fetch` satisfies it. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
type Env = Record<string, string | undefined>;

export interface GmailCreds { clientId: string; clientSecret: string; refreshToken: string }
export interface GmailClientOptions { creds?: GmailCreds; env?: Env; fetch?: FetchLike; now?: () => number }

/** One error naming every missing variable, so `.env` is fixed in one pass. */
export function gmailCredsFromEnv(env: Env = process.env): GmailCreds {
  const missing = GMAIL_ENV_VARS.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Gmail is not configured: missing env ${missing.join(", ")} (OAuth client + refresh token with scopes gmail.readonly and gmail.insert)`);
  return { clientId: env.GMAIL_CLIENT_ID!.trim(), clientSecret: env.GMAIL_CLIENT_SECRET!.trim(), refreshToken: env.GMAIL_REFRESH_TOKEN!.trim() };
}

export class GmailApiError extends Error {
  constructor(readonly status: number, readonly method: string, readonly path: string, body: string) {
    super(`Gmail ${method} ${path} failed: HTTP ${status} ${body.slice(0, 300)}`);
  }
}

/** Authenticated REST calls. The access token is cached until a minute before expiry and refreshed once on a 401. */
class GmailApi {
  private token: { value: string; expiresAt: number } | undefined;
  private readonly creds: GmailCreds;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;

  constructor(opts: GmailClientOptions = {}) {
    this.creds = opts.creds ?? gmailCredsFromEnv(opts.env);
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.now = opts.now ?? Date.now;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value;
    const body = new URLSearchParams({ grant_type: "refresh_token", client_id: this.creds.clientId, client_secret: this.creds.clientSecret, refresh_token: this.creds.refreshToken }).toString();
    const res = await this.fetchFn(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gmail token refresh failed: HTTP ${res.status} ${text.slice(0, 300)} (is GMAIL_REFRESH_TOKEN revoked, or issued to a different client?)`);
    const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("Gmail token refresh returned no access_token");
    this.token = { value: json.access_token, expiresAt: this.now() + Math.max(0, (json.expires_in ?? 3600) - 60) * 1000 };
    return this.token.value;
  }

  async request<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(opts.query ?? {}).filter((e): e is [string, string] => e[1] !== undefined)).toString();
    const url = `${API}${path}${qs ? `?${qs}` : ""}`;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { authorization: `Bearer ${await this.accessToken()}` };
      if (opts.body !== undefined) headers["content-type"] = "application/json";
      const res = await this.fetchFn(url, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
      const text = await res.text();
      if (res.status === 401 && attempt === 0) { this.token = undefined; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
      if (!res.ok) throw new GmailApiError(res.status, method, path, text);
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  /** Every message id matching `q`, following nextPageToken. Trash and spam are excluded by Gmail's default. */
  async listIds(q: string, pageSize = 100): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.request<{ messages?: { id: string }[]; nextPageToken?: string }>("GET", "/messages", { query: { q, maxResults: String(pageSize), pageToken } });
      for (const m of page.messages ?? []) ids.push(m.id);
      pageToken = page.nextPageToken || undefined;
    } while (pageToken);
    return ids;
  }
}

// ---------------------------------------------------------------- read side

interface GmailHeader { name: string; value: string }
export interface GmailPart { mimeType?: string; filename?: string; headers?: GmailHeader[]; body?: { data?: string; size?: number }; parts?: GmailPart[] }
export interface GmailMessage { id: string; threadId?: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart }

export interface GmailConnectorOptions extends GmailClientOptions {
  /** Gmail search query. Default SEEDED_MAIL_QUERY: anything to or from the seeded company domain. */
  query?: string;
  /** messages.get calls in flight at once. */
  concurrency?: number;
}

export class GmailConnector implements Connector {
  readonly name = "gmail";
  private readonly api: GmailApi;
  private readonly query: string;
  private readonly concurrency: number;

  /** Throws at construction when credentials are missing, so a misconfigured run dies before it pulls anything. */
  constructor(opts: GmailConnectorOptions = {}) {
    this.api = new GmailApi(opts);
    this.query = opts.query ?? SEEDED_MAIL_QUERY;
    this.concurrency = Math.max(1, opts.concurrency ?? 8);
  }

  async pull(): Promise<RawItem[]> {
    const ids = await this.api.listIds(this.query);
    const items: RawItem[] = [];
    for (let i = 0; i < ids.length; i += this.concurrency) {
      const batch = await Promise.all(ids.slice(i, i + this.concurrency).map((id) => this.api.request<GmailMessage>("GET", `/messages/${id}`, { query: { format: "full" } })));
      for (const msg of batch) items.push(gmailToRawItem(msg));
    }
    return dedupeCopies(items).sort((a, b) => (a.event_time === b.event_time ? a.external_id.localeCompare(b.external_id) : a.event_time < b.event_time ? -1 : 1));
  }
}

/** One Gmail API message (format=full) as the RawItem ingestion expects. Pure, so it is tested without a network. */
export function gmailToRawItem(msg: GmailMessage): RawItem {
  const h = (name: string): string => decodeEncodedWords(header(msg.payload, name) ?? "");
  const from = addresses(h("From"))[0] ?? "";
  const to = addresses(h("To"));
  const cc = addresses(h("Cc"));
  const when = isoSeconds(h("Date"), msg.internalDate);
  const payload: MailPayload = { thread_id: h(THREAD_HEADER).trim() || msg.threadId || msg.id, from, to, cc, subject: h("Subject"), date: when, body: bodyText(msg.payload) };
  return {
    source: "gmail", kind: "email", external_id: h(ID_HEADER).trim() || worldIdFromMessageId(h("Message-ID")) || msg.id,
    event_time: when, recorded_time: when, payload: { ...payload },
    party_hint: { emails: [...new Set([from, ...to, ...cc].filter(Boolean))] },
  };
}

/** Same sender, same second, same subject: the same mail. */
const contentKey = (from: string, when: string, subject: string): string => `${when}|${from.toLowerCase()}|${subject}`;

/**
 * A mailbox can hold copies of one mail (a seed run before ID_HEADER existed left some). One survives: the copy
 * that knows its world id if there is one, else the lowest Gmail id, so the choice is stable across pulls.
 */
function dedupeCopies(items: RawItem[]): RawItem[] {
  const best = new Map<string, RawItem>();
  for (const item of [...items].sort((a, b) => a.external_id.localeCompare(b.external_id))) {
    const p = item.payload as unknown as MailPayload;
    const key = contentKey(p.from, p.date, p.subject);
    const kept = best.get(key);
    const hasWorldId = (i: RawItem): boolean => !/^[0-9a-f]{16}$/.test(i.external_id);
    if (!kept || (!hasWorldId(kept) && hasWorldId(item))) best.set(key, item);
  }
  return [...best.values()];
}

/** `<fn:m-initech-2@northwind.test>` -> `m-initech-2`. Anything else is not ours. */
export function worldIdFromMessageId(messageId: string): string | undefined {
  return /^\s*<fn:([^@>\s]+)@/.exec(messageId)?.[1];
}

function header(part: GmailPart | undefined, name: string): string | undefined {
  const want = name.toLowerCase(); // Gmail returns headers as sent: `Message-ID`, `Message-Id` and `Message-id` all occur
  return part?.headers?.find((x) => x.name.toLowerCase() === want)?.value;
}

/** Bare lower-cased addresses out of `"Reyes, Dana" <dana@x.test>, ap@y.test`. Commas inside quotes do not split. */
export function addresses(value: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of `${value},`) {
    if (ch === "\"") quoted = !quoted;
    if (ch !== "," || quoted) { cur += ch; continue; }
    const addr = (/<([^<>\s]+@[^<>\s]+)>/.exec(cur)?.[1] ?? /[^\s<>"(),;:]+@[^\s<>"(),;:]+/.exec(cur)?.[0])?.toLowerCase();
    if (addr) out.push(addr);
    cur = "";
  }
  return out;
}

/** The `Date` header as `YYYY-MM-DDTHH:MM:SSZ`; when it is absent or unparseable, Gmail's internalDate (epoch ms). */
export function isoSeconds(dateHeader: string, internalDateMs?: string): string {
  let t = Date.parse(dateHeader.replace(/\s*\([^)]*\)/g, "").trim()); // drop trailing comments such as "(UTC)"
  if (Number.isNaN(t)) t = Number(internalDateMs);
  if (!Number.isFinite(t)) throw new Error(`Gmail message has neither a parseable Date header ("${dateHeader}") nor an internalDate`);
  return `${new Date(t).toISOString().slice(0, 19)}Z`;
}

/** First text/plain leaf, depth first, skipping attachments; otherwise the first text/html leaf with the markup stripped. */
function bodyText(root: GmailPart | undefined): string {
  const plain = findPart(root, "text/plain");
  if (plain) return tidy(decodePart(plain));
  const html = findPart(root, "text/html");
  return html ? tidy(stripHtml(decodePart(html))) : "";
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType?.toLowerCase() === mime && !part.filename && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mime);
    if (hit) return hit;
  }
  return undefined;
}

function decodePart(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url"); // Gmail has already undone the Content-Transfer-Encoding
  const charset = /charset="?([^";\s]+)"?/i.exec(header(part, "Content-Type") ?? "")?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(bytes); } catch { return bytes.toString("utf8"); }
}

const tidy = (s: string): string => s.replace(/\r\n?/g, "\n").replace(/\n+$/, "");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function stripHtml(html: string): string {
  return html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** RFC 2047 `=?UTF-8?B?...?=` / `?Q?`. */
// UNVERIFIED: the Gmail API appears to return header values still encoded; decoding an already-decoded value is a no-op.
function decodeEncodedWords(value: string): string {
  return value.replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, "$1").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (whole, charset: string, enc: string, data: string) => {
    try {
      const bytes = enc.toLowerCase() === "b" ? Buffer.from(data, "base64")
        : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_, x: string) => String.fromCharCode(parseInt(x, 16))), "latin1");
      return new TextDecoder(charset).decode(bytes);
    } catch { return whole; }
  });
}

// ---------------------------------------------------------------- seed side

export interface SeedGmailOptions extends GmailClientOptions {
  /** Label every seeded message is filed under, and the default pull query reads. Found or created. */
  label?: string;
  /** Trash what is under the label first. Needs gmail.modify; without it the seeder says so and carries on. */
  reset?: boolean;
  log?: (line: string) => void;
}
export interface SeedGmailResult { inserted: number; skipped: number; trashed: number; label_id: string | null }

/**
 * Every seeded message has a northwind.test address on it, so this finds the seeded mailbox with or without the
 * label. Verified live 2026-09-19: a token with gmail.readonly + gmail.insert cannot create labels (HTTP 403).
 */
export const SEEDED_MAIL_QUERY = `from:${SEED_DOMAIN} OR to:${SEED_DOMAIN} OR cc:${SEED_DOMAIN}`;

export const seedMessageId = (worldId: string): string => `<fn:${worldId}@${SEED_DOMAIN}>`;

/**
 * Inserts every `world.mail` into the mailbox, backdated to the world's own clock. Safe to re-run: a message whose
 * Message-ID is already in the mailbox is skipped, so a second run inserts nothing.
 */
export async function seedGmail(world: World, opts: SeedGmailOptions = {}): Promise<SeedGmailResult> {
  const api = new GmailApi(opts);
  const log = opts.log ?? ((line: string) => void process.stderr.write(`${line}\n`));
  const labelName = opts.label ?? DEFAULT_GMAIL_LABEL;
  const labelId = await findOrCreateLabel(api, labelName, log);

  let trashed = 0;
  if (opts.reset) {
    for (const id of await api.listIds(SEEDED_MAIL_QUERY)) {
      try {
        await api.request("POST", `/messages/${id}/trash`);
        trashed++;
      } catch (err) {
        if (!(err instanceof GmailApiError) || err.status !== 403) throw err;
        log(`gmail reset skipped: messages.trash was refused (HTTP 403). A reset needs the gmail.modify scope; existing seeded mail is left in place and not duplicated.`);
        break;
      }
    }
  }

  // Already there, by world id. Two checks: what sits under the label, then a Message-ID search per remaining message
  // (which also finds mail whose label someone removed).
  const present = new Set<string>();
  const presentContent = new Set<string>(); // copies inserted before ID_HEADER existed are recognised by content
  for (const id of await api.listIds(SEEDED_MAIL_QUERY)) {
    const item = gmailToRawItem(await api.request<GmailMessage>("GET", `/messages/${id}`, { query: { format: "metadata" } }));
    const p = item.payload as unknown as MailPayload;
    present.add(item.external_id);
    presentContent.add(contentKey(p.from, p.date, p.subject));
  }

  let inserted = 0, skipped = 0;
  const threads = new Map<string, string[]>(); // world thread id -> Message-IDs so far, oldest first
  for (const mail of [...world.mail].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))) {
    const earlier = threads.get(mail.thread_id) ?? [];
    threads.set(mail.thread_id, [...earlier, seedMessageId(mail.id)]);
    // UNVERIFIED: that Gmail's `rfc822msgid:` operator accepts the angle brackets and the colon inside `<fn:...>`.
    // If it does not, the label scan above still makes a re-run idempotent as long as the label stays on the mail.
    if (present.has(mail.id) || presentContent.has(contentKey(mail.from, isoSeconds(mail.date), mail.subject)) || (await api.listIds(`rfc822msgid:${seedMessageId(mail.id)}`, 1)).length > 0) { skipped++; continue; }
    // UNVERIFIED: that gmail.insert alone may set labelIds on insert, and that insert keeps our Message-ID header verbatim.
    await api.request("POST", "/messages", { query: { internalDateSource: "dateHeader" }, body: { raw: Buffer.from(rfc822(mail, earlier), "utf8").toString("base64url"), ...(labelId ? { labelIds: [labelId] } : {}) } }).catch((err: unknown) => {
      throw err instanceof GmailApiError && err.status === 403 ? new Error(`${err.message}\nmessages.insert needs the gmail.insert (or gmail.modify) scope: re-run OAuth consent and update GMAIL_REFRESH_TOKEN`) : err;
    });
    inserted++;
  }
  return { inserted, skipped, trashed, label_id: labelId };
}

async function findOrCreateLabel(api: GmailApi, name: string, log: (line: string) => void): Promise<string | null> {
  const { labels } = await api.request<{ labels?: { id: string; name: string }[] }>("GET", "/labels");
  const found = labels?.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  try {
    // UNVERIFIED: labels.create is documented under gmail.labels / gmail.modify, not gmail.insert.
    return (await api.request<{ id: string }>("POST", "/labels", { body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } })).id;
  } catch (err) {
    if (!(err instanceof GmailApiError) || err.status !== 403) throw err;
    log(`gmail: label "${name}" could not be created with this token (needs gmail.labels or gmail.modify); seeding without a label`);
    return null;
  }
}

/** The world mail as an RFC 822 message. `earlier` are the Message-IDs already sent on the same thread. */
export function rfc822(mail: WorldMail, earlier: string[] = []): string {
  const lines = [
    `From: ${mail.from}`,
    `To: ${mail.to.join(", ")}`,
    ...(mail.cc.length ? [`Cc: ${mail.cc.join(", ")}`] : []),
    `Subject: ${encodeWord(mail.subject)}`,
    `Date: ${new Date(mail.date).toUTCString().replace(/GMT$/, "+0000")}`,
    `Message-ID: ${seedMessageId(mail.id)}`,
    ...(earlier.length ? [`In-Reply-To: ${earlier[earlier.length - 1]}`, `References: ${earlier.join(" ")}`] : []),
    `${THREAD_HEADER}: ${mail.thread_id}`,
    `${ID_HEADER}: ${mail.id}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "Content-Transfer-Encoding: base64",
    "",
    ...(Buffer.from(mail.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").match(/.{1,76}/g) ?? []),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

const encodeWord = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
