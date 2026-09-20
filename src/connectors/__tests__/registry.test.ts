import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { READ_TOOL_SPECS } from "../../agents/tools/read.js";
import { openWorldDb } from "../../ledger/db.js";
import { ingest } from "../../ingest/ingest.js";
import { buildConnectors, liveFromArgv } from "../index.js";
import { localTickets, ticketItems, type Ticket } from "../linear.js";
import { CONNECTORS, connectorDef, isRegisteredSource, LIVE_SOURCES } from "../registry.js";
import type { RawItem } from "../types.js";

const clock = { now: () => "2026-09-20T00:00:00Z" };

const TICKET: Ticket = {
  id: "ENG-412", identifier: "ENG-412", title: "Ingest API 503s for Halvorsen",
  body: "Halvorsen's ingest endpoint returned 503 for 6h on 2026-07-08. CSM promised a one-month SLA credit.",
  state: "Done", team: "ENG", labels: ["incident", "customer:halvorsen"], url: "https://linear.app/x/ENG-412",
  created_at: "2026-07-08T09:00:00Z", updated_at: "2026-07-09T16:00:00Z",
  comments: [{ id: "c1", author: "Dana", body: "Credit confirmed with the customer.", created_at: "2026-07-09T16:00:00Z" }],
};

describe("the connector registry is the one place a source is declared", () => {
  it("has a unique lowercase slug per source", () => {
    const slugs = CONNECTORS.map((c) => c.source);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z][a-z0-9_-]*$/);
  });

  it("registers every source the shipped connectors emit, and nothing else", () => {
    expect(isRegisteredSource("gmail")).toBe(true);
    expect(isRegisteredSource("linear")).toBe(true);
    expect(isRegisteredSource("notion")).toBe(false);
  });

  it("gives the investigator one search tool per source that declares one, named as the registry names it", () => {
    for (const def of CONNECTORS) {
      const declared = def.tool;
      if (!declared) continue;
      const tool = READ_TOOL_SPECS.find((t) => t.name === declared.name);
      expect(tool, `${def.source} declares tool ${declared.name}`).toBeDefined();
      expect(tool?.registry_name).toBe(declared.registry_name);
      expect(tool?.description).toContain(declared.describes);
    }
    // the point of the registry: the source added last session is already searchable
    expect(READ_TOOL_SPECS.map((t) => t.name)).toContain("tickets_search");
  });

  it("gives every tool a distinct name, so no source shadows another", () => {
    const names = READ_TOOL_SPECS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never marks a source search-before-escalating without giving it a tool to search with", () => {
    for (const def of CONNECTORS) {
      if (def.search_before_escalating) expect(def.tool, `${def.source} is in the escalation gate`).toBeDefined();
    }
  });

  it("accepts only registered live sources on --live", () => {
    expect([...liveFromArgv(["--live=gmail,slack"])]).toEqual(["gmail", "slack"]);
    expect(() => liveFromArgv(["--live=netsuite"])).toThrow(/Registered live sources/);
    expect(LIVE_SOURCES).toContain("linear");
  });

  it("builds one connector per registered source that can be pulled, in registry order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "conn-"));
    const built = await buildConnectors(new Set(), dir);
    expect(built.length).toBe(CONNECTORS.filter((c) => c.local).length);
    await expect(built[0]!.pull()).resolves.toEqual([]); // a missing store yields nothing, never an error
  });
});

describe("ingestion is gated on the registry, not on a schema enum", () => {
  it("ingests a source added purely by registering it", () => {
    const db = openWorldDb(":memory:");
    const result = ingest(db, ticketItems([TICKET]), clock);
    expect(result.committed).toBe(2); // the issue and its comment
    const rows = db.prepare("SELECT source, kind, external_id FROM trace ORDER BY external_id").all();
    expect(rows).toEqual([
      { source: "linear", kind: "issue", external_id: "ENG-412" },
      { source: "linear", kind: "comment", external_id: "ENG-412#c1" },
    ]);
    db.close();
  });

  it("refuses a source nobody registered, and says where to register it", () => {
    const db = openWorldDb(":memory:");
    const stray = { ...ticketItems([TICKET])[0]!, source: "notion" } as unknown as RawItem;
    const result = ingest(db, [stray], clock);
    expect(result).toMatchObject({ refused: 1, committed: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM trace").get()).toEqual({ n: 0 });
    const event = db.prepare("SELECT payload_json FROM event WHERE topic = 'ingest.refused'").get() as { payload_json: string };
    expect(event.payload_json).toContain("src/connectors/registry.ts");
    db.close();
  });
});

describe("the worked example: Linear", () => {
  it("resolves the party from a customer: label and keeps the source's own clocks", () => {
    const [issue, comment] = ticketItems([TICKET]);
    expect(issue?.party_hint).toEqual({ party_id: "halvorsen" });
    expect(issue?.event_time).toBe("2026-07-08T09:00:00Z");
    expect(issue?.recorded_time).toBe("2026-07-09T16:00:00Z"); // the ticket's clock, not ours
    expect(comment?.external_id).toBe("ENG-412#c1");
  });

  it("falls back to text resolution when no label names a customer", () => {
    const [issue] = ticketItems([{ ...TICKET, labels: ["incident"] }]);
    expect(issue?.party_hint).toEqual({ text: `${TICKET.title} ${TICKET.body}` });
  });

  it("reads the offline store, and yields nothing when it is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "linear-"));
    await expect(localTickets(dir).pull()).resolves.toEqual([]);
    writeFileSync(join(dir, "linear.json"), JSON.stringify({ issues: [TICKET] }));
    const items = await localTickets(dir).pull();
    expect(items.map((i) => i.kind)).toEqual(["issue", "comment"]);
  });

  it("is described to the agent in the registry's own words", () => {
    expect(connectorDef("linear")?.tool?.describes).toMatch(/Linear/);
  });
});
