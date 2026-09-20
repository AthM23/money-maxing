import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildMcpServer, latestPeriod } from "../mcp.js";
import { TOOLS } from "../tools.js";
import { workedWorld } from "./world.js";

async function connected() {
  const db = await workedWorld();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([buildMcpServer(db, latestPeriod(db)).connect(serverSide), client.connect(clientSide)]);
  return { db, client };
}

const textOf = (result: unknown): string => ((result as { content: { type: string; text?: string }[] }).content ?? []).map((c) => c.text ?? "").join("\n");

describe("the books over the Model Context Protocol", () => {
  it("offers the same tools as the Ask page, every one marked read-only", async () => {
    const { client } = await connected();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    expect(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false)).toBe(true);
    expect(tools.find((t) => t.name === "explain_receipt")?.inputSchema.required).toEqual(["customer"]);
  });

  it("answers with amounts already written out by code, and says where they came from", async () => {
    const { client } = await connected();
    const text = textOf(await client.callTool({ name: "explain_receipt", arguments: { customer: "Vossberg" } }));
    expect(text).toContain("Vossberg Logistik GmbH: $4,200.00 short");
    expect(text).toContain("Amount: USD 105,800.00");
    expect(text).toContain("Amount: USD 1,960.00");
    expect(text).not.toMatch(/10580000|196000/);
    expect(text).toContain("Computed by code from:");
  });

  it("changes nothing in the books, and refuses input a tool does not take", async () => {
    const { db, client } = await connected();
    const count = (): unknown => db.prepare("SELECT (SELECT COUNT(*) FROM decision) + (SELECT COUNT(*) FROM gl_line) + (SELECT COUNT(*) FROM event) AS n").get();
    const before = count();
    for (const t of TOOLS) await client.callTool({ name: t.name, arguments: t.name === "explain_receipt" ? { customer: "Vossberg" } : {} });
    expect(count()).toEqual(before);
    const bad = await client.callTool({ name: "explain_receipt", arguments: { customer: "x" } }).catch((err: unknown) => ({ isError: true, content: [{ type: "text", text: String(err) }] }));
    expect((bad as { isError?: boolean }).isError).toBe(true);
  });
});
