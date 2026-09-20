import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../runtime/config.js";
import { openDb } from "../../runtime/db.js";
import { openDecision } from "../../runtime/persist.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { seedDemoWorld } from "../../demo/seed.js";
import type { ToolEnv } from "../env.js";
import { callTool } from "../toolset.js";

function env(mode: "live" | "replay" = "live", asOf?: string): ToolEnv {
  const db = openDb();
  seedDemoWorld(db);
  const decisionId = openDecision(db, fixedClock, { intent_id: "int_initech", function: "ar", mode, actor: "agent:ar", autonomy_level: "auto" });
  return { db, clock: fixedClock, config: DEFAULT_CONFIG, mode, as_of: asOf, actor: "agent:ar", tier: 2, max_tier: 3, autonomy_level: "auto", intent_id: "int_initech", decision_id: decisionId };
}

describe("ranked search: a query with wrong words still finds the right document", () => {
  it("finds the CEO's email from a query the email only partly matches, and ranks it first", () => {
    const hits = callTool(env(), "mail_search", { query: "Initech discount shortfall INV-1042 platform fee renewal", party_id: "initech" }).output as { trace_id: string; matched_terms: number }[];
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0]!.trace_id).toBe("tr_mail_2");
  });

  it("returns nothing for a query that matches nothing, and only stopwords is an empty search", () => {
    expect(callTool(env(), "mail_search", { query: "zebra quantum" }).output).toEqual([]);
    expect(callTool(env(), "mail_search", { query: "the and for" }).output).toEqual([]);
  });

  it("in replay, mail recorded after the as-of instant cannot be found", () => {
    const hits = callTool(env("replay", "2026-06-25T00:00:00Z"), "mail_search", { query: "Initech platform fee renewal", party_id: "initech" }).output as { trace_id: string }[];
    expect(hits.map((h) => h.trace_id)).toEqual(["tr_mail_1"]);
  });

  it("the cheapest tier cannot ask a person while a stronger tier exists", () => {
    const e = { ...env(), tier: 1 };
    const r = callTool(e, "escalate", {
      asked_user: "U_DANA", party_id: "initech", predicate: "shortfall_reason", decision_kind: "credit_memo", what_happened: "short",
      what_was_checked: [{ source: "mail", query: "x", hits: 0 }], what_is_unknown: "why", treatments: [{ id: "credit_memo", label: "a" }, { id: "chase", label: "b" }],
    });
    expect(r.output).toMatchObject({ status: "handed_up" });
    expect(e.db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 0 });
  });
});
