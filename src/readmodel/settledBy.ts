import { Proposal } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import type { ApprovalRef, FactRef, RuleRef, SettledBy } from "./types.js";

/** Columns classifySettlement needs from a `decision` row. Callers may select more; extra columns are ignored. */
export interface DecisionRow {
  id: string;
  actor: string;
  tier: number | null;
  model_calls: number;
  cost_micros: number;
  proposal_json: string | null;
}

/**
 * Who or what settled a decision, read from the decision row alone: a named rule (policy_refs), a remembered fact
 * (fact_refs), the document reader (actor starting "reader:"), a model tier (tier >= 1), or plain code. Any
 * approvals on the decision are attached too, since a person can sign off on any of the above.
 */
export function classifySettlement(db: Db, decision: DecisionRow): SettledBy {
  const parsed = decision.proposal_json ? Proposal.safeParse(safeJson(decision.proposal_json)) : null;
  const proposal = parsed?.success ? parsed.data : null;
  const rule = proposal ? ruleRef(db, proposal.policy_refs[0]) : null;
  const fact = proposal ? factRef(db, proposal.fact_refs[0]) : null;
  const reader = decision.actor.startsWith("reader:") ? decision.actor.slice("reader:".length) : null;
  const model = decision.tier !== null && decision.tier >= 1
    ? { tier: decision.tier, model_calls: decision.model_calls, cost_micros: decision.cost_micros }
    : null;
  const approvals = approvalRefs(db, decision.id);
  return { tier: decision.tier, actor: decision.actor, rule, fact, reader, model, approvals, label: label(rule, fact, reader, model, approvals) };
}

function ruleRef(db: Db, policyId: string | undefined): RuleRef | null {
  if (!policyId) return null;
  const row = db.prepare("SELECT id, code, version FROM policy WHERE id = ?").get(policyId) as { id: string; code: string | null; version: number } | undefined;
  return row ? { policy_id: row.id, code: row.code, version: row.version } : null;
}

interface FactRow { id: string; predicate: string; scope_json: string; valid_from: string; valid_to: string; approved_by: string | null }

function factRef(db: Db, factId: string | undefined): FactRef | null {
  if (!factId) return null;
  const row = db.prepare("SELECT id, predicate, scope_json, valid_from, valid_to, approved_by FROM fact WHERE id = ?").get(factId) as FactRow | undefined;
  if (!row) return null;
  const scope = (safeJson(row.scope_json) as { kinds?: string[] } | null)?.kinds ?? [];
  return { fact_id: row.id, predicate: row.predicate, scope, valid_from: row.valid_from, valid_to: row.valid_to, approved_by: row.approved_by };
}

interface ApprovalRow { approver_id: string; approver_kind: "human" | "controller_agent"; outcome: string; note: string | null; approved_at: string }

function approvalRefs(db: Db, decisionId: string): ApprovalRef[] {
  const rows = db.prepare("SELECT approver_id, approver_kind, outcome, note, approved_at FROM approval WHERE decision_id = ? ORDER BY approved_at")
    .all(decisionId) as ApprovalRow[];
  return rows.map((r) => ({ approver_id: r.approver_id, approver_kind: r.approver_kind, outcome: r.outcome, note: r.note, approved_at: r.approved_at }));
}

function label(rule: RuleRef | null, fact: FactRef | null, reader: string | null, model: SettledBy["model"], approvals: ApprovalRef[]): string {
  const base = rule ? `code, rule ${rule.code ?? rule.policy_id} v${rule.version}`
    : fact ? `code, remembered fact ${fact.predicate}`
    : reader ? `document reader (${reader})`
    : model ? `model tier ${model.tier}`
    : "code, exact match";
  const approver = approvals.find((a) => a.outcome === "approved");
  return approver ? `${base}; approved by ${approver.approver_id}` : base;
}
