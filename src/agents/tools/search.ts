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
const CANDIDATE_LIMIT = 2000;
const STOPWORDS: ReadonlySet<string> = new Set(["the", "and", "for", "with", "from", "that", "this", "was", "are", "has", "have", "not", "any", "about", "into", "inv"]);

export interface ScoredHit extends TraceHit {
  /** How many of the query's distinct terms appear in the document. Ranked by this, then by recency. */
  matched_terms: number;
  of_terms: number;
}

/**
 * Ranked text search over ingested traces of the given sources. A document matches if it contains ANY query term and
 * ranks by how many it contains, so a query with one wrong word still finds the right email. In replay the as-of
 * guard is applied here, in SQL, so a tool physically cannot return anything the company did not yet know.
 */
export function searchTraces(env: ToolEnv, sources: string[], query: string, partyId?: string, limit = 8): ScoredHit[] {
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9%$.-]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)))].slice(0, 12);
  if (terms.length === 0) return [];
  const where = [`source IN (${sources.map(() => "?").join(",")})`];
  const args: Array<string | number> = [...sources];
  if (env.mode === "replay" && env.as_of) { where.push("recorded_time <= ?"); args.push(env.as_of); }
  if (partyId) { where.push("(party_id = ? OR party_id IS NULL)"); args.push(partyId); }
  const rows = env.db
    .prepare(`SELECT id, source, kind, recorded_time, party_id, payload_json FROM trace WHERE ${where.join(" AND ")} ORDER BY recorded_time DESC LIMIT ?`)
    .all(...args, CANDIDATE_LIMIT) as TraceRow[];
  const scored = rows.map((row) => score(row, terms)).filter((h) => h.matched_terms > 0);
  scored.sort((a, b) => b.matched_terms - a.matched_terms || (a.recorded_time < b.recorded_time ? 1 : -1));
  return scored.slice(0, limit);
}

function score(row: TraceRow, terms: string[]): ScoredHit {
  const text = payloadText(row.payload_json);
  const lower = text.toLowerCase();
  const found = terms.filter((t) => lower.includes(t));
  const at = found[0] ? Math.max(0, lower.indexOf(found[0]) - 80) : 0;
  return {
    trace_id: row.id, source: row.source, kind: row.kind, recorded_time: row.recorded_time, party_id: row.party_id,
    snippet: text.slice(at, at + SNIPPET), matched_terms: found.length, of_terms: terms.length,
  };
}

export function readTrace(env: ToolEnv, traceId: string): { trace_id: string; recorded_time: string; text: string } | null {
  const row = env.db.prepare("SELECT id, recorded_time, payload_json FROM trace WHERE id = ?")
    .get(traceId) as { id: string; recorded_time: string; payload_json: string } | undefined;
  if (!row) return null;
  if (env.mode === "replay" && env.as_of && row.recorded_time > env.as_of) return null;
  return { trace_id: row.id, recorded_time: row.recorded_time, text: payloadText(row.payload_json) };
}

