import { CaseFile, HumanOutcome, Proposal, type AutonomyLevel } from "../contract/types.js";
import { runCase } from "../agents/runCase.js";
import type { Investigator } from "../agents/investigator.js";
import { systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { openDecision } from "../runtime/persist.js";
import { compareOutcome, type OutcomeDiff } from "./compare.js";

export interface ReplayOptions {
  investigators: Investigator[];
  function?: string;
  kind?: string;
  clock?: Clock;
  config?: RuntimeConfig;
}

export interface ReplayRow {
  decision_point_id: string;
  kind: string;
  decision_id: string | null;
  diff: OutcomeDiff;
  triage: "agent_wrong" | "human_inconsistent" | "context_missing" | null;
}

interface PointRow { id: string; function: string; kind: string; decided_at: string; case_json: string; human_outcome_json: string }

/**
 * Replay before you run. For each decision the humans made, in order: hide what they booked, show the agent only
 * what was recorded by then, let it decide, and score it in code. Nothing posts in replay.
 */
export async function replay(db: Db, opts: ReplayOptions): Promise<ReplayRow[]> {
  const points = db
    .prepare(`SELECT id, function, kind, decided_at, case_json, human_outcome_json FROM decision_point
              WHERE (? IS NULL OR function = ?) AND (? IS NULL OR kind = ?) ORDER BY decided_at, id`)
    .all(opts.function ?? null, opts.function ?? null, opts.kind ?? null, opts.kind ?? null) as PointRow[];
  const rows: ReplayRow[] = [];
  for (const point of points) rows.push(await replayOne(db, point, opts));
  markInconsistentHumans(db, rows);
  for (const row of rows) persist(db, row);
  return rows;
}

async function replayOne(db: Db, point: PointRow, opts: ReplayOptions): Promise<ReplayRow> {
  const human = HumanOutcome.parse(safeJson(point.human_outcome_json));
  const caseFile = CaseFile.safeParse(safeJson(point.case_json));
  if (!caseFile.success) {
    return { decision_point_id: point.id, kind: point.kind, decision_id: null, diff: compareOutcome(null, human), triage: "context_missing" };
  }
  ensureIntent(db, caseFile.data, point);
  const autonomy: AutonomyLevel = "shadow";
  // Only what THIS pass decides is scored. An entry left over from an earlier replay says nothing about today's memory.
  const before = (db.prepare("SELECT COALESCE(MAX(rowid), 0) AS n FROM decision").get() as { n: number }).n;
  const result = await runCase(db, caseFile.data, {
    mode: "replay", as_of: point.decided_at, autonomy_level: autonomy, investigators: opts.investigators, clock: opts.clock, config: opts.config,
  });
  const decision = lastJudgmentDecision(db, caseFile.data.intent_id, before);
  const diff = compareOutcome(decision?.proposal ?? null, human);
  const triage = diff.agrees ? null : result.final_route === "ESCALATE" ? "context_missing" : "agent_wrong";
  // A pass that proposes nothing is still a result. It is recorded against the point, so that a rule retired since
  // the last replay shows up as lost agreement instead of the old agreement standing for ever.
  const decisionId = decision?.id ?? openDecision(db, opts.clock ?? systemClock, {
    intent_id: caseFile.data.intent_id, function: caseFile.data.function, mode: "replay", actor: "replay:no_proposal", autonomy_level: "shadow", tier: result.tier_used,
  });
  db.prepare("UPDATE decision SET decision_point_id = ? WHERE id = ?").run(point.id, decisionId);
  return { decision_point_id: point.id, kind: point.kind, decision_id: decisionId, diff, triage };
}

/** The decision that carries the judgment: the latest one this pass made on the intent that is not the cash application. */
function lastJudgmentDecision(db: Db, intentId: string, afterRowid: number): { id: string; proposal: Proposal } | null {
  const rows = db
    .prepare("SELECT id, proposal_json FROM decision WHERE intent_id = ? AND mode = 'replay' AND proposal_json IS NOT NULL AND rowid > ? ORDER BY rowid DESC")
    .all(intentId, afterRowid) as { id: string; proposal_json: string }[];
  for (const row of rows) {
    const parsed = Proposal.safeParse(safeJson(row.proposal_json));
    if (parsed.success && parsed.data.kind !== "apply_payment") return { id: row.id, proposal: parsed.data };
  }
  const first = rows[0] ? Proposal.safeParse(safeJson(rows[0].proposal_json)) : null;
  return rows[0] && first?.success ? { id: rows[0].id, proposal: first.data } : null;
}

/** A replayed case is history, already settled by people. It is filed as resolved so no live worker ever picks it up. */
function ensureIntent(db: Db, c: CaseFile, point: PointRow): void {
  db.prepare(
    `INSERT OR IGNORE INTO intent (id, function, question, owner, status, case_json, created_at, closed_at)
     VALUES (?, ?, ?, 'replay', 'resolved', ?, ?, ?)`,
  ).run(c.intent_id, c.function, `Replay of ${point.id}`, point.case_json, point.decided_at, point.decided_at);
}

/**
 * Humans are not the answer key when they disagree with themselves. Within a kind, if most like cases went one way
 * and this one went another, and the agent sided with the majority, the miss is the humans', not the agent's.
 */
function markInconsistentHumans(_db: Db, rows: ReplayRow[]): void {
  const byKind = new Map<string, ReplayRow[]>();
  for (const row of rows) byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row]);
  for (const group of byKind.values()) {
    const counts = new Map<string, number>();
    for (const r of group) counts.set(treatment(r.diff.human), (counts.get(treatment(r.diff.human)) ?? 0) + 1);
    const [majority, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (n < 3 || n === group.length) continue;
    for (const r of group) {
      const agentSide = r.diff.agent ? `${r.diff.agent.kind}:${r.diff.agent.account ?? ""}` : "";
      if (!r.diff.agrees && treatment(r.diff.human) !== majority && agentSide === majority) r.triage = "human_inconsistent";
    }
  }
}

function treatment(h: HumanOutcome): string {
  return `${h.kind}:${h.account ?? ""}`;
}

function persist(db: Db, row: ReplayRow): void {
  if (!row.decision_id) return;
  db.prepare("INSERT OR REPLACE INTO replay_result (decision_point_id, decision_id, agrees, diff_json, triage) VALUES (?, ?, ?, ?, ?)")
    .run(row.decision_point_id, row.decision_id, row.diff.agrees ? 1 : 0, JSON.stringify(row.diff), row.triage);
}
