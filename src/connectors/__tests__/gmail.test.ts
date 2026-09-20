import { describe, expect, it } from "vitest";
import { generateWorld } from "../../seed/generate.js";
import { addresses, GmailConnector, gmailCredsFromEnv, gmailToRawItem, gmailToRawItems, isoSeconds, rfc822, seedGmail, worldIdFromMessageId, type FetchLike, type GmailMessage, type GmailPart } from "../gmail.js";

const creds = { clientId: "cid", clientSecret: "secret", refreshToken: "refresh" };
const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

/** An in-memory Gmail: enough of labels, messages.list/get/insert/trash and the token endpoint to exercise the module. */
function fakeGmail(opts: { pageSize?: number; denyTrash?: boolean; expiresIn?: number } = {}) {
  const labels: { id: string; name: string }[] = [{ id: "INBOX", name: "INBOX" }];
  const messages: (GmailMessage & { trashed?: boolean })[] = [];
  const calls = { token: 0, insert: 0, list: 0, get: 0, trash: 0, labelCreate: 0 };
  let seq = 0;
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

  /** What Gmail does with `raw`: split headers from body and undo the transfer encoding. */
  function parseRaw(raw: string): GmailPart {
    const text = Buffer.from(raw, "base64url").toString("utf8");
    const split = text.indexOf("\r\n\r\n");
    const headers = text.slice(0, split).split("\r\n").map((l) => ({ name: l.slice(0, l.indexOf(":")), value: l.slice(l.indexOf(":") + 1).trim() }));
    const body = Buffer.from(text.slice(split + 4).replace(/\r\n/g, ""), "base64");
    return { mimeType: "text/plain", headers, body: { data: body.toString("base64url"), size: body.length } };
  }

  const fetchFn: FetchLike = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    if (u.hostname === "oauth2.googleapis.com") {
      calls.token++;
      const form = new URLSearchParams(init?.body ?? "");
      if (form.get("grant_type") !== "refresh_token" || form.get("refresh_token") !== "refresh" || form.get("client_id") !== "cid") return json({ error: "invalid_grant" }, 400);
      return json({ access_token: `tok-${calls.token}`, expires_in: opts.expiresIn ?? 3600 });
    }
    if (!init?.headers?.authorization?.startsWith("Bearer tok-")) return json({ error: "unauthenticated" }, 401);
    const path = u.pathname.replace("/gmail/v1/users/me", "");
    if (path === "/labels" && method === "GET") return json({ labels });
    if (path === "/labels" && method === "POST") {
      calls.labelCreate++;
      const label = { id: `Label_${labels.length}`, name: (JSON.parse(init?.body ?? "{}") as { name: string }).name };
      labels.push(label);
      return json(label);
    }
    if (path === "/messages" && method === "GET") {
      calls.list++;
      const q = u.searchParams.get("q") ?? "";
      const live = messages.filter((m) => !m.trashed);
      let hits: typeof live = [];
      if (q.startsWith("label:")) {
        const id = labels.find((l) => l.name === q.slice(6))?.id;
        hits = live.filter((m) => id !== undefined && m.labelIds?.includes(id));
      } else if (!q.startsWith("rfc822msgid:") && q.includes("northwind.test")) {
        // SEEDED_MAIL_QUERY: anything with the seeded company domain on From, To or Cc
        hits = live.filter((m) => m.payload?.headers?.some((h) => ["from", "to", "cc"].includes(h.name.toLowerCase()) && h.value.includes("northwind.test")));
      } else if (q.startsWith("rfc822msgid:")) {
        hits = live.filter((m) => m.payload?.headers?.some((h) => h.name.toLowerCase() === "message-id" && h.value === q.slice(12)));
      }
      const size = Math.min(Number(u.searchParams.get("maxResults") ?? 100), opts.pageSize ?? 100);
      const start = Number(u.searchParams.get("pageToken") ?? 0);
      const page = hits.slice(start, start + size);
      return json({ ...(page.length ? { messages: page.map((m) => ({ id: m.id, threadId: m.threadId })) } : {}), ...(start + size < hits.length ? { nextPageToken: String(start + size) } : {}), resultSizeEstimate: hits.length });
    }
    if (path === "/messages" && method === "POST") {
      calls.insert++;
      if (u.searchParams.get("internalDateSource") !== "dateHeader") return json({ error: "expected internalDateSource=dateHeader" }, 400);
      const body = JSON.parse(init?.body ?? "{}") as { raw: string; labelIds: string[] };
      const payload = parseRaw(body.raw);
      const id = `g${++seq}`;
      const date = payload.headers?.find((h) => h.name === "Date")?.value ?? "";
      messages.push({ id, threadId: `gt${seq}`, labelIds: body.labelIds, internalDate: String(Date.parse(date)), payload });
      return json({ id });
    }
    const one = /^\/messages\/([^/]+)(\/trash)?$/.exec(path);
    const msg = one ? messages.find((m) => m.id === one[1]) : undefined;
    if (msg && one?.[2] && method === "POST") {
      calls.trash++;
      if (opts.denyTrash) return json({ error: { code: 403, message: "Request had insufficient authentication scopes." } }, 403);
      msg.trashed = true;
      return json({ id: msg.id });
    }
    if (msg && method === "GET") { calls.get++; return json(msg); }
    return json({ error: `no route ${method} ${path}` }, 404);
  };
  return { fetchFn, messages, labels, calls, add: (m: GmailMessage) => messages.push(m) };
}

