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

  it("lets an allow-listed read tool through to callTool", () => {
    const env = auditorEnv();
    const result = auditorCallTool(env, "ledger_open_invoices", { party_id: "initech" });
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject([{ id: "INV-1042", open_cents: 1_200_000 }]);
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM decision_step").get()).toEqual({ n: 1 });
  });

  it("refuses a tool nobody has thought of yet: the fence is an allow-list, not a list of known bad names", () => {
    const env = auditorEnv();
    for (const tool of ["ledger_write_off_everything", "slack_post_message", "crm_owner"]) {
      const result = auditorCallTool(env, tool, {});
      expect(result.ok).toBe(false);
      expect(error(result.output)).toContain("allow-list");
    }
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM decision_step").get()).toEqual({ n: 0 });
  });

  it("refuses the close workbook: reviewer comments are the preparer's own working papers", () => {
    const env = auditorEnv();
    for (const tool of ["workbook_lookup", "workbook.lookup"]) {
      expect(auditorCallTool(env, tool, { query: "july close" }).ok).toBe(false);
    }
  });

  it("refuses a denied tool without writing anything through it", () => {
    const env = auditorEnv();
    const before = db(env).prepare("SELECT COUNT(*) AS n FROM fact").get();
    auditorCallTool(env, "record_fact_candidate", { party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 } });
    expect(db(env).prepare("SELECT COUNT(*) AS n FROM fact").get()).toEqual(before);
  });
});

const db = (env: ToolEnv) => env.db;
