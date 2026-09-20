import { describe, expect, it } from "vitest";
import type { ToolEnv } from "../../agents/env.js";
import { DEFAULT_CONFIG } from "../../runtime/config.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { auditorCallTool } from "../fence.js";
import { seedAudit } from "./helpers.js";

function auditorEnv(): ToolEnv {
  return {
    db: seedAudit(), clock: fixedClock, config: DEFAULT_CONFIG, mode: "live",
    actor: "agent:audit", tier: 0, autonomy_level: "shadow", intent_id: "int_open", decision_id: "dec_open",
  };
}

const error = (output: unknown): string => String((output as { error?: string }).error ?? "");

describe("auditor independence is enforced in the tool layer", () => {
  it("refuses preparer memory under both spellings", () => {
    const env = auditorEnv();
    for (const tool of ["memory_facts", "memory.facts", "memory.policies", "memory_similar_decisions"]) {
      const result = auditorCallTool(env, tool, { party_id: "initech", kind: "credit_memo", entry_date: "2026-07-14", amount_cents: 1 });
      expect(result.ok).toBe(false);
      expect(error(result.output)).toContain(tool);
    }
  });

  it("refuses every write tool: the auditor reads the record, it never writes to it", () => {
    const env = auditorEnv();
    for (const tool of ["propose_entry", "escalate", "record_fact_candidate"]) {
      const result = auditorCallTool(env, tool, {});
      expect(result.ok).toBe(false);
      expect(String((result.output as { reason?: string }).reason)).toContain("never writes");
    }
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM decision_step").get()).toEqual({ n: 0 });
  });

  it("lets a read tool through to callTool", () => {
    const env = auditorEnv();
    const result = auditorCallTool(env, "crm_owner", { party_id: "initech" });
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({ party_id: "initech", owner_user: "U_DANA" });
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM decision_step").get()).toEqual({ n: 1 });
  });

  it("refuses a denied tool without writing anything through it", () => {
    const env = auditorEnv();
    const before = db(env).prepare("SELECT COUNT(*) AS n FROM fact").get();
    auditorCallTool(env, "record_fact_candidate", { party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 } });
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM fact").get()).toEqual(before);
  });
});

const db = (env: ToolEnv) => env.db;
