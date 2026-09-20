import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";

export interface CarryReport {
  facts: number;
  policies: number;
  autonomy_rows: number;
  traces: number;
}

type Row = Record<string, unknown>;

/**
 * Carry what was learned into another copy of the world, and nothing else: active facts with the sources they
 * cite, approved policies, and the earned ladder. No decisions, no entries, no answers. Run against a cold copy of
 * the same month, the only thing that differs between the two runs is memory.
 */
export function carryMemory(from: Db, to: Db): CarryReport {
  const facts = from.prepare("SELECT * FROM fact WHERE status = 'active'").all() as Row[];
  const traceIds = new Set(facts.flatMap((f) => (safeJson(String(f.source_trace_ids_json)) as string[] | null) ?? []));
  const traces = [...traceIds].flatMap((id) => {
    const row = from.prepare("SELECT * FROM trace WHERE id = ?").get(id) as Row | undefined;
    return row ? [row] : [];
  });
  const policies = from.prepare("SELECT * FROM policy WHERE status = 'approved'").all() as Row[];
  const autonomy = from.prepare("SELECT * FROM autonomy").all() as Row[];
  const run = to.transaction(() => ({
    traces: insertRows(to, "trace", traces),
    facts: insertRows(to, "fact", facts),
    policies: insertRows(to, "policy", policies),
    autonomy_rows: insertRows(to, "autonomy", autonomy, true),
  }));
  return run();
}

/** The columns carried, fixed here. The source file's own schema is never trusted to name them. */
const CARRIED: Record<"trace" | "fact" | "policy" | "autonomy", readonly string[]> = {
  trace: ["id", "source", "kind", "external_id", "event_time", "recorded_time", "ingested_at", "party_id", "version", "content_hash", "payload_json"],
  fact: ["id", "party_id", "predicate", "value_json", "scope_json", "explained_amount_cents", "max_amount_cents", "uses", "valid_from", "valid_to",
    "learned_at", "source_trace_ids_json", "stated_by", "approved_by", "status", "supersedes"],
  policy: ["id", "function", "name", "condition_json", "action_json", "intent_text", "tier", "max_amount_cents", "backtest_json", "status",
    "approved_by", "approved_at", "code", "version", "supersedes"],
  autonomy: ["function", "kind", "agree", "n", "covered", "level", "updated_at"],
};

function insertRows(to: Db, table: keyof typeof CARRIED, rows: Row[], replace = false): number {
  const cols = CARRIED[table];
  const sql = `INSERT OR ${replace ? "REPLACE" : "IGNORE"} INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  const insert = to.prepare(sql);
  let written = 0;
  for (const row of rows) written += insert.run(...cols.map((c) => row[c] ?? null)).changes;
  return written;
}
