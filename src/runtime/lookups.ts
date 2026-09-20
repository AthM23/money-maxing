import type { ProposalKind } from "../contract/types.js";
import type {
  ApproverLite, BankFxLite, BankTxnLite, Condition, DocFxLite, DocLite, FactLite, PolicyLite, TraceLite,
} from "../kernel/types.js";
import type { Db } from "./db.js";
import { payloadText } from "./payloadText.js";

/** Read-side adapters from SQLite rows to the kernel's plain types. No writes happen here. */
export function getTrace(db: Db, id: string, asOf?: string): TraceLite | undefined {
  const row = db
    .prepare("SELECT id, recorded_time, party_id, payload_json FROM trace WHERE id = ?")
    .get(id) as { id: string; recorded_time: string; party_id: string | null; payload_json: string } | undefined;
  if (!row) return undefined;
  const newer = db.prepare(`SELECT n.id FROM trace n JOIN trace old ON old.id = ?
    WHERE n.source = old.source AND n.external_id = old.external_id AND n.version > old.version
      ${asOf ? "AND n.recorded_time <= ?" : ""} ORDER BY n.version DESC LIMIT 1`)
    .get(...(asOf ? [id, asOf] : [id])) as { id: string } | undefined;
  return { id: row.id, recorded_time: row.recorded_time, party_id: row.party_id,
    payload_text: payloadText(row.payload_json), ...(newer ? { superseded_by: newer.id } : {}) };
}

export function getDoc(db: Db, id: string): DocLite | undefined {
  const inv = db
    .prepare("SELECT id, party_id, total_cents, open_cents, issue_date AS date FROM invoice WHERE id = ?")
    .get(id) as Omit<DocLite, "kind"> | undefined;
  if (inv) return { ...inv, kind: "invoice" };
  const bill = db
    .prepare("SELECT id, party_id, total_cents, open_cents, bill_date AS date, status FROM bill WHERE id = ?")
    .get(id) as Omit<DocLite, "kind"> | undefined;
  return bill ? { ...bill, kind: "bill" } : undefined;
}

export function getBankTxn(db: Db, id: string): BankTxnLite | undefined {
  return db
    .prepare("SELECT id, amount_cents, posted_date, party_id, descriptor FROM bank_txn WHERE id = ?")
    .get(id) as BankTxnLite | undefined;
}

interface FactRow {
  id: string; party_id: string; predicate: string; status: FactLite["status"]; valid_from: string; valid_to: string;
  learned_at: string; uses: FactLite["uses"]; scope_json: string; value_json: string; max_amount_cents: number | null; approved_by: string | null;
}

export function getFact(db: Db, id: string): FactLite | undefined {
  const row = db.prepare("SELECT * FROM fact WHERE id = ?").get(id) as FactRow | undefined;
  if (!row) return undefined;
  const scope = safeJson(row.scope_json) as { kinds?: ProposalKind[] } | null;
  // Fail closed: a fact whose scope cannot be read covers no kind at all.
  const kinds = Array.isArray(scope?.kinds) ? scope.kinds : [];
  return {
    id: row.id, party_id: row.party_id, predicate: row.predicate, status: row.status,
    valid_from: row.valid_from, valid_to: row.valid_to, learned_at: row.learned_at, uses: row.uses,
    used_count: countFactUses(db, id), kinds, value: (safeJson(row.value_json) as Record<string, unknown> | null) ?? {},
    max_amount_cents: row.max_amount_cents, approved_by: row.approved_by,
  };
}

/** Posted live decisions that cited this fact. A one_time fact may be used once. */
export function countFactUses(db: Db, factId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM decision d
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM json_each(json_extract(d.proposal_json, '$.fact_refs')) j WHERE j.value = ?)`,
    )
    .get(factId) as { n: number };
  return row.n;
}

export function getPolicy(db: Db, id: string): PolicyLite | undefined {
  const row = db
    .prepare("SELECT id, function, status, condition_json, action_json, max_amount_cents, approved_by FROM policy WHERE id = ?")
    .get(id) as
    | { id: string; function: string; status: PolicyLite["status"]; condition_json: string; action_json: string; max_amount_cents: number | null; approved_by: string | null }
    | undefined;
  if (!row) return undefined;
  const condition = safeJson(row.condition_json) as Condition | null;
  if (!condition) return undefined;
  const raw = safeJson(row.action_json) as { kind?: unknown; account?: unknown } | null;
  const action = typeof raw?.kind === "string" && typeof raw.account === "string" ? { kind: raw.kind, account: raw.account } : null;
  return { id: row.id, function: row.function, status: row.status, condition, action, max_amount_cents: row.max_amount_cents, approved_by: row.approved_by };
}

/** Foreign-currency facts about an invoice and a receipt, for the kernel's realized-FX check. */
export function getDocFx(db: Db, docId: string): DocFxLite | undefined {
  return db.prepare("SELECT currency, foreign_total_cents, booked_rate_ppm FROM invoice_fx WHERE invoice_id = ?").get(docId) as DocFxLite | undefined;
}

export function getBankFx(db: Db, bankTxnId: string): BankFxLite | undefined {
  return db.prepare("SELECT currency, foreign_amount_cents, rate_ppm, fee_cents, advice_trace_id FROM bank_txn_fx WHERE bank_txn_id = ?")
    .get(bankTxnId) as BankFxLite | undefined;
}

/** Realized FX already in the books for a receipt: posted live entries of that kind naming the bank line. */
export function fxRealizedCents(db: Db, bankTxnId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(a.value ->> '$.amount_cents'), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.kind = 'fx_realized' AND json_extract(d.proposal_json, '$.bank_txn_id') = ?`,
    )
    .get(bankTxnId) as { n: number };
  return row.n;
}

export function getApprover(db: Db, id: string): ApproverLite | undefined {
  return db.prepare("SELECT id, role, limit_cents FROM approver WHERE id = ?").get(id) as ApproverLite | undefined;
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
