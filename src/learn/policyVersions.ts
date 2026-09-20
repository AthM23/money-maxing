import type { Db } from "../runtime/db.js";

export interface Lineage {
  code: string;
  version: number;
  /** The approved version this draft would retire. */
  supersedes: string | null;
}

export type LineageLookup =
  | { status: "unchanged"; policy_id: string }
  | { status: "new_version"; lineage: Lineage };

interface FamilyRow { id: string; code: string | null; version: number; status: string; condition_json: string }

const PREFIX: Record<string, string> = { write_off: "SHORT-PAY", credit_memo: "CONCESSION", tax_withholding: "WHT", customer_credit: "CREDIT", approve_bill: "AP-MATCH" };

/**
 * A rule is never edited. When what the humans did moves (a wider ceiling, say), compile drafts the next version
 * of the same rule, backtested on all the history again, and approving it retires the version before. A family is
 * one treatment for one kind of case: same function, same action, same payment method.
 */
export function lineageFor(db: Db, fn: string, actionJson: string, method: string, conditionJson: string): LineageLookup {
  const family = db
    .prepare(
      `SELECT id, code, version, status, condition_json FROM policy
       WHERE function = ? AND action_json = ? AND json_extract(condition_json, '$.all[2].value') = ? AND status != 'retired'
       ORDER BY version DESC, rowid DESC`,
    )
    .all(fn, actionJson, method) as FamilyRow[];
  const same = family.find((p) => p.condition_json === conditionJson);
  if (same) return { status: "unchanged", policy_id: same.id };
  const approved = family.find((p) => p.status === "approved");
  const code = family.find((p) => p.code)?.code ?? nextCode(db, (JSON.parse(actionJson) as { kind: string }).kind);
  const version = family.reduce((n, p) => Math.max(n, p.version), 0) + 1;
  return { status: "new_version", lineage: { code, version, supersedes: approved?.id ?? null } };
}

/** An older draft nobody approved is overtaken by the newer one, so a reviewer is never shown two of the same rule. */
export function retireOvertakenDrafts(db: Db, fn: string, actionJson: string, method: string, keepId: string): void {
  db.prepare(
    `UPDATE policy SET status = 'retired'
     WHERE function = ? AND action_json = ? AND json_extract(condition_json, '$.all[2].value') = ? AND status = 'proposed' AND id != ?`,
  ).run(fn, actionJson, method, keepId);
}

function nextCode(db: Db, kind: string): string {
  const prefix = PREFIX[kind] ?? kind.toUpperCase().replaceAll("_", "-");
  const row = db.prepare("SELECT COUNT(DISTINCT code) AS n FROM policy WHERE code LIKE ? ESCAPE '\\'").get(`${prefix.replaceAll("_", "\\_")}-%`) as { n: number };
  return `${prefix}-${String(row.n + 1).padStart(2, "0")}`;
}

export function ruleName(lineage: Lineage, action: { kind: string; account: string }, method: string, ceilingCents: number): string {
  const dollars = (ceilingCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${lineage.code} v${lineage.version} · ${method} short ≤ $${dollars} → ${action.kind} to ${action.account}`;
}
