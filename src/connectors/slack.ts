/**
 * Slack: the live read connector, the seeder that posts the world's chat into a real workspace, and the map from the
 * world's placeholder user ids to real workspace users.
 *
 * Env: SLACK_BOT_TOKEN (xoxb). Bot token scopes:
 *   - channels:read      conversations.list                       (pull, seed)
 *   - channels:history   conversations.history                    (pull, seed's idempotency read)
 *   - channels:join      conversations.join                       (seed; pull joins a public channel it is not yet in)
 *   - channels:manage    conversations.create                     (seed, only for channels that do not exist)
 *   - chat:write         chat.postMessage, with message metadata  (seed)
 *   - users:read         users.list                               (pull: user_name)
 *   - users:read.email   profile.email in users.list              (slackUserMap)
 * Public channels only. Private ones would need groups:read / groups:history and an invite, which a bot cannot give itself.
 *
 * Slack cannot backdate a message and a bot cannot post as a user, so a seeded message carries the world's id, clock and
 * speaker in message `metadata` (never in visible text) and the reader prefers that over Slack's own ts and user.
 */
import { WebClient } from "@slack/web-api";
import type { World } from "../seed/world.js";
import type { ChatPayload, Connector, RawItem } from "./types.js";

export const DEFAULT_SLACK_CHANNELS = ["finance", "deals", "cs-escalations"] as const;
export const SEED_EVENT_TYPE = "footnote_seed";
/** Housekeeping subtypes that are not something a person said. */
const SKIP_SUBTYPES = new Set(["channel_join", "channel_leave", "bot_add", "bot_remove", "channel_topic", "channel_purpose", "channel_name", "channel_archive", "channel_unarchive", "channel_convert_to_private", "channel_convert_to_public", "pinned_item", "unpinned_item"]);

type Env = Record<string, string | undefined>;
interface Paged { response_metadata?: { next_cursor?: string } }
export interface SlackChannel { id?: string; name?: string; is_member?: boolean; is_archived?: boolean }
export interface SlackMessage { type?: string; subtype?: string; ts?: string; user?: string; bot_id?: string; username?: string; text?: string; metadata?: { event_type?: string; event_payload?: unknown } }
export interface SlackUser { id?: string; name?: string; real_name?: string; deleted?: boolean; is_bot?: boolean; profile?: { email?: string; display_name?: string; real_name?: string } }
export interface SeedMetadata { event_type: string; event_payload: { world_id: string; ts: string; user: string; user_name: string } }

/** The six Web API methods this module uses. `WebClient` satisfies it; tests pass an in-memory fake. */
export interface SlackClient {
  conversations: {
    list(args: { cursor?: string; limit?: number; types?: string; exclude_archived?: boolean }): Promise<Paged & { channels?: SlackChannel[] }>;
    history(args: { channel: string; cursor?: string; limit?: number; include_all_metadata?: boolean }): Promise<Paged & { messages?: SlackMessage[]; has_more?: boolean }>;
    join(args: { channel: string }): Promise<unknown>;
    create(args: { name: string; is_private?: boolean }): Promise<{ channel?: SlackChannel }>;
  };
  users: { list(args: { cursor?: string; limit?: number }): Promise<Paged & { members?: SlackUser[] }> };
  chat: { postMessage(args: { channel: string; text: string; metadata?: SeedMetadata; unfurl_links?: boolean; unfurl_media?: boolean }): Promise<{ ts?: string }> };
}

/** A real client from SLACK_BOT_TOKEN. WebClient already retries on HTTP 429 using Slack's Retry-After. */
export function slackClientFromEnv(env: Env = process.env): SlackClient {
  const missing = (["SLACK_BOT_TOKEN"] as const).filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Slack is not configured: missing env ${missing.join(", ")} (bot token, xoxb-..., with scopes channels:read, channels:history, channels:join, channels:manage, chat:write, users:read, users:read.email)`);
  return new WebClient(env.SLACK_BOT_TOKEN!.trim());
}

async function paged<P extends Paged, T>(call: (cursor: string | undefined) => Promise<P>, pick: (page: P) => T[] | undefined): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await call(cursor);
    out.push(...(pick(page) ?? []));
    cursor = page.response_metadata?.next_cursor || undefined; // Slack ends pagination with an empty string
  } while (cursor);
  return out;
}

const listChannels = (client: SlackClient): Promise<SlackChannel[]> =>
  paged((cursor) => client.conversations.list({ types: "public_channel", exclude_archived: true, limit: 200, ...(cursor ? { cursor } : {}) }), (p) => p.channels);
const listUsers = (client: SlackClient): Promise<SlackUser[]> => paged((cursor) => client.users.list({ limit: 200, ...(cursor ? { cursor } : {}) }), (p) => p.members);
const readHistory = (client: SlackClient, channel: string, pageSize: number): Promise<SlackMessage[]> =>
  paged((cursor) => client.conversations.history({ channel, limit: pageSize, include_all_metadata: true, ...(cursor ? { cursor } : {}) }), (p) => p.messages);

// ---------------------------------------------------------------- read side

export interface SlackConnectorOptions {
  client?: SlackClient;
  env?: Env;
  /** Channel names, with or without `#`. Default finance, deals, cs-escalations. */
  channels?: readonly string[];
  /** conversations.history page size. */
  pageSize?: number;
  log?: (line: string) => void;
}

