import { Proposal, type BlockRule, type KernelResult, type Mark } from "../contract/types.js";
import { runKernel } from "../kernel/index.js";
import type { DocLite, ExtraCheck } from "../kernel/types.js";
import { resolveAutonomy } from "./autonomy.js";
import { DEFAULT_CONFIG, systemClock, type Clock, type RuntimeConfig } from "./config.js";
import type { Db } from "./db.js";
import { buildKernelContext, type ContextMeta } from "./kernelContext.js";
import { attachProposal, canonicalJson, insertDecision, insertWorkpaper, persistBlock, setRoute, type DecisionMeta } from "./persist.js";
import { postEntry } from "./post.js";

export interface ProposeMeta extends DecisionMeta {
  /** A decision opened at intake. When absent, or already routed, a new decision is recorded. */
  decision_id?: string;
  as_of?: string;
  features?: Record<string, string | number | boolean>;
  extra_checks?: ExtraCheck[];
  replay_docs?: DocLite[];
}

export interface RuntimeDeps {
  clock?: Clock;
  config?: RuntimeConfig;
}

export type ProposeResult =
  | { status: "invalid"; issues: string[] }
  | { status: "rejected"; decision_id: string; failed: Mark[]; marks: Mark[] }
  | { status: "blocked"; decision_id: string; rule: BlockRule }
  | { status: "posted"; decision_id: string; route: "AUTO" | "PROPOSE"; entry_id: string | null }
  | { status: "pending_approval"; decision_id: string; route: "PROPOSE"; marks: Mark[] }
  | { status: "replay_recorded"; decision_id: string; route: "AUTO" | "PROPOSE" };

/**
 * The only write path to the ledger. Validate, record the decision, let the kernel re-check the workpaper,
 * then post, park for approval, or persist a block. An agent can call this; it cannot post any other way.
 */
export function proposeEntry(db: Db, input: unknown, meta: ProposeMeta, deps: RuntimeDeps = {}): ProposeResult {
  // Reserve the writer before reading balances, evidence or approvals. Another connection cannot
  // change a gate input between validation and the ledger write.
  return db.transaction(() => proposeInTransaction(db, input, meta, deps)).immediate();
}

