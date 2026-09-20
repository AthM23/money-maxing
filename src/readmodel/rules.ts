import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import type { RuleCard } from "./types.js";

interface PolicyRow {
  id: string; function: string; name: string; condition_json: string; action_json: string; backtest_json: string | null;
  status: string; approved_by: string | null; approved_at: string | null; code: string | null; version: number; supersedes: string | null;
}

interface ConditionLeaf { field?: string; op?: string; value?: unknown }
interface ConditionNode { all?: ConditionLeaf[]; any?: ConditionLeaf[] }

/** One card per policy (every version, not only the approved one): its condition with the customer scope pulled out, backtest, leave-one-out and lineage. */
export function buildRules(db: Db): RuleCard[] {
  const rows = db.prepare(
    "SELECT id, function, name, condition_json, action_json, backtest_json, status, approved_by, approved_at, code, version, supersedes FROM policy ORDER BY code, version",
  ).all() as PolicyRow[];
  return rows.map(toRuleCard);
}

function toRuleCard(row: PolicyRow): RuleCard {
  const condition = safeJson(row.condition_json);
  const rawAction = safeJson(row.action_json) as { kind?: string; account?: string } | null;
  return {
    policy_id: row.id, code: row.code, version: row.version, status: row.status, function: row.function, name: row.name,
    action: rawAction?.kind && rawAction.account ? { kind: rawAction.kind, account: rawAction.account } : null,
    customer_scope: customerScope(condition), condition, backtest: row.backtest_json ? safeJson(row.backtest_json) : null,
    supersedes: row.supersedes, approved_by: row.approved_by, approved_at: row.approved_at,
  };
}

/** compile.ts always writes the customer scope as a `party_id in [...]` leaf under `all`; pull it out for the card. */
function customerScope(condition: unknown): string[] {
  const node = condition as ConditionNode | null;
  const leaf = node?.all?.find((c) => c.field === "party_id" && c.op === "in");
  return Array.isArray(leaf?.value) ? (leaf.value as string[]) : [];
}
