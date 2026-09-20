import type { Db } from "../runtime/db.js";

/** Preserve posted books. A source amendment requires a new, reviewed correction, never an implicit unwind. */
export function invalidateEvidence(db: Db, oldTraceId: string, bankTxnId: string | null = null): string[] {
  const facts = db.prepare(`SELECT id FROM fact WHERE EXISTS
    (SELECT 1 FROM json_each(source_trace_ids_json) s WHERE s.value = ?)`).all(oldTraceId) as { id: string }[];
  for (const fact of facts) db.prepare("UPDATE fact SET status = 'candidate' WHERE id = ? AND status IN ('active','approved')").run(fact.id);
  const affected = db.prepare(`SELECT DISTINCT d.id, d.intent_id FROM decision d WHERE d.mode = 'live' AND (
    EXISTS (SELECT 1 FROM json_each(json_extract(d.proposal_json, '$.evidence')) e WHERE e.value ->> '$.trace_id' = ?)
    OR EXISTS (SELECT 1 FROM json_each(json_extract(d.proposal_json, '$.fact_refs')) r
      JOIN fact f ON f.id = r.value JOIN json_each(f.source_trace_ids_json) s WHERE s.value = ?)
    OR json_extract(d.proposal_json, '$.bank_txn_id') = ?)`)
    .all(oldTraceId, oldTraceId, bankTxnId) as { id: string; intent_id: string }[];
  for (const decision of affected) {
    db.prepare("UPDATE workpaper SET stale = 1 WHERE decision_id = ?").run(decision.id);
    db.prepare("UPDATE intent SET status = 'waiting_on_human', closed_at = NULL WHERE id = ?").run(decision.intent_id);
  }
  return affected.map(d => d.id);
}
