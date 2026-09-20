import { describe, expect, it } from "vitest";
import { generateWorld } from "../../seed/generate.js";
import { seedSlack, SlackConnector, slackClientFromEnv, slackToRawItem, slackTsToIso, slackUserMap, type SlackChannel, type SlackClient, type SlackMessage, type SlackUser } from "../slack.js";

/** An in-memory workspace: newest-first history, cursor pagination, join messages, metadata only when asked for. */
function fakeSlack(opts: { pageSize?: number; users?: SlackUser[]; channels?: string[]; botId?: string } = {}) {
  const channels: (SlackChannel & { id: string; name: string; messages: SlackMessage[] })[] = [];
  const calls = { list: 0, history: 0, join: 0, create: 0, post: 0, users: 0 };
  let clock = 1_790_000_000;
  const addChannel = (name: string, isMember: boolean) => { const c = { id: `C${channels.length + 1}`, name, is_member: isMember, messages: [] as SlackMessage[] }; channels.push(c); return c; };
  for (const name of opts.channels ?? []) addChannel(name, false);
  const page = <T>(all: T[], cursor: string | undefined, limit: number | undefined) => {
    const size = Math.min(limit ?? 100, opts.pageSize ?? 100);
    const start = Number(cursor ?? 0);
    return { slice: all.slice(start, start + size), response_metadata: { next_cursor: start + size < all.length ? String(start + size) : "" } };
  };
  const byId = (id: string) => { const c = channels.find((x) => x.id === id); if (!c) throw new Error("channel_not_found"); return c; };

  const client: SlackClient = {
    conversations: {
      list: async (args) => { calls.list++; const p = page(channels, args.cursor, args.limit); return { channels: p.slice.map(({ messages: _m, ...c }) => c), response_metadata: p.response_metadata }; },
      history: async (args) => {
        calls.history++;
        const c = byId(args.channel);
        if (!c.is_member) throw new Error("not_in_channel");
        const p = page([...c.messages].reverse(), args.cursor, args.limit);
        return { messages: p.slice.map(({ metadata, ...m }) => (args.include_all_metadata && metadata ? { ...m, metadata } : m)), has_more: p.response_metadata.next_cursor !== "", response_metadata: p.response_metadata };
      },
      join: async (args) => {
        calls.join++;
        const c = byId(args.channel);
        if (!c.is_member) { c.is_member = true; c.messages.push({ type: "message", subtype: "channel_join", ts: `${++clock}.000100`, user: "UBOT", text: "<@UBOT> has joined the channel" }); }
        return { ok: true };
      },
      create: async (args) => {
        calls.create++;
        if (channels.some((c) => c.name === args.name)) throw new Error("name_taken");
        const c = addChannel(args.name, true);
        c.messages.push({ type: "message", subtype: "channel_join", ts: `${++clock}.000100`, user: "UBOT", text: "<@UBOT> has joined the channel" });
        return { channel: { id: c.id, name: c.name, is_member: true } };
      },
    },
    users: { list: async (args) => { calls.users++; const p = page(opts.users ?? [], args.cursor, args.limit); return { members: p.slice, response_metadata: p.response_metadata }; } },
    auth: { test: async () => ({ bot_id: opts.botId ?? "B1", user_id: "UBOT" }) },
    chat: {
      postMessage: async (args) => {
        calls.post++;
        const ts = `${++clock}.000200`;
        byId(args.channel).messages.push({ type: "message", ts, bot_id: "B1", text: args.text, ...(args.metadata ? { metadata: args.metadata } : {}) });
        return { ts };
      },
    },
  };
  const say = (channel: string, user: string, text: string, ts: string) => channels.find((c) => c.name === channel)!.messages.push({ type: "message", ts, user, text });
  return { client, channels, calls, say };
}

