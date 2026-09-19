import { Proposal, type BlockRule, type Mark } from "../contract/types.js";
import { runKernel } from "../kernel/index.js";
import type { ApprovalLite } from "../kernel/types.js";
import { DEFAULT_CONFIG, systemClock } from "./config.js";
import type { Db } from "./db.js";
import { newId } from "./ids.js";
import { buildKernelContext } from "./kernelContext.js";
import { safeJson } from "./lookups.js";
import { insertWorkpaper, persistBlock } from "./persist.js";
import { postEntry } from "./post.js";
import type { RuntimeDeps } from "./proposeEntry.js";

export interface ApprovalInput extends ApprovalLite {
  note?: string;
  slack_ts?: string;
}

export type ApproveResult =
  | { status: "not_found" | "not_pending"; decision_id: string }
  | { status: "declined"; decision_id: string }
  | { status: "blocked"; decision_id: string; rule: BlockRule }
  | { status: "rejected"; decision_id: string; failed: Mark[] }
  | { status: "posted"; decision_id: string; route: "PROPOSE"; entry_id: string | null };

interface DecisionRow {
  id: string; intent_id: string; mode: string; route: string | null; proposal_json: string; actor: string; autonomy_level: "auto" | "review" | "shadow";
}

/**
 * A person (or the controller agent, below materiality) answers a parked proposal. The kernel runs again as the
 * post gate with the approver's identity, which is how a BLOCK can still fire after someone clicks approve.
 */
export function approveDecision(db: Db, decisionId: string, approval: ApprovalInput, deps: RuntimeDeps = {}): ApproveResult {
  const clock = deps.clock ?? systemClock;
  const config = deps.config ?? DEFAULT_CONFIG;
  const row = db.prepare("SELECT id, intent_id, mode, route, proposal_json, actor, autonomy_level FROM decision WHERE id = ?")
    .get(decisionId) as DecisionRow | undefined;
  if (!row) return { status: "not_found", decision_id: decisionId };
  if (row.route !== "PROPOSE" || row.mode !== "live" || isPosted(db, decisionId)) return { status: "not_pending", decision_id: decisionId };

  const parsed = Proposal.safeParse(safeJson(row.proposal_json));
  if (!parsed.success) return { status: "rejected", decision_id: decisionId, failed: [] };
  const proposal = parsed.data;
  if (approval.outcome === "rejected") {
    recordApproval(db, clock.now(), decisionId, approval);
    return { status: "declined", decision_id: decisionId };
  }

  const ctx = buildKernelContext(db, proposal, {
    mode: "live", preparer: row.actor, autonomy_level: row.autonomy_level, approval, intent_id: row.intent_id,
  }, config);
  const gate = runKernel(proposal, ctx, "post_gate");
  insertWorkpaper(db, clock, decisionId, gate);
  if (gate.verdict === "block" && gate.block_rule) {
    persistBlock(db, clock, decisionId, proposal, gate.block_rule, approval.approver_id);
    return { status: "blocked", decision_id: decisionId, rule: gate.block_rule };
  }
  if (gate.verdict !== "accept") return { status: "rejected", decision_id: decisionId, failed: gate.failed };

  recordApproval(db, clock.now(), decisionId, approval);
  const posted = postEntry(db, clock, { decision_id: decisionId, intent_id: row.intent_id, proposal });
  return { status: "posted", decision_id: decisionId, route: "PROPOSE", entry_id: posted.entry_id };
}

function isPosted(db: Db, decisionId: string): boolean {
  return db.prepare("SELECT 1 FROM gl_entry WHERE source_decision_id = ?").get(decisionId) !== undefined;
}

function recordApproval(db: Db, now: string, decisionId: string, a: ApprovalInput): void {
  db.prepare(
    "INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, note, slack_ts, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(newId("apr"), decisionId, a.approver_id, a.approver_kind, a.outcome, a.note ?? null, a.slack_ts ?? null, now);
}
