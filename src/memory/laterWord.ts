import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";

/**
 * A remembered answer rests on something somebody wrote. If the same person, or the same thread, has written about
 * that customer again since, the memory may have been taken back ("I am withdrawing the 10%"), and nothing in the
 * new message says which fact it touches. Code does not try to read that: it reports that there is a later word, and
 * the kernel makes the entry wait for a person. A person's own answer in this system has no later word until they
 * answer again.
 */
export interface LaterWord { trace_id: string; at: string }

interface Said { id: string; event_time: string; who: string | null; thread: string | null }

const thread = (subject: unknown): string | null => (typeof subject === "string" && subject.trim() ? subject.replace(/^((re|fwd?|aw):\s*)+/i, "").trim().toLowerCase() : null);

function said(row: { id: string; event_time: string; payload_json: string }): Said {
  const p = safeJson(row.payload_json) as { from?: unknown; user?: unknown; answerer?: unknown; subject?: unknown; channel?: unknown } | null;
  const who = [p?.from, p?.user, p?.answerer].find((x): x is string => typeof x === "string" && x.length > 0) ?? null;
  return { id: row.id, event_time: row.event_time, who: who?.toLowerCase() ?? null, thread: thread(p?.subject) ?? (typeof p?.channel === "string" ? `#${p.channel}` : null) };
}

export function laterWordOnFact(db: Db, factId: string): LaterWord[] {
  const fact = db.prepare("SELECT party_id, source_trace_ids_json FROM fact WHERE id = ?").get(factId) as { party_id: string; source_trace_ids_json: string } | undefined;
  const sourceIds = (safeJson(fact?.source_trace_ids_json ?? "[]") as string[] | null) ?? [];
  if (!fact || sourceIds.length === 0) return [];
  const load = db.prepare("SELECT id, event_time, payload_json FROM trace WHERE id = ?");
  const sources = sourceIds.flatMap((id) => { const row = load.get(id) as { id: string; event_time: string; payload_json: string } | undefined; return row ? [said(row)] : []; });
  if (sources.length === 0) return [];
  const since = sources.map((s) => s.event_time).sort()[0]!;
  const later = db
    .prepare(
      `SELECT t.id, t.event_time, t.payload_json FROM trace t
       WHERE t.party_id = ? AND t.kind IN ('email', 'chat_message') AND t.event_time > ?
         AND t.version = (SELECT MAX(v.version) FROM trace v WHERE v.source = t.source AND v.external_id = t.external_id)
       ORDER BY t.event_time`,
    )
    .all(fact.party_id, since) as { id: string; event_time: string; payload_json: string }[];
  return later.map(said)
    .filter((m) => !sourceIds.includes(m.id) && sources.some((s) => m.event_time > s.event_time && ((s.who !== null && s.who === m.who) || (s.thread !== null && s.thread === m.thread))))
    .map((m) => ({ trace_id: m.id, at: m.event_time }));
}
