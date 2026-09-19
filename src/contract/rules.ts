// Phase 0 decisions as constants (logged in context/PROJECT_STATUS.md, 2026-09-19 ~20:15 ET), so the kernel,
// the router and the engines read one value. Changed only with both people in the conversation.
import type { Cents } from './types.js';

/** Spec §9 P: an entry above this needs an approval record. */
export const APPROVAL_THRESHOLD_CENTS: Cents = 500_00;

/**
 * Decision 1. Above the threshold the route is PROPOSE unless an active, in-scope fact or approved policy
 * carries a human approver's authority ceiling that covers the amount. Then, and only then, AUTO is allowed,
 * and the approval row records `via_fact_id` / `via_policy_id`.
 */
export const AUTO_ABOVE_THRESHOLD = 'fact_or_policy_ceiling_only' as const;

/**
 * Decision 2. The GPT controller is a reviewer. PROPOSE is satisfied only by a human approver
 * (approval.role = 'approver' implies actor_kind = 'human'; the schema enforces it).
 */
export const MODEL_CONTROLLER_ROLE = 'reviewer' as const;

/** Decision 3. Bank feed is a seeded file behind bank.*; no Increase sandbox. */
export const BANK_FEED = 'file' as const;

/** Decision 4. Processor payout (A-07 / H-2) is in as a file, built only as a Phase 3 stretch. */
export const PROCESSOR_PAYOUT = 'file_stretch' as const;

/** Bank vs ledger cash tolerance: zero, so the $12.40 always opens an intent. */
export const CASH_TIEOUT_TOLERANCE_CENTS: Cents = 0;

/** Spec §9 autonomy ladder, per decision kind, from replay agreement. */
export const AUTONOMY_LADDER = {
  auto: { min_agreement: 0.95, min_n: 5 },
  review: { min_agreement: 0.8, min_n: 1 },
} as const;

export const PERIODS = {
  history: ['2026-04', '2026-05', '2026-06'],
  live: '2026-07',
} as const;
