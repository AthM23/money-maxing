import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gate } from "../gate.js";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (await gate("open sesame", req, res)) return;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("let through");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())));

function signIn(password: string): Promise<Response> {
  return fetch(`${base}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password }) });
}

describe("the dashboard behind a password", () => {
  it("leaves the marketing page open and asks for the password everywhere else", async () => {
    expect(await (await fetch(`${base}/`)).text()).toBe("let through");
    const page = await fetch(`${base}/dashboard`);
    expect(page.status).toBe(401);
    expect(await page.text()).toContain('action="/login"');
    for (const path of ["/app.js", "/views/case.js", "/api/overview"]) expect((await fetch(`${base}${path}`)).status).toBe(401);
    const api = await fetch(`${base}/api/do/audit`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect([api.status, await api.json()]).toEqual([401, { error: "Sign in at /dashboard first." }]);
  });

  it("refuses a wrong password and says so", async () => {
    const wrong = await signIn("open sesame ");
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect(await wrong.text()).toContain("That is not the password.");
  });

  it("remembers the browser for thirty days, in a cookie that is not the password", async () => {
    const right = await signIn("open sesame");
    expect([right.status, right.headers.get("location")]).toEqual([303, "/dashboard"]);
    const cookie = right.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^mm_dashboard=[0-9a-f]{64}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
    expect(cookie).not.toContain("sesame");
    const held = cookie.split(";")[0]!;
    expect(await (await fetch(`${base}/api/overview`, { headers: { cookie: `other=1; ${held}` } })).text()).toBe("let through");
    expect((await fetch(`${base}/dashboard`, { headers: { cookie: `${held.slice(0, -1)}x` } })).status).toBe(401);
  });

  it("marks the cookie Secure when the request came over TLS", async () => {
    const right = await fetch(`${base}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-proto": "https" }, body: "password=open+sesame" });
    expect(right.headers.get("set-cookie")).toMatch(/; Secure$/);
  });
});
