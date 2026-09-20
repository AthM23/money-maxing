import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QboClient, qboConfigFromEnv, qboEscape, saveRefreshTokenToFile, QBO_TOKEN_URL, type FetchLike, type QboConfig } from "../../connectors/qboClient.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { generateWorld } from "../generate.js";
import { generateGlobalJuly } from "../globalJuly.js";
import { centsToQboAmount, seedQuickBooks, QBO_ITEM_NAME } from "../quickbooks.js";

type Rec = Record<string, unknown> & { Id: string; SyncToken: string };

const CONFIG: QboConfig = { clientId: "cid", clientSecret: "secret", realmId: "R1", refreshToken: "rt-0", baseUrl: "https://qbo.test" };

/** An in-memory QBO behind `fetch`: token endpoint, query, read, create, sparse update, delete. */
class FakeQbo {
  readonly store = new Map<string, Map<string, Rec>>(); // keyed by lower-cased entity
  readonly calls: Array<{ method: string; url: string; body?: unknown }> = [];
  private nextId = 100;
  accessToken = "at-1";
  tokenRequests: string[] = [];
  /** What the token endpoint hands back as refresh_token; undefined echoes the one sent. */
  rotateTo: string | undefined;
  /** Statuses to answer the next API calls with, before behaving normally. */
  failNext: number[] = [];

  constructor() {
    this.put("account", { Name: "Services", AccountType: "Income", Active: true });
    this.put("account", { Name: "Accounts Receivable (A/R)", AccountType: "Accounts Receivable", Active: true });
  }

  put(entity: string, fields: Record<string, unknown>): Rec {
    const rec: Rec = { ...fields, Id: String(this.nextId++), SyncToken: "0" };
    const m = this.store.get(entity) ?? new Map<string, Rec>();
    m.set(rec.Id, rec);
    this.store.set(entity, m);
    return rec;
  }
  all(entity: string): Rec[] { return [...(this.store.get(entity.toLowerCase())?.values() ?? [])]; }
  active(entity: string): Rec[] { return this.all(entity).filter((r) => r.Active !== false); }
  apiCalls(): number { return this.calls.filter((c) => c.url !== QBO_TOKEN_URL).length; }

  readonly fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body !== undefined && url !== QBO_TOKEN_URL ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    this.calls.push({ method, url, body: body ?? init?.body });
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    const fault = (status: number, Message: string, code: string) => json(status, { Fault: { Error: [{ Message, Detail: Message, code }], type: "ValidationFault" } });

    if (url === QBO_TOKEN_URL) {
      const params = new URLSearchParams(init?.body ?? "");
      expect(init?.headers?.Authorization).toBe(`Basic ${Buffer.from("cid:secret").toString("base64")}`);
      expect(params.get("grant_type")).toBe("refresh_token");
      const sent = params.get("refresh_token") ?? "";
      this.tokenRequests.push(sent);
      return json(200, { access_token: this.accessToken, refresh_token: this.rotateTo ?? sent, expires_in: 3600, token_type: "bearer" });
    }

    const failing = this.failNext.shift();
    if (failing !== undefined) return failing === 401 ? json(401, { fault: { error: [{ message: "AuthenticationFailed", detail: "Token expired" }], type: "AUTHENTICATION" } }) : new Response("upstream sad", { status: failing });
    if (init?.headers?.Authorization !== `Bearer ${this.accessToken}`) return json(401, { fault: { error: [{ message: "AuthenticationFailed" }], type: "AUTHENTICATION" } });

    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // v3 company R1 <entity> [id]
    expect(parts.slice(0, 3)).toEqual(["v3", "company", "R1"]);
    const entity = parts[3] ?? "";