function proposeInTransaction(db: Db, input: unknown, meta: ProposeMeta, deps: RuntimeDeps): ProposeResult {
  const clock = deps.clock ?? systemClock;
  const config = deps.config ?? DEFAULT_CONFIG;
  const parsed = Proposal.safeParse(input);
  if (!parsed.success) return { status: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const proposal = parsed.data;
  if (!intentExists(db, proposal.intent_id)) return { status: "invalid", issues: [`intent_id: unknown intent ${proposal.intent_id}`] };

  const existing = meta.mode === "live" ? findExisting(db, proposal) : undefined;
  if (existing?.posted_at) return { status: "posted", decision_id: existing.decision_id, route: existing.route === "PROPOSE" ? "PROPOSE" : "AUTO", entry_id: existing.entry_id };
  if (existing && meta.mode === "live") return { status: "pending_approval", decision_id: existing.decision_id, route: "PROPOSE", marks: [] };

  const reuse = meta.decision_id && attachProposal(db, meta.decision_id, proposal, meta) ? meta.decision_id : undefined;
  const decisionId = reuse ?? insertDecision(db, clock, proposal, meta);
  const ctxMeta: ContextMeta = {
    mode: meta.mode, as_of: meta.as_of, preparer: meta.actor, preparer_tier: meta.tier,
    autonomy_level: resolveAutonomy(db, meta.autonomy_level, proposal, meta.tier),
    approval: null, intent_id: proposal.intent_id, features: meta.features, extra_checks: meta.extra_checks,
    replay_docs: meta.replay_docs,
  };
  const first = runKernel(proposal, buildKernelContext(db, proposal, ctxMeta, config), "proposal");
  insertWorkpaper(db, clock, decisionId, first, meta.features);
  return dispose(db, clock, config, decisionId, proposal, ctxMeta, first);
}

function dispose(
  db: Db, clock: Clock, config: RuntimeConfig, decisionId: string, proposal: Proposal, ctxMeta: ContextMeta, first: KernelResult,
): ProposeResult {
  if (first.verdict === "block" && first.block_rule) {
    persistBlock(db, clock, decisionId, proposal, first.block_rule, null);
    return { status: "blocked", decision_id: decisionId, rule: first.block_rule };
  }
  if (first.verdict !== "accept") return { status: "rejected", decision_id: decisionId, failed: first.failed, marks: first.marks };

  const route = first.requires_approval ? "PROPOSE" : "AUTO";
  setRoute(db, decisionId, route);
  if (ctxMeta.mode === "replay") return { status: "replay_recorded", decision_id: decisionId, route };
  if (route === "PROPOSE") return { status: "pending_approval", decision_id: decisionId, route, marks: first.marks };
  return postThroughGate(db, clock, config, decisionId, proposal, ctxMeta);
}

/** AUTO still passes the post gate: the kernel runs again, with no approver, immediately before the write. */
function postThroughGate(
  db: Db, clock: Clock, config: RuntimeConfig, decisionId: string, proposal: Proposal, ctxMeta: ContextMeta,
): ProposeResult {
  const gate = runKernel(proposal, buildKernelContext(db, proposal, ctxMeta, config), "post_gate");
  insertWorkpaper(db, clock, decisionId, gate, ctxMeta.features);
  if (gate.verdict === "block" && gate.block_rule) {
    persistBlock(db, clock, decisionId, proposal, gate.block_rule, null);
    return { status: "blocked", decision_id: decisionId, rule: gate.block_rule };
  }
  if (gate.verdict !== "accept") return { status: "rejected", decision_id: decisionId, failed: gate.failed, marks: gate.marks };
  try {
    const posted = postEntry(db, clock, { decision_id: decisionId, intent_id: proposal.intent_id, proposal });
    return { status: "posted", decision_id: decisionId, route: "AUTO", entry_id: posted.entry_id };
  } catch (err) {
    return { status: "rejected", decision_id: decisionId, failed: [postFailure(err)], marks: [...gate.marks, postFailure(err)] };
  }
}

/** The post rolled back. That is a rejection the caller can act on, not a crash. */
export function postFailure(err: unknown): Mark {
  return { cls: "F", check: "X1", status: "fail", detail: `post failed and rolled back: ${err instanceof Error ? err.message : String(err)}`, refs: [] };
}

function intentExists(db: Db, intentId: string): boolean {
  return db.prepare("SELECT 1 FROM intent WHERE id = ?").get(intentId) !== undefined;
}

/**
 * Same intent, same proposal, already posted or still waiting for approval: hand that decision back instead of
 * recording a second one. Two identical parked proposals would otherwise both post once approved.
 */
export function findExisting(db: Db, proposal: Proposal): { decision_id: string; entry_id: string | null; route: string | null; posted_at: string | null } | undefined {
  return db
    .prepare(
      `SELECT d.id AS decision_id, d.route AS route, d.posted_at AS posted_at,
              (SELECT g.id FROM gl_entry g WHERE g.source_decision_id = d.id) AS entry_id
       FROM decision d
       WHERE d.intent_id = ? AND d.mode = 'live' AND d.proposal_json = ?
         AND (d.posted_at IS NOT NULL OR (d.route = 'PROPOSE'
              AND NOT EXISTS (SELECT 1 FROM workpaper w WHERE w.decision_id = d.id AND w.stale = 1)
              AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')))
       ORDER BY d.posted_at IS NULL, d.rowid LIMIT 1`,
    )
    .get(proposal.intent_id, canonicalJson(proposal)) as
    | { decision_id: string; entry_id: string | null; route: string | null; posted_at: string | null }
    | undefined;
}
