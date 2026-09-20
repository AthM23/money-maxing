import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDb } from "../../src/runtime/db.js";
import { handle, PAGES } from "../app.js";
import { gate } from "../gate.js";

let server: Server;
let base: string;

// The hosted shape: the gate in front, the read-only handler behind it.
beforeAll(async () => {
  const db = openDb();
  server = createServer(async (req, res) => {
    if (await gate("open sesame", req, res)) return;
    await handle(db, null, true, req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())));

describe("the self-contained pages beside the marketing page", () => {
  it("serves each one to a visitor who has not signed in, under the marketing page's own content policy", async () => {
    for (const path of Object.keys(PAGES)) {
      const res = await fetch(`${base}${path}`);
      expect([path, res.status, res.headers.get("content-type")]).toEqual([path, 200, "text/html; charset=utf-8"]);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(await res.text()).toContain("<title>Money Maxer");
    }
  });

  it("answers the file names those pages use to link to each other: index.html is the marketing page, not the workspace", async () => {
    const home = await (await fetch(`${base}/`)).text();
    const byName = await fetch(`${base}/index.html`);
    expect([byName.status, await byName.text()]).toEqual([200, home]);
    expect(home).not.toContain("/app.js"); // the workspace's own index.html loads it; the marketing page does not
  });

  it("opens nothing else by it: a neighbouring address still asks for the password", async () => {
    for (const path of ["/flow/", "/flow.htm", "/flowx", "/frontend/flow.html", "/flow/../app.js"]) expect([path, (await fetch(`${base}${path}`)).status]).toEqual([path, 401]);
  });
});
