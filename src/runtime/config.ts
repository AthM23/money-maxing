import { ACCOUNTS } from "../contract/accounts.js";
import { MATERIALITY_CENTS, type ProposalKind } from "../contract/types.js";

export interface RuntimeConfig {
  materiality_cents: number;
  fiscal_window: { from: string; to: string };
  /** Accounts that are routine for a kind. Anything else on a line needs evidence (kernel E5). */
  standard_accounts: Partial<Record<ProposalKind, readonly string[]>>;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  materiality_cents: MATERIALITY_CENTS,
  fiscal_window: { from: "2026-01-01", to: "2026-12-31" },
  standard_accounts: {
    rev_recognition: [ACCOUNTS.deferred_revenue, ACCOUNTS.subscription_revenue],
    amortization: [ACCOUNTS.prepaid],
  },
};

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
