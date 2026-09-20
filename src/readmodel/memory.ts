import type { Db } from "../runtime/db.js";
import { getTrace, safeJson } from "../runtime/lookups.js";
import type { FactView, MemoryState } from "./types.js";

interface FactRow {
  id: string; party_id: string; predicate: string; value_json: string; status: string; uses: string;
  valid_from: string; valid_to: string; approved_by: string | null; source_trace_ids_json: string;
}

/** What the system is standing on: active facts it applies, and candidates still waiting for a person to approve. */
export function buildMemory(db: Db): MemoryState {
  const rows = db.prepare(
    "SELECT id, party_id, predicate, value_json, status, uses, valid_from, valid_to, approved_by, source_trace_ids_json FROM fact WHERE status IN ('active','candidate') ORDER BY learned_at",
  ).all() as FactRow[];
  const views = rows.map((row) => toFactView(db, row));
  return { active: views.filter((v) => v.status === "active"), candidate: views.filter((v) => v.status === "candidate") };
}

function toFactView(db: Db, row: FactRow): FactView {
  const ids = (safeJson(row.source_trace_ids_json) as string[] | null) ?? [];
  return {
    fact_id: row.id, party_id: row.party_id, predicate: row.predicate,
    value: (safeJson(row.value_json) as Record<string, unknown> | null) ?? {},
    status: row.status, uses: row.uses, valid_from: row.valid_from, valid_to: row.valid_to, approved_by: row.approved_by,
    source_traces: ids.flatMap((id) => { const t = getTrace(db, id); return t ? [{ trace_id: id, text: t.payload_text }] : []; }),
  };
}
