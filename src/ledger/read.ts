import { ACCOUNTS } from "../contract/accounts.js";
import { accountName } from "./accounts.js";
import type { Db } from "./db.js";

export interface InvoiceRow { id: string; party_id: string; contract_id: string | null; issue_date: string; due_date: string; total_cents: number; open_cents: number; status: string }
export interface BankTxnRow { id: string; posted_date: string; amount_cents: number; descriptor: string; method: string | null; party_id: string | null; trace_id: string | null }
export interface UnmatchedBankTxn extends BankTxnRow { applied_cents: number; unapplied_cents: number }

/** ledger.open_invoices: open balances oldest first; one customer or all of them. */
export function openInvoices(db: Db, partyId?: string): InvoiceRow[] {
  const where = partyId ? "AND party_id = ?" : "";
  return db.prepare(`SELECT * FROM invoice WHERE open_cents > 0 AND status <> 'void' ${where} ORDER BY issue_date, id`).all(...(partyId ? [partyId] : [])) as InvoiceRow[];
}

export interface InvoiceDetail extends InvoiceRow {
  party_name: string;
  /** What has been applied to it, by posted decisions and by the seeded history. */
  applications: Array<{ decision_id: string; kind: string; amount_cents: number; bank_txn_id: string | null; posted_at: string }>;
}

/** ledger.get_invoice: one invoice with everything applied to it so far. */
export function getInvoice(db: Db, id: string): InvoiceDetail | undefined {
  const inv = db.prepare("SELECT i.*, p.name AS party_name FROM invoice i JOIN party p ON p.id = i.party_id WHERE i.id = ?").get(id) as (InvoiceRow & { party_name: string }) | undefined;
  if (!inv) return undefined;
  const applications = db
    .prepare(
      `SELECT d.id AS decision_id, d.kind, a.value ->> '$.amount_cents' AS amount_cents,
              json_extract(d.proposal_json, '$.bank_txn_id') AS bank_txn_id, d.posted_at
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND a.value ->> '$.doc_id' = ? ORDER BY d.posted_at`,
    )
    .all(id) as InvoiceDetail["applications"];
  return { ...inv, applications };
}

/** bank.get_transaction */
export function getBankTransaction(db: Db, id: string): BankTxnRow | undefined {
  return db.prepare("SELECT * FROM bank_txn WHERE id = ?").get(id) as BankTxnRow | undefined;
}

/**
 * bank.unmatched: bank lines not yet fully tied to the ledger. A line is matched by the seeded history, or by
 * posted live decisions whose applications (or, with none, whose cash lines) add up to its amount.
 */
export function bankUnmatched(db: Db, opts: { side?: "credit" | "debit"; since?: string } = {}): UnmatchedBankTxn[] {
  const rows = db
    .prepare(
      `SELECT b.*, COALESCE((
         SELECT SUM((SELECT COALESCE(SUM(ABS((l.value ->> '$.debit_cents') - (l.value ->> '$.credit_cents'))), 0)
                     FROM json_each(json_extract(d.proposal_json, '$.entries')) l WHERE l.value ->> '$.account' = '${ACCOUNTS.cash}'))
         FROM decision d WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND json_extract(d.proposal_json, '$.bank_txn_id') = b.id), 0) AS applied_cents
       FROM bank_txn b
       WHERE NOT EXISTS (SELECT 1 FROM bank_match_seed s WHERE s.bank_txn_id = b.id)
       ORDER BY b.posted_date, b.id`,
    )
    .all() as Array<BankTxnRow & { applied_cents: number }>;
  return rows
    .map((r) => ({ ...r, unapplied_cents: Math.abs(r.amount_cents) - r.applied_cents }))
    .filter((r) => r.unapplied_cents > 0)
    .filter((r) => (opts.side === "credit" ? r.amount_cents > 0 : opts.side === "debit" ? r.amount_cents < 0 : true))
    .filter((r) => (opts.since ? r.posted_date >= opts.since : true));
}

export interface TrialBalanceRow { account: string; name: string; debit_cents: number; credit_cents: number; balance_cents: number }

/** ledger.trial_balance as of a date. Balance is debits minus credits; the rows foot to zero by construction. */
export function trialBalance(db: Db, asOf = "9999-12-31"): TrialBalanceRow[] {
  const rows = db
    .prepare(
      `SELECT l.account, SUM(l.debit_cents) AS debit_cents, SUM(l.credit_cents) AS credit_cents
       FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE e.date <= ? GROUP BY l.account ORDER BY l.account`,
    )
    .all(asOf) as Array<{ account: string; debit_cents: number; credit_cents: number }>;
  return rows.map((r) => ({ ...r, name: accountName(r.account), balance_cents: r.debit_cents - r.credit_cents }));
}