export class SlackConnector implements Connector {
  readonly name = "slack";
  private readonly client: SlackClient;
  private readonly channels: string[];
  private readonly pageSize: number;
  private readonly log: (line: string) => void;

  /** Throws at construction when SLACK_BOT_TOKEN is missing and no client was injected. */
  constructor(opts: SlackConnectorOptions = {}) {
    this.client = opts.client ?? slackClientFromEnv(opts.env);
    this.channels = (opts.channels ?? DEFAULT_SLACK_CHANNELS).map(channelName);
    this.pageSize = opts.pageSize ?? 200;
    this.log = opts.log ?? stderr;
  }

  async pull(): Promise<RawItem[]> {
    const byName = new Map((await listChannels(this.client)).map((c) => [c.name ?? "", c]));
    const names = new Map((await listUsers(this.client)).filter((u) => u.id).map((u) => [u.id!, displayName(u)]));
    const items: RawItem[] = [];
    for (const name of this.channels) {
      const channel = byName.get(name);
      if (!channel?.id) { this.log(`slack: channel #${name} not found (or not visible to the bot); skipped`); continue; }
      if (channel.is_member === false) {
        // UNVERIFIED: a bot token reading a public channel it has not joined gets `not_in_channel`; joining first avoids it.
        await this.client.conversations.join({ channel: channel.id }).catch((err: unknown) => this.log(`slack: could not join #${name}: ${errText(err)}`));
      }
      for (const msg of await readHistory(this.client, channel.id, this.pageSize)) {
        const item = slackToRawItem(msg, { id: channel.id, name }, names);
        if (item) items.push(item);
      }
    }
    return items.sort((a, b) => (a.event_time === b.event_time ? a.external_id.localeCompare(b.external_id) : a.event_time < b.event_time ? -1 : 1));
  }
}

/** One history message as a RawItem, or undefined for housekeeping. Pure, so it is tested without a workspace. */
export function slackToRawItem(msg: SlackMessage, channel: { id: string; name: string }, userNames: ReadonlyMap<string, string> = new Map()): RawItem | undefined {
  if (!msg.ts || (msg.subtype && SKIP_SUBTYPES.has(msg.subtype))) return undefined;
  const seed = seedPayload(msg);
  const raw = unescapeText(msg.text ?? "");
  const text = seed && raw.startsWith(speakerPrefix(seed.user_name)) ? raw.slice(speakerPrefix(seed.user_name).length) : raw;
  const when = seed?.ts ?? slackTsToIso(msg.ts);
  const user = seed?.user ?? msg.user ?? msg.bot_id ?? "";
  const userName = seed?.user_name ?? userNames.get(user) ?? msg.username;
  const payload: ChatPayload = { channel: channel.name, user, ...(userName ? { user_name: userName } : {}), ts: when, text };
  return {
    source: "slack", kind: "chat_message", external_id: seed?.world_id ?? `${channel.id}:${msg.ts}`,
    event_time: when, recorded_time: when, payload: { ...payload }, party_hint: { text },
  };
}

/** The world's id, clock and speaker when this is a message the seeder posted; undefined for anything else. */
function seedPayload(msg: SlackMessage): SeedMetadata["event_payload"] | undefined {
  // UNVERIFIED: that metadata posted by a bot with chat:write alone round-trips through conversations.history with
  // include_all_metadata=true, without a metadata.message:read scope or an app-manifest metadata subscription.
  if (msg.metadata?.event_type !== SEED_EVENT_TYPE) return undefined;
  const p = msg.metadata.event_payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p.world_id !== "string" || !p.world_id || typeof p.ts !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.ts)) return undefined;
  return { world_id: p.world_id, ts: p.ts, user: typeof p.user === "string" ? p.user : "", user_name: typeof p.user_name === "string" ? p.user_name : "" };
}