    if (entity === "query") {
      const sql = u.searchParams.get("query") ?? "";
      const m = /^select \* from (\w+) where (\w+) = '((?:\\.|[^'\\])*)'(?: maxresults (\d+))?$/i.exec(sql);
      if (!m) return fault(400, `QueryParserError: ${sql}`, "4000");
      const [, ent = "", field = "", raw = "", max] = m;
      const want = raw.replace(/\\(.)/g, "$1");
      const rows = this.active(ent).filter((r) => r[field] === want).slice(0, max ? Number(max) : 1000);
      return json(200, { QueryResponse: rows.length ? { [ent]: rows, startPosition: 1, maxResults: rows.length } : {}, time: "now" });
    }

    const Entity = entity.charAt(0).toUpperCase() + entity.slice(1);
    if (method === "GET") {
      const rec = this.store.get(entity)?.get(parts[4] ?? "");
      return rec ? json(200, { [Entity]: rec }) : fault(400, "Object Not Found", "610");
    }
    if (u.searchParams.get("operation") === "delete") {
      const rec = this.store.get(entity)?.get(String(body?.Id));
      if (!rec) return fault(400, "Object Not Found", "610");
      if (rec.SyncToken !== body?.SyncToken) return fault(400, "Stale Object Error", "5010");
      this.store.get(entity)?.delete(rec.Id);
      return json(200, { [Entity]: { Id: rec.Id, status: "Deleted", domain: "QBO" } });
    }
    if (body?.Id !== undefined) { // sparse update
      const rec = this.store.get(entity)?.get(String(body.Id));
      if (!rec) return fault(400, "Object Not Found", "610");
      if (rec.SyncToken !== body.SyncToken) return fault(400, "Stale Object Error", "5010");
      const { sparse: _sparse, ...fields } = body;
      Object.assign(rec, fields, { SyncToken: String(Number(rec.SyncToken) + 1) });
      if (rec.Active === false && typeof rec.DisplayName === "string" && !rec.DisplayName.endsWith(" (deleted)")) rec.DisplayName = `${rec.DisplayName} (deleted)`;
      return json(200, { [Entity]: rec });
    }
    // create. DisplayName is unique across the name lists, as in the real thing.
    const name = body?.DisplayName;
    if (name !== undefined && ["customer", "vendor"].some((e) => this.all(e).some((r) => r.DisplayName === name))) return fault(400, "Duplicate Name Exists Error", "6240");
    if (entity === "invoice") {
      const cust = (body?.CustomerRef as { value?: string } | undefined)?.value ?? "";
      if (!this.store.get("customer")?.has(cust)) return fault(400, "Invalid Reference Id", "2500");
    }
    return json(200, { [Entity]: this.put(entity, { Active: true, ...body }), time: "now" });
  };
}

function setup(): { db: Db; fake: FakeQbo; client: QboClient; rotated: string[] } {
  const fake = new FakeQbo();
  const rotated: string[] = [];
  const client = new QboClient(CONFIG, { fetch: fake.fetch, onRefreshToken: (t) => { rotated.push(t); }, sleep: async () => {} });
  return { db: openWorldDb(), fake, client, rotated };
}

const { world } = generateWorld();
const JULY_DOCS = Array.from({ length: 12 }, (_, i) => `INV-${1037 + i}`);

