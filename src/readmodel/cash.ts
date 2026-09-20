import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import type { CashGroup, CashReceipt, CashState } from "./types.js";

interface BankTxnRow { id: string; posted_date: string; amount_cents: number; descriptor: string; party_id: string | null; trace_id: string | null }
interface TracePayload { account?: string; entity?: string; currency?: string; country?: string }
interface BankFxRow { currency: string; foreign_amount_cents: number }
interface Labels { entity: string | null; account: string | null; country: string | null; currency: string }

/**
 * Cash received, grouped by the entity and bank account it landed in. Labels come from the seeded world's own tables
 * when they exist (lane B: `bank_txn_label`, `bank_account`, `entity`, `party_profile`), otherwise from the bank
 * line's trace payload, which is where the scenario seeder puts them. Every account here is a USD account: a receipt
 * the bank converted keeps its original currency and amount beside the dollars that arrived, and stays in the account
 * it landed in. Read-only.
 */
export function buildCash(db: Db): CashState {
  const rows = db.prepare("SELECT id, posted_date, amount_cents, descriptor, party_id, trace_id FROM bank_txn ORDER BY posted_date, id").all() as BankTxnRow[];
  const world = ["bank_txn_label", "bank_account", "entity"].every((t) => hasTable(db, t));
  const profiles = hasTable(db, "party_profile");
  const receipts = rows.map((row) => toCashReceipt(db, row, world, profiles));
  return { groups: groupReceipts(receipts), total_cents: receipts.reduce((n, r) => n + r.amount_cents, 0) };
}

function toCashReceipt(db: Db, row: BankTxnRow, world: boolean, profiles: boolean): CashReceipt {
  const labels = (world ? worldLabels(db, row.id) : undefined) ?? payloadLabels(db, row.trace_id);
  const fx = db.prepare("SELECT currency, foreign_amount_cents FROM bank_txn_fx WHERE bank_txn_id = ?").get(row.id) as BankFxRow | undefined;
  return {
    bank_txn_id: row.id, posted_date: row.posted_date, amount_cents: row.amount_cents, descriptor: row.descriptor, party_id: row.party_id,
    entity: labels.entity, account: labels.account, country: labels.country, currency: labels.currency,
    payer_country: profiles && row.party_id ? payerCountry(db, row.party_id) : null,
    original_currency: fx?.currency ?? null, foreign_amount_cents: fx?.foreign_amount_cents ?? null,
  };
}

function worldLabels(db: Db, bankTxnId: string): Labels | undefined {
  return db
    .prepare(
      `SELECT e.name AS entity, a.label AS account, e.country AS country, 'USD' AS currency
       FROM bank_txn_label l LEFT JOIN bank_account a ON a.id = l.account_id LEFT JOIN entity e ON e.id = COALESCE(l.entity_id, a.entity_id)
       WHERE l.bank_txn_id = ?`,
    )
    .get(bankTxnId) as Labels | undefined;
}

function payloadLabels(db: Db, traceId: string | null): Labels {
  const row = traceId ? (db.prepare("SELECT payload_json FROM trace WHERE id = ?").get(traceId) as { payload_json: string } | undefined) : undefined;
  const payload = (row ? (safeJson(row.payload_json) as TracePayload | null) : null) ?? {};
  return { entity: payload.entity ?? null, account: payload.account ?? null, country: payload.country ?? null, currency: "USD" };
}

function payerCountry(db: Db, partyId: string): string | null {
  const row = db.prepare("SELECT country FROM party_profile WHERE party_id = ?").get(partyId) as { country: string | null } | undefined;
  return row?.country ?? null;
}

function hasTable(db: Db, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function groupReceipts(receipts: CashReceipt[]): CashGroup[] {
  const groups = new Map<string, CashGroup>();
  for (const r of receipts) {
    const key = `${r.entity ?? ""}|${r.account ?? ""}`;
    const group: CashGroup = groups.get(key) ?? { entity: r.entity, account: r.account, country: r.country, currency: r.currency, total_cents: 0, converted_receipts: 0, receipts: [] };
    group.receipts.push(r);
    group.total_cents += r.amount_cents;
    if (r.original_currency) group.converted_receipts += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.entity ?? "").localeCompare(b.entity ?? "") || (a.account ?? "").localeCompare(b.account ?? ""));
}