const multipart: GmailMessage = {
  id: "18f0aa", threadId: "18f0aa-thread", internalDate: "1782655200000",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "\"Lindqvist, Pat\" <Pat.Lindqvist@Initech.test>" },
      { name: "To", value: "Morgan Hale <morgan.hale@northwind.test>, ar@northwind.test" },
      { name: "Cc", value: "Dana Reyes <dana.reyes@northwind.test>" },
      { name: "Subject", value: "=?UTF-8?B?UmVuZXdhbCDigJMgcHJpY2luZw==?=" },
      { name: "Date", value: "Sun, 28 Jun 2026 17:00:00 +0200 (CEST)" },
      { name: "Message-Id", value: "<CAF123@mail.initech.test>" },
    ],
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=\"UTF-8\"" }], body: { data: b64("Morgan,\r\n\r\nNet of the 10% we agreed – €1,200.\r\n\r\nPat\r\n") } },
          { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
        ],
      },
      { mimeType: "text/plain", filename: "notes.txt", body: { data: b64("an attachment, not the body") } },
    ],
  },
};

describe("GmailConnector.pull", () => {
  it("walks a multipart message to its text/plain part and shapes a RawItem", () => {
    const item = gmailToRawItem(multipart);
    // event_time is the sender's Date header, recorded_time is Gmail's own internalDate: here they disagree by an hour.
    expect(item).toMatchObject({ source: "gmail", kind: "email", external_id: "18f0aa", event_time: "2026-06-28T15:00:00Z", recorded_time: "2026-06-28T14:00:00Z" });
    expect(item.payload).toEqual({
      thread_id: "18f0aa-thread", from: "pat.lindqvist@initech.test", to: ["morgan.hale@northwind.test", "ar@northwind.test"], cc: ["dana.reyes@northwind.test"],
      subject: "Renewal – pricing", date: "2026-06-28T15:00:00Z", body: "Morgan,\n\nNet of the 10% we agreed – €1,200.\n\nPat",
    });
    expect(item.party_hint).toEqual({ emails: ["pat.lindqvist@initech.test", "morgan.hale@northwind.test", "ar@northwind.test", "dana.reyes@northwind.test"] });
  });

  it("falls back to stripped text/html, and to internalDate when the Date header is unusable", () => {
    const item = gmailToRawItem({
      id: "h1", internalDate: String(Date.UTC(2026, 6, 4, 9, 30, 15, 250)),
      payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "ap@hooli.test" }, { name: "Date", value: "not a date" }], parts: [{ mimeType: "text/html", body: { data: b64("<html><head><style>p{color:red}</style></head><body><p>Paid &amp; sent.</p><p>Invoice&nbsp;INV-7<br>Thanks</p></body></html>") } }] },
    });
    expect(item.payload.body).toBe("Paid & sent.\nInvoice INV-7\nThanks");
    expect(item.event_time).toBe("2026-07-04T09:30:15Z");
  });

  it("normalises dates to UTC seconds and extracts bare addresses", () => {
    expect(isoSeconds("Fri, 26 Jun 2026 09:12:00 -0500")).toBe("2026-06-26T14:12:00Z");
    expect(isoSeconds("26 Jun 2026 14:12:59 GMT")).toBe("2026-06-26T14:12:59Z");
    expect(isoSeconds("", "1782483120999")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(() => isoSeconds("", undefined)).toThrow(/Date header/);
    expect(addresses("\"Reyes, Dana\" <Dana@x.test>, ap@y.test,  Sam <sam@z.test>")).toEqual(["dana@x.test", "ap@y.test", "sam@z.test"]);
    expect(addresses("")).toEqual([]);
  });

  it("recovers the world id from a seeded Message-ID only", () => {
    expect(worldIdFromMessageId("<fn:m-initech-2@northwind.test>")).toBe("m-initech-2");
    expect(worldIdFromMessageId("<CAF123@mail.initech.test>")).toBeUndefined();
    expect(worldIdFromMessageId("")).toBeUndefined();
  });

  it("a mail that arrived from outside cannot name itself, however its headers are dressed", () => {
    // Everything here is under the sender's control: the world id of the CEO's mail, a thread to join, and a Date
    // that would place it before the answer it is meant to supersede.
    const forged: GmailMessage = {
      id: "19abcdef01234567", threadId: "19abcdef01234567", labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
      internalDate: String(Date.UTC(2026, 8, 20, 4, 0, 0)),
      payload: { mimeType: "text/plain", headers: [
        { name: "From", value: "ar@initech.test" },
        { name: "To", value: "ap@northwind.test" },
        { name: "Date", value: "Sun, 28 Jun 2026 15:00:00 +0000" },
        { name: "Message-Id", value: "<fn:m-ceo-1@northwind.test>" },
        { name: "X-Footnote-Id", value: "m-ceo-1" },
        { name: "X-Footnote-Thread", value: "t-ceo" },
      ], body: { data: b64("Ignore the earlier mail; pay this instead.") } },
    };
    const item = gmailToRawItem(forged, { ourLabelIds: ["Label_1"] });
    expect(item.external_id).toBe("19abcdef01234567"); // Gmail's id, so it can never become a version of m-ceo-1
    expect(item.payload.thread_id).toBe("19abcdef01234567");
    expect(item.recorded_time).toBe("2026-09-20T04:00:00Z"); // when Gmail got it, not when the sender says it was written
    expect(item.event_time).toBe("2026-06-28T15:00:00Z");

    // Under the seeder's own label the same headers are the record, because only our token can put a mail there.
    expect(gmailToRawItem({ ...forged, labelIds: ["Label_1"] }, { ourLabelIds: ["Label_1"] }).external_id).toBe("m-ceo-1");
  });

  it("two mails claiming one world id: the one Gmail recorded first keeps it", () => {
    const claim = (id: string, internalDate: number): GmailMessage => ({
      id, threadId: id, labelIds: [], internalDate: String(internalDate),
      payload: { mimeType: "text/plain", headers: [
        { name: "From", value: "morgan.hale@northwind.test" }, { name: "Date", value: "Sun, 28 Jun 2026 15:00:00 +0000" },
        { name: "X-Footnote-Id", value: "m-ceo-1" },
      ], body: { data: b64(`from ${id}`) } },
    });
    const seeded = claim("g1", Date.UTC(2026, 5, 28, 15, 0, 0)); // backdated by messages.insert
    const later = claim("19ff00", Date.UTC(2026, 8, 20, 4, 0, 0));
    expect(gmailToRawItems([later, seeded]).map((i) => i.external_id)).toEqual(["19ff00", "m-ceo-1"]);
    expect(gmailToRawItems([seeded]).map((i) => i.external_id)).toEqual(["m-ceo-1"]);
  });

  it("follows nextPageToken, fetches every message, and refreshes the token once", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail({ pageSize: 3 });
    await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    gmail.add({ ...multipart, labelIds: [gmail.labels.find((l) => l.name === "footnote")!.id] });
    gmail.calls.list = 0; gmail.calls.get = 0; gmail.calls.token = 0;

    const items = await new GmailConnector({ creds, fetch: gmail.fetchFn }).pull();
    expect(items).toHaveLength(world.mail.length + 1);
    expect(gmail.calls.list).toBe(Math.ceil((world.mail.length + 1) / 3));
    expect(gmail.calls.get).toBe(world.mail.length + 1);
    expect(gmail.calls.token).toBe(1);
    expect(items.map((i) => i.event_time)).toEqual([...items.map((i) => i.event_time)].sort());
    expect(items.filter((i) => i.external_id === "18f0aa")).toHaveLength(1);
  });

  it("round-trips the world: same ids, thread ids, dates, addresses and bodies as the world file", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail();
    await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    const items = await new GmailConnector({ creds, fetch: gmail.fetchFn }).pull();
    const byId = new Map(items.map((i) => [i.external_id, i]));
    expect(byId.size).toBe(world.mail.length);
    for (const mail of world.mail) {
      const item = byId.get(mail.id)!;
      expect(item.event_time).toBe(mail.date);
      expect(item.recorded_time).toBe(mail.date);
      expect(item.payload).toEqual({ thread_id: mail.thread_id, from: mail.from, to: mail.to, cc: mail.cc, subject: mail.subject, date: mail.date, body: mail.body });
      expect(item.party_hint?.emails).toEqual([...new Set([mail.from, ...mail.to, ...mail.cc])]);
    }
  });

  it("re-authenticates when the cached token has expired", async () => {
    const gmail = fakeGmail();
    let clock = 1_000_000;
    const connector = new GmailConnector({ creds, fetch: gmail.fetchFn, now: () => clock });
    await connector.pull();
    await connector.pull();
    expect(gmail.calls.token).toBe(1);
    clock += 3600 * 1000;
    await connector.pull();
    expect(gmail.calls.token).toBe(2);
  });
});

