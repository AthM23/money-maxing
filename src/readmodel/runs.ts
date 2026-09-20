import type { Db } from "../runtime/db.js";
import { UNSETTLED_ACTOR } from "../runtime/intentStatus.js";
import { safeJson } from "../runtime/lookups.js";

/**
 * One row per case, the way a tracing tool lists runs: who worked it, how many lookups and model calls it took, what
 * it cost and how it stands. The trace itself is `buildCaseTrace`; this is the list you pick one from. Read-only.
 */
export interface RunRow {
  intent_id: string;
  party: string | null;
  docs: string[];
  status: string;
  shortfall_cents: number;
  /** Who took a turn, cheapest first: code, reader, haiku, sonnet, opus, controller, person. */
  workers: string[];
  turns: number;
  tool_calls: number;
  model_calls: number;
  cost_micros: number;
  busy_ms: number;
  kernel_refusals: number;
  last_at: string | null;
}

const ORDER = ["code", "reader", "haiku", "sonnet", "opus", "controller", "person"];
const TIER_NAMES: Record<number, string> = { 1: "haiku", 2: "sonnet", 3: "opus" };

interface Agg { intent_id: string; turns: number; model_calls: number; cost_micros: number; busy_ms: number; last_at: string | null }

export function buildRuns(db: Db): RunRow[] {
  const intents = db
    .prepare(
      `SELECT i.id, i.status, i.case_json, COALESCE(p.name, json_extract(i.case_json, '$.party_id')) AS party
       FROM intent i LEFT JOIN party p ON p.id = json_extract(i.case_json, '$.party_id')
       WHERE i.case_json IS NOT NULL AND i.owner != 'replay' ORDER BY i.created_at, i.id`,
    )
    .all() as { id: string; status: string; case_json: string; party: string | null }[];
  const totals = new Map((db
    .prepare(
      `SELECT d.intent_id, COUNT(*) AS turns, COALESCE(SUM(d.model_calls), 0) AS model_calls, COALESCE(SUM(d.cost_micros), 0) AS cost_micros,
              COALESCE(SUM(d.latency_ms), 0) AS busy_ms, MAX(d.created_at) AS last_at
       FROM decision d WHERE d.mode = 'live' AND d.actor NOT IN ('seed', ?) GROUP BY d.intent_id`,
    )
    .all(UNSETTLED_ACTOR) as Agg[]).map((a) => [a.intent_id, a]));
  return intents.map((i) => {
    const c = safeJson(i.case_json) as { doc_ids?: string[]; shortfall_cents?: number } | null;
    const t = totals.get(i.id);
    return {
      intent_id: i.id, party: i.party, docs: c?.doc_ids ?? [], status: i.status, shortfall_cents: c?.shortfall_cents ?? 0, workers: workersOf(db, i.id),
      turns: t?.turns ?? 0, model_calls: t?.model_calls ?? 0, cost_micros: t?.cost_micros ?? 0, busy_ms: t?.busy_ms || workingMs(db, i.id), last_at: t?.last_at ?? null, ...stepsOf(db, i.id),
    };
  });
}

function workersOf(db: Db, intentId: string): string[] {
  // The router's "nothing settled this" row still says who looked: a case code tried and could not settle was worked by code.
  const rows = db.prepare("SELECT DISTINCT actor, COALESCE(tier, 0) AS tier FROM decision WHERE intent_id = ? AND mode = 'live' AND actor != 'seed'")
    .all(intentId) as { actor: string; tier: number }[];
  const seen = new Set(rows.map((r) => (r.actor.startsWith("reader:") ? "reader" : r.actor.startsWith("controller") ? "controller" : r.tier >= 1 ? TIER_NAMES[r.tier] ?? `tier ${r.tier}` : "code")));
  const people = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM approval a JOIN decision d ON d.id = a.decision_id WHERE d.intent_id = ? AND a.approver_kind = 'human')
            + (SELECT COUNT(*) FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE d.intent_id = ? AND e.answered_at IS NOT NULL) AS n`,
    )
    .get(intentId, intentId) as { n: number };
  if (people.n > 0) seen.add("person");
  return [...seen].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

function stepsOf(db: Db, intentId: string): { tool_calls: number; kernel_refusals: number } {
  return db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN s.kind = 'tool_call' AND s.tool NOT IN ('propose_entry','escalate') THEN 1 ELSE 0 END), 0) AS tool_calls,
              COALESCE(SUM(CASE WHEN s.tool = 'propose_entry' AND json_extract(s.output_json, '$.status') IN ('rejected','blocked') THEN 1 ELSE 0 END), 0) AS kernel_refusals
       FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE d.intent_id = ? AND d.mode = 'live'`,
    )
    .get(intentId) as { tool_calls: number; kernel_refusals: number };
}

/** Where a turn's latency was not recorded, its working time is read off its own steps: first to last, per turn, summed. */
function workingMs(db: Db, intentId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ms), 0) AS ms FROM (
         SELECT (julianday(MAX(s.ts)) - julianday(MIN(s.ts))) * 86400000.0 AS ms
         FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE d.intent_id = ? AND d.mode = 'live' GROUP BY d.id)`,
    )
    .get(intentId) as { ms: number };
  return Math.round(row.ms);
}
