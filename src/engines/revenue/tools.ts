import { z } from "zod";
import type { ToolSpec } from "../../agents/tools/read.js";
import type { Db } from "../../ledger/db.js";
import { activeSchedule, ensureSchedules, recognisedStatus, scheduleVersions } from "./store.js";

/** What `rev.schedule` answers for one contract: the active schedule, how each month stands, and how it got here. */
export function scheduleView(db: Db, contractId: string): Record<string, unknown> {
  const active = activeSchedule(db, contractId);
  const versions = scheduleVersions(db, contractId).map((v) => ({ id: v.id, version: v.version, status: v.status, total_cents: v.total_cents, modification_id: v.modification_id, created_at: v.created_at }));
  const modifications = db
    .prepare(
      `SELECT id, cause_decision_id, cause_intent_id, treatment, pct_off_bps, effective_period, until, memo_cents, memo_account,
              delta_total_cents, from_version, to_version, fact_id, created_at
       FROM contract_modification WHERE contract_id = ? ORDER BY rowid`,
    )
    .all(contractId);
  return {
    contract_id: contractId, party_id: active?.party_id ?? null,
    active: active ? { id: active.id, version: active.version, method: active.method, total_cents: active.total_cents } : null,
    lines: (active?.lines ?? []).map((l) => ({ ...l, recognised: recognisedStatus(db, contractId, l.period) })),
    versions, modifications,
  };
}

/**
 * Revenue read tool in Person A's ToolSpec shape. Not wired into src/agents: spread REVENUE_TOOL_SPECS into the
 * tool list to give it to an agent. Live only, like the ledger tools: a schedule knows how the future was revised.
 */
export const REVENUE_TOOL_SPECS: ToolSpec[] = [
  {
    name: "rev_schedule", registry_name: "rev.schedule", input: z.object({ contract_id: z.string().min(1).optional(), party_id: z.string().min(1).optional() }),
    description: "Revenue schedule for a contract (or every contract of a party): active version, monthly lines in integer cents with their recognition status, all versions, and the contract modifications that revised it.",
    run: (i, env) => {
      if (env.mode === "replay") return { error: "not available in replay: the schedule already knows how later months were revised" };
      if (!i.contract_id && !i.party_id) return { error: "give contract_id or party_id" };
      ensureSchedules(env.db, env.clock);
      const ids = i.contract_id
        ? (env.db.prepare("SELECT id FROM contract WHERE id = ?").all(String(i.contract_id)) as { id: string }[])
        : (env.db.prepare("SELECT id FROM contract WHERE party_id = ? ORDER BY start_date").all(String(i.party_id)) as { id: string }[]);
      if (ids.length === 0) return { error: "no such contract" };
      return { schedules: ids.map((c) => scheduleView(env.db, c.id)) };
    },
  },
];
