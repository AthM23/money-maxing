import type { ProposalKind } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { countFactUses, safeJson } from "../runtime/lookups.js";

export interface FactQuery {
  party_id: string;
  kind: ProposalKind;
  entry_date: string;
  amount_cents: number;
  predicate?: string;
  /** Replay only: a fact learned after this instant is invisible. */
  as_of?: string;
}

export interface ApplicableFact {
  fact_id: string;
  predicate: string;
  value: Record<string, unknown>;
  valid_to: string;
  approved_by: string | null;
}

export interface RefusedFact {
  fact_id: string;
  /** The one scope dimension that failed, named, so the agent can say why it would not generalise. */
  failed_dimension: "status" | "date" | "kind" | "one_time_used" | "amount_ceiling" | "learned_after_as_of";
  detail: string;
}

interface FactRow {
  id: string; predicate: string; value_json: string; scope_json: string; status: string; uses: string;
  valid_from: string; valid_to: string; learned_at: string; max_amount_cents: number | null; approved_by: string | null;
}

/**
 * Which stored facts may be used for this case. Decided in code, never by a model: same party, active, in date,
 * right kind, under the approver's ceiling, and a one-time fact only once. Everything else is refused by name.
 */
export function applicableFacts(db: Db, q: FactQuery): { applicable: ApplicableFact[]; refused: RefusedFact[] } {
  const rows = db
    .prepare(`SELECT * FROM fact WHERE party_id = ? ${q.predicate ? "AND predicate = ?" : ""} ORDER BY learned_at DESC`)
    .all(...(q.predicate ? [q.party_id, q.predicate] : [q.party_id])) as FactRow[];
  const applicable: ApplicableFact[] = [];
  const refused: RefusedFact[] = [];
  for (const row of rows) {
    const failure = firstFailure(db, row, q);
    if (failure) refused.push({ fact_id: row.id, ...failure });
    else applicable.push(toApplicable(row));
  }
  return { applicable, refused };
}

function firstFailure(db: Db, row: FactRow, q: FactQuery): Omit<RefusedFact, "fact_id"> | null {
  if (q.as_of && row.learned_at > q.as_of) return { failed_dimension: "learned_after_as_of", detail: `learned ${row.learned_at} > as of ${q.as_of}` };
  if (row.status !== "active") return { failed_dimension: "status", detail: `status is ${row.status}` };
  if (q.entry_date < row.valid_from || q.entry_date > row.valid_to) {
    return { failed_dimension: "date", detail: `${q.entry_date} is outside ${row.valid_from}..${row.valid_to}` };
  }
  const kinds = (safeJson(row.scope_json) as { kinds?: string[] } | null)?.kinds;
  if (!Array.isArray(kinds) || !kinds.includes(q.kind)) return { failed_dimension: "kind", detail: `${q.kind} is not in a valid explicit scope` };
  if (row.uses === "one_time" && countFactUses(db, row.id) > 0) return { failed_dimension: "one_time_used", detail: "one-time fact already used" };
  if (row.max_amount_cents !== null && q.amount_cents > row.max_amount_cents) {
    return { failed_dimension: "amount_ceiling", detail: `${q.amount_cents} exceeds the approver ceiling ${row.max_amount_cents}` };
  }
  return null;
}

function toApplicable(row: FactRow): ApplicableFact {
  const value = (safeJson(row.value_json) as Record<string, unknown> | null) ?? {};
  return { fact_id: row.id, predicate: row.predicate, value, valid_to: row.valid_to, approved_by: row.approved_by };
}
