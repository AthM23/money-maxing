import { payloadText } from "../../runtime/payloadText.js";
import type { ToolEnv } from "../env.js";

export interface TraceHit {
  trace_id: string;
  source: string;
  kind: string;
  recorded_time: string;
  party_id: string | null;
  snippet: string;
}

interface TraceRow { id: string; source: string; kind: string; recorded_time: string; party_id: string | null; payload_json: string }

const SNIPPET = 280;

/**
 * Text search over ingested traces of given sources. In replay the as-of guard is applied here, in SQL,
 * so a tool physically cannot return anything the company did not yet know.
 */
export function searchTraces(env: ToolEnv, sources: string[], query: string, partyId?: string, limit = 8): TraceHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1).slice(0, 6);
  const where = [`source IN (${sources.map(() => "?").join(",")})`];
  const args: Array<string | number> = [...sources];
  if (env.mode === "replay" && env.as_of) { where.push("recorded_time <= ?"); args.push(env.as_of); }
  if (partyId) { where.push("(party_id = ? OR party_id IS NULL)"); args.push(partyId); }
  for (const term of terms) { where.push("LOWER(payload_json) LIKE ?"); args.push(`%${term}%`); }
  const rows = env.db
    .prepare(`SELECT id, source, kind, recorded_time, party_id, payload_json FROM trace WHERE ${where.join(" AND ")} ORDER BY recorded_time DESC LIMIT ?`)
    .all(...args, limit) as TraceRow[];
  return rows.map((r) => toHit(r, terms[0]));
}

export function readTrace(env: ToolEnv, traceId: string): { trace_id: string; recorded_time: string; text: string } | null {
  const row = env.db.prepare("SELECT id, recorded_time, payload_json FROM trace WHERE id = ?")
    .get(traceId) as { id: string; recorded_time: string; payload_json: string } | undefined;
  if (!row) return null;
  if (env.mode === "replay" && env.as_of && row.recorded_time > env.as_of) return null;
  return { trace_id: row.id, recorded_time: row.recorded_time, text: payloadText(row.payload_json) };
}

function toHit(row: TraceRow, firstTerm?: string): TraceHit {
  const text = payloadText(row.payload_json);
  const at = firstTerm ? Math.max(0, text.toLowerCase().indexOf(firstTerm) - 80) : 0;
  return { trace_id: row.id, source: row.source, kind: row.kind, recorded_time: row.recorded_time, party_id: row.party_id, snippet: text.slice(at, at + SNIPPET) };
}