describe("seedQuickBooks", () => {
  it("first run creates 13 customers, 10 vendors, the item and the 12 July invoices", async () => {
    const { db, fake, client } = setup();
    const counts = await seedQuickBooks(db, world, client);

    expect(counts.customer).toEqual({ created: 13, adopted: 0, skipped: 0, removed: 0 });
    expect(counts.vendor).toEqual({ created: 10, adopted: 0, skipped: 0, removed: 0 });
    expect(counts.invoice).toEqual({ created: 12, adopted: 0, skipped: 0, removed: 0 });
    expect(counts.item).toEqual({ created: 1, adopted: 0, skipped: 0, removed: 0 });

    const customers = fake.all("customer");
    expect(customers.map((c) => c.DisplayName)).toContain("Globex Holdings Ltd");
    expect(customers.map((c) => c.DisplayName)).not.toContain("Unidentified payer");
    expect(customers.find((c) => c.DisplayName === "Initech")?.Notes).toBe("fn:initech");
    expect(fake.all("vendor").every((v) => typeof v.AcctNum === "string" && v.AcctNum.startsWith("fn:"))).toBe(true);

    const invoices = fake.all("invoice");
    expect(invoices.map((i) => i.DocNumber).sort()).toEqual(JULY_DOCS);
    const initech = invoices.find((i) => i.DocNumber === "INV-1042");
    const initechId = customers.find((c) => c.DisplayName === "Initech")?.Id;
    expect(initech).toMatchObject({ PrivateNote: "fn:INV-1042", CustomerRef: { value: initechId } });
    expect(String(initech?.TxnDate)).toMatch(/^2026-07-/);
    expect(String(initech?.DueDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const line = (initech?.Line as Array<Record<string, unknown>>)[0];
    const item = fake.all("item")[0];
    expect(item).toMatchObject({ Name: QBO_ITEM_NAME, Type: "Service", IncomeAccountRef: { value: fake.all("account")[0]?.Id } });
    expect(line).toMatchObject({ Amount: 12000, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: item?.Id } } });

    // the manifest carries the Id QBO returned, per world id
    const rows = db.prepare("SELECT * FROM seed_manifest WHERE system = 'quickbooks'").all() as Array<{ world_id: string; kind: string; external_id: string; seeded_at: string }>;
    expect(rows).toHaveLength(13 + 10 + 12 + 1 + 5);
    // the mirror's JournalEntry accounts: the company's own A/R is adopted, the four it lacks are made
    expect(counts.account).toEqual({ created: 4, adopted: 1, skipped: 0, removed: 0 });
    expect(rows.find((r) => r.world_id === "qbo-account:1200")).toMatchObject({ kind: "account", external_id: fake.all("account")[1]?.Id });
    expect(fake.all("account").find((a) => a.Name === "Realized FX gain or loss")).toMatchObject({ AccountType: "Other Expense", AccountSubType: "ExchangeGainOrLoss" });
    expect(rows.find((r) => r.world_id === "INV-1042")).toMatchObject({ kind: "invoice", external_id: initech?.Id });
    expect(rows.find((r) => r.world_id === "initech")).toMatchObject({ kind: "customer", external_id: initechId });
    expect(rows.every((r) => !Number.isNaN(Date.parse(r.seeded_at)))).toBe(true);
    expect(fake.tokenRequests).toEqual(["rt-0"]); // one refresh, then the cached access token
  });

  it("second run creates nothing and makes no API calls: everything is skipped via the manifest", async () => {
    const { db, fake, client } = setup();
    await seedQuickBooks(db, world, client);
    const before = fake.apiCalls();
    const counts = await seedQuickBooks(db, world, client);
    expect(counts.customer).toEqual({ created: 0, adopted: 0, skipped: 13, removed: 0 });
    expect(counts.vendor).toEqual({ created: 0, adopted: 0, skipped: 10, removed: 0 });
    expect(counts.invoice).toEqual({ created: 0, adopted: 0, skipped: 12, removed: 0 });
    expect(fake.apiCalls()).toBe(before);
    expect(fake.all("invoice")).toHaveLength(12);
  });

  it("an empty manifest over an already-seeded company adopts the records", async () => {
    const { fake, client } = setup();
    await seedQuickBooks(openWorldDb(), world, client);
    const db2 = openWorldDb();
    const counts = await seedQuickBooks(db2, world, client);
    expect(counts.customer).toEqual({ created: 0, adopted: 13, skipped: 0, removed: 0 });
    expect(counts.vendor).toEqual({ created: 0, adopted: 10, skipped: 0, removed: 0 });
    expect(counts.invoice).toEqual({ created: 0, adopted: 12, skipped: 0, removed: 0 });
    expect(counts.item).toEqual({ created: 0, adopted: 0, skipped: 0, removed: 0 }); // never needed: no invoice was created
    expect(fake.all("customer")).toHaveLength(13);
    expect(fake.all("invoice")).toHaveLength(12);
    const row = db2.prepare("SELECT external_id FROM seed_manifest WHERE world_id = 'INV-1042'").get() as { external_id: string };
    expect(row.external_id).toBe(fake.all("invoice").find((i) => i.DocNumber === "INV-1042")?.Id);
  });

  it("reset deletes invoices, deactivates names and the item, then re-creates everything", async () => {
    const { db, fake, client } = setup();
    await seedQuickBooks(db, world, client);
    const oldInitech = fake.all("customer").find((c) => c.DisplayName === "Initech")?.Id;
    const oldInvoiceIds = new Set(fake.all("invoice").map((i) => i.Id));

    const counts = await seedQuickBooks(db, world, client, { reset: true });
    expect(counts.customer).toEqual({ created: 13, adopted: 0, skipped: 0, removed: 13 });
    expect(counts.vendor).toEqual({ created: 10, adopted: 0, skipped: 0, removed: 10 });
    expect(counts.invoice).toEqual({ created: 12, adopted: 0, skipped: 0, removed: 12 });
    expect(counts.item).toEqual({ created: 1, adopted: 0, skipped: 0, removed: 1 });
    // accounts are chart set-up, one of them the company's own: a reset forgets them and the re-seed adopts them again
    expect(counts.account).toEqual({ created: 0, adopted: 5, skipped: 0, removed: 0 });
    expect(fake.active("account")).toHaveLength(6);

    expect(fake.all("invoice")).toHaveLength(12); // the old twelve are gone for real
    expect(fake.all("invoice").some((i) => oldInvoiceIds.has(i.Id))).toBe(false);
    expect(fake.all("customer")).toHaveLength(26);
    expect(fake.active("customer")).toHaveLength(13);
    expect(fake.all("customer").find((c) => c.Id === oldInitech)).toMatchObject({ Active: false, DisplayName: "Initech (deleted)" });
    expect(fake.active("vendor")).toHaveLength(10);
    expect(fake.active("item")).toHaveLength(1);

    const row = db.prepare("SELECT external_id FROM seed_manifest WHERE world_id = 'initech'").get() as { external_id: string };
    expect(row.external_id).not.toBe(oldInitech);
    expect(db.prepare("SELECT count(*) AS n FROM seed_manifest WHERE system = 'quickbooks'").get()).toEqual({ n: 41 });
  });

  it("reset tolerates a wiped sandbox: a missing record only costs its manifest row", async () => {
    const { db, fake, client } = setup();
    await seedQuickBooks(db, world, client);
    fake.store.get("invoice")?.clear();
    const counts = await seedQuickBooks(db, world, client, { reset: true });
    expect(counts.invoice).toEqual({ created: 12, adopted: 0, skipped: 0, removed: 0 });
  });

  it("periods widens the invoice scope and leaves July alone", async () => {
    const { db, client, fake } = setup();
    await seedQuickBooks(db, world, client);
    const june = world.invoices.filter((i) => i.issue_date.startsWith("2026-06"));
    const counts = await seedQuickBooks(db, world, client, { periods: ["2026-06", "2026-07"] });
    expect(june.length).toBeGreaterThan(0);
    expect(counts.invoice).toEqual({ created: june.length, adopted: 0, skipped: 12, removed: 0 });
    expect(fake.all("invoice")).toHaveLength(12 + june.length);
  });

  it("amounts come from integer cents without float residue", () => {
    expect(centsToQboAmount(1_200_000)).toBe(12000);
    expect(JSON.stringify(centsToQboAmount(1_080_019))).toBe("10800.19");
    expect(JSON.stringify(centsToQboAmount(29))).toBe("0.29");
    expect(() => centsToQboAmount(10.5)).toThrow(/integer cents/);
  });
});