/** Slack's `1751378400.000200` (epoch seconds, microsecond counter) as `YYYY-MM-DDTHH:MM:SSZ`. */
export function slackTsToIso(ts: string): string {
  const seconds = Number(ts.split(".")[0]);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`not a Slack ts: "${ts}"`);
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`;
}

const channelName = (name: string): string => name.replace(/^#/, "").toLowerCase();
const displayName = (u: SlackUser): string => u.real_name || u.profile?.real_name || u.profile?.display_name || u.name || u.id || "";
const speakerPrefix = (name: string): string => `*${name}:* `;
/** Slack escapes exactly these three in message text, both ways. */
const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeText = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const stderr = (line: string): void => void process.stderr.write(`${line}\n`);
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------- seed side

export interface SeedSlackOptions { client?: SlackClient; env?: Env; pageSize?: number; log?: (line: string) => void }
export interface SeedSlackResult { channels_created: number; channels_joined: number; posted: number; skipped: number; channel_ids: Record<string, string> }

/**
 * Finds or creates every channel in `world.chat`, joins it, and posts each message once, oldest first, as the bot with
 * the speaker's name in bold. Safe to re-run: world ids already in a channel's history (by metadata) are skipped.
 */
export async function seedSlack(world: World, opts: SeedSlackOptions = {}): Promise<SeedSlackResult> {
  const client = opts.client ?? slackClientFromEnv(opts.env);
  const people = new Map(world.people.map((p) => [p.id, p.name]));
  const existing = new Map((await listChannels(client)).map((c) => [c.name ?? "", c]));
  const result: SeedSlackResult = { channels_created: 0, channels_joined: 0, posted: 0, skipped: 0, channel_ids: {} };

  const present = new Set<string>();
  for (const name of [...new Set(world.chat.map((m) => channelName(m.channel)))]) {
    let channel = existing.get(name);
    if (!channel?.id) {
      channel = (await client.conversations.create({ name, is_private: false })).channel; // the creator is a member already
      if (!channel?.id) throw new Error(`Slack conversations.create returned no channel for #${name}`);
      result.channels_created++;
    } else if (channel.is_member !== true) {
      await client.conversations.join({ channel: channel.id });
      result.channels_joined++;
    }
    result.channel_ids[name] = channel.id;
    for (const msg of await readHistory(client, channel.id, opts.pageSize ?? 200)) {
      const seed = seedPayload(msg);
      if (seed) present.add(seed.world_id);
    }
  }

  for (const chat of [...world.chat].sort((a, b) => (a.ts === b.ts ? a.id.localeCompare(b.id) : a.ts < b.ts ? -1 : 1))) {
    if (present.has(chat.id)) { result.skipped++; continue; }
    const userName = people.get(chat.user) ?? chat.user;
    await client.chat.postMessage({
      channel: result.channel_ids[channelName(chat.channel)]!, text: `${speakerPrefix(userName)}${escapeText(chat.text)}`, unfurl_links: false, unfurl_media: false,
      metadata: { event_type: SEED_EVENT_TYPE, event_payload: { world_id: chat.id, ts: chat.ts, user: chat.user, user_name: userName } },
    });
    present.add(chat.id);
    result.posted++;
  }
  return result;
}

/**
 * World placeholder user id -> real workspace user id, matched on email. People with no match are left out, so the
 * caller can see who is missing before it rewrites `party.owner_user` and `approver.slack_user`.
 */
export async function slackUserMap(world: World, client: SlackClient = slackClientFromEnv()): Promise<Record<string, string>> {
  // UNVERIFIED: profile.email is only present with users:read.email; without it every lookup misses and the map is empty.
  const byEmail = new Map<string, string>();
  for (const u of await listUsers(client)) {
    const email = u.profile?.email?.trim().toLowerCase();
    if (email && u.id && !u.deleted && !u.is_bot) byEmail.set(email, u.id);
  }
  const map: Record<string, string> = {};
  for (const person of world.people) {
    const id = byEmail.get(person.email.trim().toLowerCase());
    if (id) map[person.id] = id;
  }
  return map;
}
