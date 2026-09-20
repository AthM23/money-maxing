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

const CARRIED_TABLES = ["trace", "fact", "policy", "autonomy"] as const;

/** Table and column names come from this file and from the source schema, never from input; values are bound. */
function insertRows(to: Db, table: (typeof CARRIED_TABLES)[number], rows: Row[], replace = false): number {
  let written = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const sql = `INSERT OR ${replace ? "REPLACE" : "IGNORE"} INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    written += to.prepare(sql).run(...cols.map((c) => row[c])).changes;
  }
  return written;
}