describe("QboClient", () => {
  it("missing env produces one error naming every missing var", () => {
    const noFile = join(tmpdir(), "qbo-no-such-dir", "token.txt");
    expect(() => qboConfigFromEnv({}, noFile)).toThrow(/QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REALM_ID, QBO_REFRESH_TOKEN/);
    expect(() => qboConfigFromEnv({ QBO_CLIENT_ID: "a", QBO_REALM_ID: "r", QBO_CLIENT_SECRET: " " }, noFile)).toThrow(/missing QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN\./);
    expect(qboConfigFromEnv({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_REALM_ID: "r", QBO_REFRESH_TOKEN: "t" }, noFile))
      .toEqual({ clientId: "a", clientSecret: "b", realmId: "r", refreshToken: "t", baseUrl: "https://sandbox-quickbooks.api.intuit.com" });
  });

  it("the rotated-token file wins over the env var, and stands in for it", () => {
    const dir = mkdtempSync(join(tmpdir(), "qbo-"));
    try {
      const file = join(dir, "nested", "token.txt");
      saveRefreshTokenToFile("rt-rotated", file);
      expect(readFileSync(file, "utf8").trim()).toBe("rt-rotated");
      const env = { QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_REALM_ID: "r", QBO_BASE_URL: "https://x.test/" };
      expect(qboConfigFromEnv({ ...env, QBO_REFRESH_TOKEN: "rt-env" }, file)).toMatchObject({ refreshToken: "rt-rotated", baseUrl: "https://x.test" });
      expect(qboConfigFromEnv(env, file).refreshToken).toBe("rt-rotated");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a rotated refresh token reaches the callback and is the one sent next time", async () => {
    const { fake, client, rotated } = setup();
    fake.rotateTo = "rt-1";
    await client.query("select * from Account where AccountType = 'Income' maxresults 1");
    expect(rotated).toEqual(["rt-1"]);
    fake.accessToken = "at-2"; // the old access token is now rejected: 401 → refresh once → retry
    const rows = await client.query("select * from Account where AccountType = 'Income' maxresults 1");
    expect(rows).toHaveLength(1);
    expect(fake.tokenRequests).toEqual(["rt-0", "rt-1"]);
    expect(rotated).toEqual(["rt-1"]); // unchanged token: no second callback
  });

  it("an unrotated token does not fire the callback", async () => {
    const { client, rotated } = setup();
    await client.query("select * from Account where AccountType = 'Income'");
    expect(rotated).toEqual([]);
  });

  it("retries 429 and 5xx up to three times, then surfaces the failure", async () => {
    const { fake, client } = setup();
    fake.failNext = [429, 503, 500];
    expect(await client.query("select * from Account where AccountType = 'Income'")).toHaveLength(1);
    fake.failNext = [500, 500, 500, 500];
    await expect(client.query("select * from Account where AccountType = 'Income'")).rejects.toThrow(/HTTP 500.*upstream sad/);
  });

  it("a second 401 is not retried forever", async () => {
    const { fake, client } = setup();
    fake.failNext = [401, 401];
    await expect(client.query("select * from Account where AccountType = 'Income'")).rejects.toThrow(/HTTP 401.*AuthenticationFailed/);
  });

  it("errors carry the QBO Fault text", async () => {
    const { client } = setup();
    await client.create("Customer", { DisplayName: "Dup Co" });
    await expect(client.create("Customer", { DisplayName: "Dup Co" })).rejects.toThrow(/Duplicate Name Exists Error.*6240/);
    await expect(client.read("Invoice", "999")).rejects.toThrow(/Object Not Found/);
  });

  it("opens A/R equal to the local subledger: earlier invoices still open are seeded, and cash the history applied is a Payment", async () => {
    const { db, fake, client } = setup();
    const global = generateGlobalJuly().world;
    const counts = await seedQuickBooks(db, global, client);
    const docs = fake.all("invoice").map((i) => String(i.DocNumber));
    expect(docs).toEqual(expect.arrayContaining(["INV-3181", "INV-3182", "INV-3183", "INV-3201"])); // Castellan's April to June, never paid
    expect(docs).not.toContain("INV-2404"); // a Q2 invoice the history settled stays out
    expect(counts.payment).toEqual({ created: 1, adopted: 0, skipped: 0, removed: 0 });
    const lumen = fake.all("invoice").find((i) => i.DocNumber === "INV-3191");
    expect(fake.all("payment")).toEqual([expect.objectContaining({
      PaymentRefNum: "BTX-300", TotalAmt: 6200, TxnDate: "2026-07-03", Line: [{ Amount: 6200, LinkedTxn: [{ TxnId: lumen?.Id, TxnType: "Invoice" }] }],
    })]);

    const again = await seedQuickBooks(db, global, client, { reset: true });
    expect(again.payment).toEqual({ created: 1, adopted: 0, skipped: 0, removed: 1 });
    expect(fake.all("payment")).toHaveLength(1);
  });

  it("escapes single quotes in query values and sends minorversion", async () => {
    const { fake, client } = setup();
    expect(qboEscape("O'Brien & Sons")).toBe("O\\'Brien & Sons");
    const made = await client.create<{ Id: string }>("Vendor", { DisplayName: "O'Brien & Sons" });
    const found = await client.query<{ Id: string }>(`select * from Vendor where DisplayName = '${qboEscape("O'Brien & Sons")}'`);
    expect(found.map((f) => f.Id)).toEqual([made.Id]);
    expect(fake.calls.at(-1)?.url).toContain("minorversion=75");
    expect(fake.calls.at(-1)?.url).toContain("/v3/company/R1/query?query=select%20*%20from%20Vendor");
  });
});
