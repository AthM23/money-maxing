import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import type { CashGroup, CashReceipt, CashState } from "./types.js";

interface BankTxnRow { id: string; posted_date: string; amount_cents: number; descriptor: string; party_id: string | null; trace_id: string | null }
interface TracePayload { account?: string; entity?: string; currency?: string; country?: string }
interface BankFxRow { currency: string; foreign_amount_cents: number }

/**
 * Cash received, grouped by entity, bank account, country and original currency. The labels live in the bank
 * line's own trace payload (account, entity, currency, and country once the seeder adds it); nothing is looked up
 * from seed data files, only from the tables. Read-only.
 */
export function buildCash(db: Db): CashState {
  const rows = db.prepare("SELECT id, posted_date, amount_cents, descriptor, party_id, trace_id FROM bank_txn ORDER BY posted_date, id").all() as BankTxnRow[];
  const receipts = rows.map((row) => toCashReceipt(db, row));
  return { groups: groupReceipts(receipts), total_cents: receipts.reduce((n, r) => n + r.amount_cents, 0) };
}

function toCashReceipt(db: Db, row: BankTxnRow): CashReceipt {
  const payload = readTracePayload(db, row.trace_id);
  const fx = readBankFx(db, row.id);
  return {
    bank_txn_id: row.id, posted_date: row.posted_date, amount_cents: row.amount_cents, descriptor: row.descriptor,
    party_id: row.party_id, entity: payload.entity ?? null, account: payload.account ?? null, country: payload.country ?? null,
    currency: payload.currency ?? "USD", original_currency: fx?.currency ?? null, foreign_amount_cents: fx?.foreign_amount_cents ?? null,
  };
}

function readTracePayload(db: Db, traceId: string | null): TracePayload {
  if (!traceId) return {};
  const row = db.prepare("SELECT payload_json FROM trace WHERE id = ?").get(traceId) as { payload_json: string } | undefined;
  return (row ? (safeJson(row.payload_json) as TracePayload | null) : null) ?? {};
}

function readBankFx(db: Db, bankTxnId: string): BankFxRow | undefined {
  return db.prepare("SELECT currency, foreign_amount_cents FROM bank_txn_fx WHERE bank_txn_id = ?").get(bankTxnId) as BankFxRow | undefined;
}

function groupReceipts(receipts: CashReceipt[]): CashGroup[] {
  const groups = new Map<string, CashGroup>();
  for (const r of receipts) {
    const currency = r.original_currency ?? r.currency;
    const key = `${r.entity ?? ""}|${r.account ?? ""}|${r.country ?? ""}|${currency}`;
    const group = groups.get(key) ?? { entity: r.entity, account: r.account, country: r.country, currency, total_cents: 0, receipts: [] };
    group.receipts.push(r);
    group.total_cents += r.amount_cents;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.entity ?? "").localeCompare(b.entity ?? "") || (a.account ?? "").localeCompare(b.account ?? ""));
}
