import { describe, expect, it } from "vitest";
import { QboClient, type FetchLike } from "../../connectors/qboClient.js";
import { mirrorRequestId } from "../payloads.js";
import { qboLike } from "../types.js";

/**
 * A 5xx on a create may mean "made, then the gateway gave up". The real client, behind the mirror's adapter, against a
 * scripted fetch: no network. What Intuit does with a repeated `requestid` is UNVERIFIED (never exercised live).
 */

interface Call { url: string; method: string }

function clientWith(statuses: number[]): { client: QboClient; posts: () => Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), { status: 200 });
    const status = statuses.shift() ?? 200;
    if (status !== 200) return new Response("<html>gateway timeout</html>", { status });
    const body = url.includes("/upload") ? { AttachableResponse: [{ Attachable: { Id: "5000" } }] } : { Payment: { Id: "321", SyncToken: "0" } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const client = new QboClient({ clientId: "id", clientSecret: "secret", realmId: "123", refreshToken: "rt", baseUrl: "https://qbo.test" }, { fetch: fetchFn, onRefreshToken: () => {}, sleep: async () => {} });
  return { client, posts: () => calls.filter((c) => c.method === "POST" && !c.url.includes("oauth2")) };
}

const BODY = { CustomerRef: { value: "64" }, TotalAmt: 10800 };

describe("create after a 5xx", () => {
  it("REGRESSION a create WITHOUT a requestid is sent exactly once: a 504 is an error, not a second POST", async () => {
    const { client, posts } = clientWith([504, 200]);
    await expect(qboLike(client).create("Payment", BODY)).rejects.toThrow(/HTTP 504/);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.url).toBe("https://qbo.test/v3/company/123/payment?minorversion=75");
  });

  it("a create WITH a requestid is sent again after a 504, under the same requestid both times", async () => {
    const { client, posts } = clientWith([504, 200]);
    const requestId = mirrorRequestId("Payment", ["BTX-0070", "64"]);
    const made = await qboLike(client).create("Payment", BODY, { requestId });
    expect(made.Id).toBe("321");
    expect(posts().map((c) => c.url)).toEqual(Array(2).fill(`https://qbo.test/v3/company/123/payment?minorversion=75&requestid=${requestId}`));
  });

  it("REGRESSION an upload is never sent again after a 5xx", async () => {
    const { client, posts } = clientWith([503, 200]);
    await expect(qboLike(client).upload({ entity_type: "CreditMemo", entity_id: "900", file_name: "w.txt", content_type: "text/plain", content: "x" })).rejects.toThrow(/HTTP 503/);
    expect(posts()).toHaveLength(1);
  });

  it("a 429 turned the request away, so even a create without a requestid is sent again", async () => {
    const { client, posts } = clientWith([429, 200]);
    await expect(qboLike(client).create("Payment", BODY)).resolves.toMatchObject({ Id: "321" });
    expect(posts()).toHaveLength(2);
  });

  it("a requestid longer than Intuit's 50 characters is refused before anything is sent", async () => {
    const { client, posts } = clientWith([]);
    await expect(qboLike(client).create("Payment", BODY, { requestId: "x".repeat(51) })).rejects.toThrow(/requestid must be 1 to 50/);
    expect(posts()).toHaveLength(0);
  });
});
