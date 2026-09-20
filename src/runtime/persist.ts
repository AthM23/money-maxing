import type { AutonomyLevel, BlockRule, KernelResult, Proposal, Route } from "../contract/types.js";
import { resolveAutonomy, type AutonomySetting } from "./autonomy.js";
import type { Clock } from "./config.js";
import type { Db } from "./db.js";
import { emit } from "./events.js";
import { newId } from "./ids.js";

export interface DecisionMeta {
  actor: string;
  mode: "live" | "replay";
  /** "earned" reads the ladder for the proposal's kind; see resolveAutonomy. */
  autonomy_level: AutonomySetting;
  tier?: number;
  decision_point_id?: string;
}

export function insertDecision(db: Db, clock: Clock, proposal: Proposal, meta: DecisionMeta): string {
  const id = newId("dec");
  db.prepare(
    `INSERT INTO decision (id, intent_id, function, mode, decision_point_id, kind, proposal_json, actor, autonomy_level, tier, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, proposal.intent_id, proposal.function, meta.mode, meta.decision_point_id ?? null, proposal.kind,
    canonicalJson(proposal), meta.actor, resolveAutonomy(db, meta.autonomy_level, proposal, meta.tier),
    meta.tier ?? null, clock.now());
  return id;
}

export interface IntakeInput extends DecisionMeta {
  intent_id: string;
  function: string;
}

/**
 * Open the decision at intake, before any investigation, so every step and cent is metered against it.
 * The kind is not known yet, so an "earned" setting is held at shadow until a proposal is attached.
 */
export function openDecision(db: Db, clock: Clock, input: IntakeInput): string {
  const id = newId("dec");
  const level: AutonomyLevel = input.autonomy_level === "earned" ? "shadow" : input.autonomy_level;
  db.prepare(
    `INSERT INTO decision (id, intent_id, function, mode, decision_point_id, kind, actor, autonomy_level, tier, created_at)
     VALUES (?, ?, ?, ?, ?, 'no_action', ?, ?, ?, ?)`,
  ).run(id, input.intent_id, input.function, input.mode, input.decision_point_id ?? null, input.actor, level,
    input.tier ?? null, clock.now());
  return id;
}

/** Attach a proposal to a decision opened at intake. Refused once that decision has a route. */
export function attachProposal(db: Db, decisionId: string, proposal: Proposal, meta: DecisionMeta): boolean {
  const info = db
    .prepare("UPDATE decision SET kind = ?, proposal_json = ?, actor = ?, tier = ?, autonomy_level = ? WHERE id = ? AND intent_id = ? AND route IS NULL")
    .run(proposal.kind, canonicalJson(proposal), meta.actor, meta.tier ?? null,
      resolveAutonomy(db, meta.autonomy_level, proposal, meta.tier), decisionId, proposal.intent_id);
  return info.changes === 1;
}

export function setRoute(db: Db, decisionId: string, route: Route): void {
  db.prepare("UPDATE decision SET route = ? WHERE id = ?").run(route, decisionId);
}

export type CaseFeatures = Record<string, string | number | boolean>;

/**
 * The workpaper keeps the case features the kernel judged against, so a later gate (an approval, an audit
 * re-performance) checks the same decision on the same facts. They come from the runtime, never from a model.
 */
export function insertWorkpaper(db: Db, clock: Clock, decisionId: string, result: KernelResult, features?: CaseFeatures): string {
  const id = newId("wp");
  db.prepare(
    "INSERT INTO workpaper (id, decision_id, marks_json, kernel_verdict, checkable_num, checkable_den, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, decisionId, JSON.stringify({ stage: result.stage, marks: result.marks, features: features ?? {} }), result.verdict,
    result.checkable_num, result.checkable_den, clock.now());
  return id;
}

/** The features recorded when the entry was first proposed. */
export function storedFeatures(db: Db, decisionId: string): CaseFeatures {
  const rows = db.prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid").all(decisionId) as { marks_json: string }[];
  for (const row of rows) {
    const features = readFeatures(row.marks_json);
    if (features && Object.keys(features).length > 0) return features;
  }
  return {};
}

function readFeatures(marksJson: string): CaseFeatures | null {
  try {
    const parsed = JSON.parse(marksJson) as { features?: CaseFeatures } | null;
    return parsed?.features ?? null;
  } catch {
    // A workpaper that does not parse carries no features; the gate then fails closed on any policy it cannot test.
    return null;
  }
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
