import { CaseFile, HumanOutcome } from "../contract/types.js";
import { evaluateCondition } from "../kernel/index.js";
import type { Condition } from "../kernel/types.js";
import { caseFeatures } from "../router/tier0.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { newId } from "../runtime/ids.js";
import { safeJson } from "../runtime/lookups.js";
import { lineageFor, retireOvertakenDrafts, ruleName } from "./policyVersions.js";

const MIN_AGREEING = 3;

export interface Backtest {
  n: number;                 // decision points the condition matches (the same history the rule was drafted from)
  agree: number;             // humans did exactly this
  /**
   * Leave-one-out, because the line above is in-sample: for each case behind the rule, the rule drafted from the
   * OTHER cases alone. How many of them it would still have covered. The case that set the ceiling never is.
   */
  held_out_n: number;
  held_out_covered: number;
  account_outliers: string[]; // same treatment, different account: an inconsistent human, shown to the approver
  regressions: string[];     // humans did something materially different: the policy would have mis-cleared
}

export interface PolicyDraft {
  policy_id: string | null;  // null when the draft was refused
  name: string;
  condition: Condition;
  action: { kind: string; account: string };
  backtest: Backtest;
  refused_reason?: string;
  /** The same rule is already on file (proposed or approved): nothing new was drafted. */
  unchanged?: boolean;
  /** The approved version this draft retires once it is approved. */
  supersedes?: string;
}

interface Point { id: string; case_file: CaseFile; human: HumanOutcome }

/**
 * Compile repeated human judgment into a policy draft, in code. The rule is never wider than what the humans
 * actually did (the ceiling is the largest amount observed), it is backtested on every closed decision point,
 * and one prior mis-clear refuses it. Drafts are proposals: they do nothing until someone approves them.
 */
export function compilePolicies(db: Db, clock: Clock, fn: string): PolicyDraft[] {
  const points = loadPoints(db, fn);
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    if (!p.human.account || p.human.kind === "apply_payment") continue;
    const key = `${p.human.kind}|${p.human.account}|${p.case_file.method ?? "other"}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const drafts: PolicyDraft[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_AGREEING) continue;
    const [kind = "", account = "", method = "other"] = key.split("|");
    drafts.push(draftFor(db, clock, fn, points, group, { kind, account }, method));
  }
  return drafts;
}

function draftFor(db: Db, clock: Clock, fn: string, all: Point[], group: Point[], action: PolicyDraft["action"], method: string): PolicyDraft {
  const ceiling = Math.max(...group.map((p) => p.case_file.shortfall_cents));
  const condition: Condition = { all: [
    { field: "shortfall_cents", op: ">", value: 0 },
    { field: "shortfall_cents", op: "<=", value: ceiling },
    { field: "method", op: "==", value: method },
  ] };
  const backtest = { ...runBacktest(all, condition, action), ...leaveOneOut(group) };
  const [actionJson, conditionJson] = [JSON.stringify(action), JSON.stringify(condition)];
  const lookup = lineageFor(db, fn, actionJson, method, conditionJson);
  if (lookup.status === "unchanged") {
    const row = db.prepare("SELECT name FROM policy WHERE id = ?").get(lookup.policy_id) as { name: string };
    return { policy_id: lookup.policy_id, name: row.name, condition, action, backtest, unchanged: true };
  }
  const { lineage } = lookup;
  const name = ruleName(lineage, action, method, ceiling);
  if (backtest.regressions.length > 0) {
    return { policy_id: null, name, condition, action, backtest, refused_reason: `would have mis-cleared ${backtest.regressions.join(", ")}` };
  }
  const id = newId("pol");
  db.prepare(
    `INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, backtest_json, status, code, version, supersedes)
     VALUES (?, ?, ?, ?, ?, ?, 'company', ?, 'proposed', ?, ?, ?)`,
  ).run(id, fn, name, conditionJson, actionJson,
    `Humans booked this ${backtest.agree} of ${backtest.n} times (${clock.now().slice(0, 10)}).`, JSON.stringify(backtest),
    lineage.code, lineage.version, lineage.supersedes);
  retireOvertakenDrafts(db, fn, actionJson, method, id);
  return { policy_id: id, name, condition, action, backtest, supersedes: lineage.supersedes ?? undefined };
}

function leaveOneOut(group: Point[]): Pick<Backtest, "held_out_n" | "held_out_covered"> {
  let covered = 0;
  for (const held of group) {
    const others = group.filter((p) => p !== held).map((p) => p.case_file.shortfall_cents);
    if (others.length > 0 && held.case_file.shortfall_cents <= Math.max(...others)) covered += 1;
  }
  return { held_out_n: group.length, held_out_covered: covered };
}

function runBacktest(all: Point[], condition: Condition, action: PolicyDraft["action"]): Omit<Backtest, "held_out_n" | "held_out_covered"> {
  const bt: Omit<Backtest, "held_out_n" | "held_out_covered"> = { n: 0, agree: 0, account_outliers: [], regressions: [] };
  for (const p of all) {
    if (!evaluateCondition(condition, caseFeatures(p.case_file))) continue;
    bt.n += 1;
    if (p.human.kind !== action.kind) bt.regressions.push(p.id);
    else if (p.human.account !== action.account) bt.account_outliers.push(p.id);
    else bt.agree += 1;
  }
  return bt;
}

function loadPoints(db: Db, fn: string): Point[] {
  const rows = db.prepare("SELECT id, case_json, human_outcome_json FROM decision_point WHERE function = ? ORDER BY decided_at")
    .all(fn) as { id: string; case_json: string; human_outcome_json: string }[];
  const points: Point[] = [];
  for (const row of rows) {
    const c = CaseFile.safeParse(safeJson(row.case_json));
    const h = HumanOutcome.safeParse(safeJson(row.human_outcome_json));
    if (c.success && h.success) points.push({ id: row.id, case_file: c.data, human: h.data });
  }
  return points;
}

export type ApprovePolicyResult = { status: "not_found" | "not_proposed" | "unauthorised" } | { status: "approved"; max_amount_cents: number };

/** Approve like a pull request. The policy inherits its approver's ceiling, so it can never clear more than they could. */
export function approvePolicy(db: Db, clock: Clock, policyId: string, approverId: string): ApprovePolicyResult {
  const row = db.prepare("SELECT status FROM policy WHERE id = ?").get(policyId) as { status: string } | undefined;
  if (!row) return { status: "not_found" };
  if (row.status !== "proposed") return { status: "not_proposed" };
  const approver = db.prepare("SELECT limit_cents FROM approver WHERE id = ?").get(approverId) as { limit_cents: number } | undefined;
  if (!approver) return { status: "unauthorised" };
  // The new version takes over and the one before it retires, together: two versions of one rule are never both live.
  const swap = db.transaction(() => {
    db.prepare("UPDATE policy SET status = 'approved', approved_by = ?, approved_at = ?, max_amount_cents = ? WHERE id = ?")
      .run(approverId, clock.now(), approver.limit_cents, policyId);
    db.prepare("UPDATE policy SET status = 'retired' WHERE id = (SELECT supersedes FROM policy WHERE id = ?)").run(policyId);
  });
  swap();
  return { status: "approved", max_amount_cents: approver.limit_cents };
}
