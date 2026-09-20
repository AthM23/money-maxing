import { ACCOUNTS } from "../contract/accounts.js";
import { MATERIALITY_CENTS, type ProposalKind } from "../contract/types.js";
import type { ExtraCheck } from "../kernel/types.js";
import type { Db } from "./db.js";

export interface RuntimeConfig {
  materiality_cents: number;
  fiscal_window: { from: string; to: string };
  /** Accounts that are routine for a kind. Anything else on a line needs evidence (kernel E5). */
  standard_accounts: Partial<Record<ProposalKind, readonly string[]>>;
  /** Accounts a kind may post its judgment amount to (kernel J4). From the written policy memo; a kind not listed is unrestricted. */
  allowed_accounts: Partial<Record<ProposalKind, readonly string[]>>;
  /**
   * Checks a function's pack adds to the kernel (AP: three-way match, duplicate obligation). They are built from
   * the database at every gate, so an approval re-tests today's world, not the world when the entry was proposed.
   */
  pack_checks?: Partial<Record<string, (db: Db) => ExtraCheck[]>>;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  materiality_cents: MATERIALITY_CENTS,
  fiscal_window: { from: "2026-01-01", to: "2026-12-31" },
  standard_accounts: {
    rev_recognition: [ACCOUNTS.deferred_revenue, ACCOUNTS.subscription_revenue],
    amortization: [ACCOUNTS.prepaid],
  },
  allowed_accounts: {
    // A price concession on a subscription still being delivered reduces deferred revenue, or contra-revenue once earned.
    credit_memo: [ACCOUNTS.deferred_revenue, ACCOUNTS.concessions],
    // A write-off is an expense of collecting, never a direct hit to revenue.
    write_off: [ACCOUNTS.bank_charges, ACCOUNTS.misc_expense],
    // Tax withheld at source is an asset recoverable against the certificate. It is never a discount or an expense.
    tax_withholding: [ACCOUNTS.wht_receivable],
    customer_credit: [ACCOUNTS.customer_credits],
    apply_payment: [ACCOUNTS.customer_credits],
  },
};

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