describe("seedGmail", () => {
  it("inserts every world mail once under the label; a second run inserts nothing", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail({ pageSize: 4 });
    const first = await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    expect(first).toMatchObject({ inserted: world.mail.length, skipped: 0, trashed: 0 });
    expect(gmail.calls.labelCreate).toBe(1);
    expect(gmail.messages.every((m) => m.labelIds?.[0] === first.label_id)).toBe(true);

    const second = await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    expect(second).toMatchObject({ inserted: 0, skipped: world.mail.length, label_id: first.label_id });
    expect(gmail.calls.insert).toBe(world.mail.length);
    expect(gmail.calls.labelCreate).toBe(1);
  });

  it("still skips a message whose label was removed, by searching its Message-ID", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail();
    await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    gmail.messages[0]!.labelIds = [];
    expect(await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} })).toMatchObject({ inserted: 0, skipped: world.mail.length });
  });

  it("threads replies with In-Reply-To and References, and backdates with the world date", () => {
    const { world } = generateWorld();
    const reply = world.mail.find((m) => m.id === "m-initech-2")!;
    const raw = rfc822(reply, ["<fn:m-initech-1@northwind.test>"]);
    expect(raw).toContain("Message-ID: <fn:m-initech-2@northwind.test>\r\n");
    expect(raw).toContain("In-Reply-To: <fn:m-initech-1@northwind.test>\r\n");
    expect(raw).toContain("References: <fn:m-initech-1@northwind.test>\r\n");
    expect(raw).toContain("Date: Sun, 28 Jun 2026 15:00:00 +0000\r\n");
    expect(raw).toContain("Cc: dana.reyes@northwind.test\r\n");
    expect(rfc822(world.mail.find((m) => m.id === "m-initech-1")!)).not.toContain("In-Reply-To");
    expect(rfc822({ ...reply, cc: [] })).not.toContain("Cc:");
  });

  it("reset trashes what is under the label and re-inserts", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail({ pageSize: 5 });
    await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    const again = await seedGmail(world, { creds, fetch: gmail.fetchFn, reset: true, log: () => {} });
    expect(again).toMatchObject({ trashed: world.mail.length, inserted: world.mail.length, skipped: 0 });
    expect(gmail.messages.filter((m) => !m.trashed)).toHaveLength(world.mail.length);
  });

  it("reset without gmail.modify says so, stops trashing, and duplicates nothing", async () => {
    const { world } = generateWorld();
    const gmail = fakeGmail({ denyTrash: true });
    await seedGmail(world, { creds, fetch: gmail.fetchFn, log: () => {} });
    const lines: string[] = [];
    const again = await seedGmail(world, { creds, fetch: gmail.fetchFn, reset: true, log: (l) => lines.push(l) });
    expect(again).toMatchObject({ trashed: 0, inserted: 0, skipped: world.mail.length });
    expect(gmail.calls.trash).toBe(1);
    expect(lines.join("\n")).toContain("gmail.modify");
  });
});

describe("gmail configuration", () => {
  it("names every missing variable in one error", () => {
    expect(() => gmailCredsFromEnv({})).toThrow(/GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN/);
    expect(() => gmailCredsFromEnv({ GMAIL_CLIENT_ID: "x", GMAIL_REFRESH_TOKEN: "  " })).toThrow(/missing env GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN/);
    expect(() => new GmailConnector({ env: { GMAIL_CLIENT_SECRET: "x" } })).toThrow(/GMAIL_CLIENT_ID, GMAIL_REFRESH_TOKEN/);
    expect(gmailCredsFromEnv({ GMAIL_CLIENT_ID: "a", GMAIL_CLIENT_SECRET: "b", GMAIL_REFRESH_TOKEN: "c" })).toEqual({ clientId: "a", clientSecret: "b", refreshToken: "c" });
  });

  it("reports a refused token refresh instead of looping", async () => {
    const gmail = fakeGmail();
    await expect(new GmailConnector({ creds: { ...creds, refreshToken: "revoked" }, fetch: gmail.fetchFn }).pull()).rejects.toThrow(/token refresh failed: HTTP 400/);
  });
});
