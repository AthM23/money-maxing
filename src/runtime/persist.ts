import type { AutonomyLevel, BlockRule, KernelResult, Proposal, Route } from "../contract/types.js";
import type { Clock } from "./config.js";
import type { Db } from "./db.js";
import { emit } from "./events.js";
import { newId } from "./ids.js";

export interface DecisionMeta {
  actor: string;
  mode: "live" | "replay";
  autonomy_level: AutonomyLevel;
  tier?: number;
  decision_point_id?: string;
}

export function insertDecision(db: Db, clock: Clock, proposal: Proposal, meta: DecisionMeta): string {
  const id = newId("dec");
  db.prepare(
    `INSERT INTO decision (id, intent_id, function, mode, decision_point_id, kind, proposal_json, actor, autonomy_level, tier, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, proposal.intent_id, proposal.function, meta.mode, meta.decision_point_id ?? null, proposal.kind,
    canonicalJson(proposal), meta.actor, meta.autonomy_level, meta.tier ?? null, clock.now());
  return id;
}

export function setRoute(db: Db, decisionId: string, route: Route): void {
  db.prepare("UPDATE decision SET route = ? WHERE id = ?").run(route, decisionId);
}

export function insertWorkpaper(db: Db, clock: Clock, decisionId: string, result: KernelResult): string {
  const id = newId("wp");
  db.prepare(
    "INSERT INTO workpaper (id, decision_id, marks_json, kernel_verdict, checkable_num, checkable_den, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, decisionId, JSON.stringify({ stage: result.stage, marks: result.marks }), result.verdict,
    result.checkable_num, result.checkable_den, clock.now());
  return id;
}

/** BLOCK persists with the rule that caused it, the approver's click if there was one, and an event. */
export function persistBlock(
  db: Db, clock: Clock, decisionId: string, proposal: Proposal, rule: BlockRule, approverId: string | null,
): void {
  db.prepare("INSERT INTO blocked_attempt (id, decision_id, rule, approver_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(newId("blk"), decisionId, rule, approverId, canonicalJson(proposal), clock.now());
  setRoute(db, decisionId, "BLOCK");
  emit(db, clock, {
    topic: "entry.blocked", from_function: proposal.function, intent_id: proposal.intent_id,
    payload: { decision_id: decisionId, rule, approver_id: approverId, kind: proposal.kind, party_id: proposal.party_id },
  });
}

/** Stable JSON: object keys sorted, so the same proposal always serialises the same way. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}
