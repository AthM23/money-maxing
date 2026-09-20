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

  const question = {
    asked_user: "U_DANA", party_id: "initech", predicate: "shortfall_reason", decision_kind: "credit_memo", what_happened: "short",
    what_was_checked: [{ source: "mail", query: "x", hits: 0 }], what_is_unknown: "why", treatments: [{ id: "credit_memo", label: "a" }, { id: "chase", label: "b" }],
  };

  it("the cheapest tier may not ask a person until it has looked everywhere an answer could be, and saying so is not enough", () => {
    const e = { ...env(), tier: 1, max_tier: 3 };
    // It claims to have checked mail. The record says it has looked nowhere.
    const refused = callTool(e, "escalate", question).output as { status: string; reason: string };
    expect(refused.status).toBe("handed_up");
    // the gate is the set the registry marks search_before_escalating, whatever order the registry lists them in
    expect(refused.reason.match(/Not looked in yet: (.+?)\./)?.[1]?.split(", ").sort())
      .toEqual(["chat_search", "contracts_find_clause", "mail_search", "memory_facts", "policy_memo_lookup"]);
    expect(e.db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 0 });

    callTool(e, "memory_facts", { party_id: "initech", kind: "credit_memo", entry_date: "2026-07-12", amount_cents: 120000 });
    callTool(e, "mail_search", { query: "Initech credit", party_id: "initech" });
    callTool(e, "chat_search", { query: "Initech credit", party_id: "initech" });
    const partly = callTool(e, "escalate", question).output as { status: string; reason: string };
    expect(partly.status).toBe("handed_up");
    expect(partly.reason.match(/Not looked in yet: (.+?)\./)?.[1]?.split(", ").sort()).toEqual(["contracts_find_clause", "policy_memo_lookup"]);

    callTool(e, "policy_memo_lookup", { query: "credit" });
    callTool(e, "contracts_find_clause", { query: "credit", party_id: "initech" });
    expect(callTool(e, "escalate", question).output).toMatchObject({ status: "opened" });
    expect(e.db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 1 });
  });

  it("a stronger tier's lookups do not count for the cheap one: each turn earns its own question", () => {
    const strong = { ...env(), tier: 2, max_tier: 3 };
    for (const [tool, input] of [["memory_facts", { party_id: "initech", kind: "credit_memo", entry_date: "2026-07-12", amount_cents: 120000 }], ["mail_search", { query: "x", party_id: "initech" }],
      ["chat_search", { query: "x", party_id: "initech" }], ["policy_memo_lookup", { query: "x" }], ["contracts_find_clause", { query: "x", party_id: "initech" }]] as const) callTool(strong, tool, input);
    expect(callTool({ ...strong, tier: 1 }, "escalate", question).output).toMatchObject({ status: "handed_up" });
  });
});