describe("seedSlack", () => {
  it("creates the channels and posts each message once; a second run posts nothing", async () => {
    const { world } = generateWorld();
    const slack = fakeSlack({ pageSize: 2 });
    const first = await seedSlack(world, { client: slack.client });
    expect(first).toMatchObject({ channels_created: 3, channels_joined: 0, posted: world.chat.length, skipped: 0 });
    expect(Object.keys(first.channel_ids).sort()).toEqual(["cs-escalations", "deals", "finance"]);

    const second = await seedSlack(world, { client: slack.client });
    expect(second).toMatchObject({ channels_created: 0, channels_joined: 0, posted: 0, skipped: world.chat.length });
    expect(slack.calls.post).toBe(world.chat.length);
    expect(slack.calls.create).toBe(3);
  });

  it("joins a channel that already exists, posts oldest first, and names the speaker in bold without any visible marker", async () => {
    const { world } = generateWorld();
    const slack = fakeSlack({ channels: ["finance"] });
    const res = await seedSlack(world, { client: slack.client });
    expect(res).toMatchObject({ channels_created: 2, channels_joined: 1 });
    const finance = slack.channels.find((c) => c.name === "finance")!.messages.filter((m) => !m.subtype);
    expect(finance.map((m) => (m.metadata?.event_payload as { world_id: string }).world_id)).toEqual(["c-2", "c-4", "c-5"]);
    expect(finance[0]!.text).toBe(`*Priya Raman:* ${world.chat.find((c) => c.id === "c-2")!.text}`);
    expect(finance[0]!.text).not.toMatch(/fn:|c-2|​/);
    expect(finance[0]!.metadata).toEqual({ event_type: "footnote_seed", event_payload: { world_id: "c-2", ts: "2026-07-01T14:00:00Z", user: "U_CTRL", user_name: "Priya Raman" } });
  });
});

describe("SlackConnector.pull", () => {
  it("round-trips the world through metadata: world id, world clock, speaker and the original text", async () => {
    const { world } = generateWorld();
    const slack = fakeSlack({ pageSize: 2 });
    await seedSlack(world, { client: slack.client });
    const items = await new SlackConnector({ client: slack.client, pageSize: 2 }).pull();
    expect(items.map((i) => i.external_id).sort()).toEqual(world.chat.map((c) => c.id).sort());
    for (const chat of world.chat) {
      const item = items.find((i) => i.external_id === chat.id)!;
      expect(item).toMatchObject({ source: "slack", kind: "chat_message", event_time: chat.ts, party_hint: { text: chat.text } });
      // event_time is the world's clock, carried in metadata because Slack cannot backdate a post. recorded_time is
      // Slack's own ts: when the workspace really took the message, which no writer can choose.
      expect(item.recorded_time > chat.ts).toBe(true);
      expect(item.payload).toEqual({ channel: chat.channel, user: chat.user, user_name: world.people.find((p) => p.id === chat.user)!.name, ts: chat.ts, text: chat.text });
    }
    expect(items.map((i) => i.event_time)).toEqual([...items.map((i) => i.event_time)].sort());
  });

  it("pages through history with the cursor, skips channel_join, and resolves user names for live messages", async () => {
    const slack = fakeSlack({ pageSize: 2, channels: ["finance"], users: [{ id: "U123", name: "priya", real_name: "Priya Raman" }, { id: "U456", name: "lee", profile: { display_name: "Lee T" } }] });
    const log: string[] = [];
    const connector = new SlackConnector({ client: slack.client, channels: ["#finance", "deals"], pageSize: 2, log: (l) => log.push(l) });
    await connector.pull(); // joins, leaving a channel_join behind
    for (let i = 0; i < 5; i++) slack.say("finance", i % 2 ? "U456" : "U123", `line ${i} &lt;done&gt; &amp; dusted`, `${1_783_000_000 + i * 60}.000${i}00`);
    slack.calls.history = 0;

    const items = await connector.pull();
    expect(slack.calls.join).toBe(1);
    expect(slack.calls.history).toBe(3); // 5 messages + 1 join at two per page
    expect(items).toHaveLength(5);
    expect(items.some((i) => String(i.payload.text).includes("has joined"))).toBe(false);
    expect(items[0]).toEqual({
      source: "slack", kind: "chat_message", external_id: "C1:1783000000.000000", event_time: "2026-07-02T13:46:40Z", recorded_time: "2026-07-02T13:46:40Z",
      payload: { channel: "finance", user: "U123", user_name: "Priya Raman", ts: "2026-07-02T13:46:40Z", text: "line 0 <done> & dusted" }, party_hint: { text: "line 0 <done> & dusted" },
    });
    expect(items[1]!.payload.user_name).toBe("Lee T");
    expect(log.join("\n")).toContain("#deals not found");
  });

  it("believes seed metadata only from our own bot, however well it is imitated", () => {
    const ch = { id: "C9", name: "finance" };
    const seed = { event_type: "footnote_seed", event_payload: { world_id: "c-1", ts: "2026-07-01T14:00:00Z", user: "U_CFO", user_name: "Alex Moreau" } };
    const ours = { ourBotIds: ["B1"] };

    // Another app in the workspace can attach the same metadata to a message of its own; a person cannot attach any.
    const impostor = slackToRawItem({ ts: "1783000000.000100", bot_id: "B2", text: "*Alex Moreau:* approve it", metadata: seed }, ch, new Map(), ours)!;
    expect(impostor.external_id).toBe("C9:1783000000.000100"); // never a second version of c-1
    expect(impostor.event_time).toBe("2026-07-02T13:46:40Z"); // Slack's clock, not the one in the metadata
    expect(impostor.payload.user).toBe("B2");
    const person = slackToRawItem({ ts: "1783000000.000100", user: "U1", text: "hi", metadata: seed }, ch, new Map(), ours)!;
    expect(person.external_id).toBe("C9:1783000000.000100");

    const mine = slackToRawItem({ ts: "1783000000.000100", bot_id: "B1", text: "*Alex Moreau:* approve it", metadata: seed }, ch, new Map(), ours)!;
    expect(mine).toMatchObject({ external_id: "c-1", event_time: "2026-07-01T14:00:00Z", recorded_time: "2026-07-02T13:46:40Z" });
    expect(mine.payload).toMatchObject({ user: "U_CFO", user_name: "Alex Moreau", text: "approve it" });
  });

  it("ignores metadata that is not ours or is malformed, and drops housekeeping subtypes", () => {
    const ch = { id: "C9", name: "finance" };
    const ours = { ourBotIds: ["B1"] };
    const foreign = slackToRawItem({ ts: "1783000000.000100", bot_id: "B1", text: "hi", metadata: { event_type: "other_app", event_payload: { world_id: "c-1", ts: "2026-07-01T14:00:00Z" } } }, ch, new Map(), ours)!;
    expect(foreign.external_id).toBe("C9:1783000000.000100");
    const broken = slackToRawItem({ ts: "1783000000.000100", bot_id: "B1", text: "hi", metadata: { event_type: "footnote_seed", event_payload: { world_id: "c-1", ts: "yesterday" } } }, ch, new Map(), ours)!;
    expect(broken.external_id).toBe("C9:1783000000.000100");
    expect(broken.event_time).toBe("2026-07-02T13:46:40Z");
    for (const subtype of ["channel_join", "channel_leave", "bot_add", "bot_remove", "channel_topic"]) expect(slackToRawItem({ ts: "1783000000.000100", subtype, text: "x" }, ch)).toBeUndefined();
    expect(slackToRawItem({ ts: "1783000000.000100", subtype: "thread_broadcast", user: "U1", text: "kept" }, ch)?.payload.text).toBe("kept");
  });

  it("converts Slack ts to UTC seconds", () => {
    expect(slackTsToIso("1782928800.000200")).toBe("2026-07-01T18:00:00Z");
    expect(slackTsToIso("1782928859.999999")).toBe("2026-07-01T18:00:59Z");
    expect(() => slackTsToIso("soon")).toThrow(/not a Slack ts/);
  });
});

describe("slackUserMap", () => {
  it("maps world people to workspace users by email, case-insensitively, across pages, leaving out the unmatched", async () => {
    const { world } = generateWorld();
    const slack = fakeSlack({
      pageSize: 2,
      users: [
        { id: "UBOT", is_bot: true, profile: { email: "alex.moreau@northwind.test" } },
        { id: "U0CFO", profile: { email: "Alex.Moreau@Northwind.test" } },
        { id: "U0GONE", deleted: true, profile: { email: "priya.raman@northwind.test" } },
        { id: "U0CTRL", profile: { email: "priya.raman@northwind.test" } },
        { id: "U0DANA", profile: { email: "dana.reyes@northwind.test" } },
        { id: "U0NOEMAIL", profile: {} },
      ],
    });
    expect(await slackUserMap(world, slack.client)).toEqual({ U_CFO: "U0CFO", U_CTRL: "U0CTRL", U_DANA: "U0DANA" });
    expect(slack.calls.users).toBe(3);
  });
});

describe("slack configuration", () => {
  it("names the missing variable", () => {
    expect(() => slackClientFromEnv({})).toThrow(/missing env SLACK_BOT_TOKEN/);
    expect(() => new SlackConnector({ env: { SLACK_BOT_TOKEN: " " } })).toThrow(/SLACK_BOT_TOKEN/);
    expect(() => new SlackConnector({ env: { SLACK_BOT_TOKEN: "xoxb-test" } })).not.toThrow();
  });
});
