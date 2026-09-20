import { z } from "zod";

/** Money is integer cents everywhere. A float on a money path is a bug (corpus F-07). */
export const Cents = z.number().int();
export const NonNegCents = Cents.nonnegative();
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");

export const FUNCTIONS = [
  "ar", "ap", "bank-rec", "revenue", "close", "forecast", "reporting", "audit", "equity",
] as const;
export const Fn = z.enum(FUNCTIONS);
export type Fn = z.infer<typeof Fn>;

/** What the corpus scores. INVARIANT is an engineering property, not a routed outcome. */
export const ROUTES = ["AUTO", "PROPOSE", "ESCALATE", "REFUSE", "BLOCK"] as const;
export const Route = z.enum(ROUTES);
export type Route = z.infer<typeof Route>;

export const PROPOSAL_KINDS = [
  "apply_payment", "credit_memo", "write_off", "customer_credit", "dispute_hold",
  "approve_bill", "hold_bill", "schedule_payment", "bank_adjustment",
  "rev_recognition", "accrual", "amortization", "payroll_accrual", "no_action",
  // DECIDE: artifact kinds for forecast and reporting (board README, schema gaps).
  "forecast_artifact", "report_artifact",
] as const;
export const ProposalKind = z.enum(PROPOSAL_KINDS);
export type ProposalKind = z.infer<typeof ProposalKind>;

export const EntryLine = z
  .object({
    account: z.string().min(1),
    debit_cents: NonNegCents,
    credit_cents: NonNegCents,
    memo: z.string(),
  })
  .refine((l) => !(l.debit_cents > 0 && l.credit_cents > 0), "a line is a debit or a credit, not both");
export type EntryLine = z.infer<typeof EntryLine>;

export const Evidence = z.object({
  claim: z.string().min(1),
  trace_id: z.string().min(1),
  quote: z.string().min(1).optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Proposal = z.object({
  intent_id: z.string().min(1),
  function: Fn,
  kind: ProposalKind,
  party_id: z.string().min(1),
  /** Date the entry carries. Guarded against the open fiscal window (corpus F-09). */
  entry_date: IsoDate,
  /** Bank transaction being applied, when kind is apply_payment or bank_adjustment. */
  bank_txn_id: z.string().min(1).optional(),
  applications: z.array(z.object({ doc_id: z.string().min(1), amount_cents: NonNegCents })),
  entries: z.array(EntryLine),
  terms_change: z.object({ pct_off: z.number().min(0).max(100).optional(), until: IsoDate.optional() }).optional(),
  /** Accruals must say how they reverse (board correction 6). */
  reversal_mode: z.enum(["auto_next_period", "on_invoice", "accumulating", "none"]).optional(),
  evidence: z.array(Evidence),
  policy_refs: z.array(z.string()),
  fact_refs: z.array(z.string()),
  judgment: z.array(z.object({ note: z.string().min(1), confidence: z.enum(["high", "medium", "low"]) })),
});
export type Proposal = z.infer<typeof Proposal>;

/**
 * DRAFT (added by Person A, 20:05): the structured difference the drift monitor attaches to an intent
 * (`intent.case_json`). It is the hand-off from Person B's comparators to Person A's router.
 */
export const CaseFile = z.object({
  intent_id: z.string().min(1),
  function: Fn,
  party_id: z.string().min(1),
  entry_date: IsoDate,
  bank_txn_id: z.string().min(1).optional(),
  /** Open documents the money or the difference relates to, oldest first. */
  doc_ids: z.array(z.string().min(1)),
  expected_cents: Cents,
  received_cents: Cents,
  /** expected minus received. Positive means short-paid. */
  shortfall_cents: Cents,
  method: z.enum(["ach", "wire", "check", "card", "other"]).optional(),
  trace_ids: z.array(z.string().min(1)),
  /** Replay only: document balances as they stood at the decision, because today's ledger already shows them paid. */
  docs_snapshot: z
    .array(z.object({
      id: z.string().min(1), kind: z.enum(["invoice", "bill"]), party_id: z.string().min(1),
      total_cents: Cents, open_cents: Cents, date: IsoDate,
    }))
    .optional(),
});
export type CaseFile = z.infer<typeof CaseFile>;

/**
 * DRAFT (added by Person A): what the humans actually booked at a Q2 decision point
 * (`decision_point.human_outcome_json`). Written by the seeder, scored in code, never visible to an agent.
 */
export const HumanOutcome = z.object({
  kind: ProposalKind,
  /** The account the judgment amount went to, e.g. 6150 for a bank fee. Absent for a plain cash application. */
  account: z.string().optional(),
  amount_cents: Cents,
  doc_ids: z.array(z.string().min(1)),
  asked_user: z.string().nullable().optional(),
  note: z.string().optional(),
});
export type HumanOutcome = z.infer<typeof HumanOutcome>;

export const MARK_CLASSES = ["F", "E", "P", "J"] as const;
export type MarkClass = (typeof MARK_CLASSES)[number];
export type MarkStatus = "pass" | "fail" | "judgment";

/** One audit tick mark on a workpaper. F footed, E agreed to source, P approved by, J per policy. */
export interface Mark {
  cls: MarkClass;
  check: string;
  status: MarkStatus;
  detail: string;
  refs: string[];
}

/** Hard rules that hold even when a human approves (board sheet 04). Persisted by name. */
export const BLOCK_RULES = [
  "DUPLICATE_PAYMENT",
  "PREPARER_EQUALS_APPROVER",
  "PERIOD_LOCKED",
  "RULE_ABOVE_APPROVER_AUTHORITY",
  "BANK_DETAILS_CHANGED",
  "OVER_APPROVER_LIMIT",
] as const;
export type BlockRule = (typeof BLOCK_RULES)[number];

export type AutonomyLevel = "auto" | "review" | "shadow";

export type KernelVerdict = "accept" | "reject" | "block";

/** The kernel runs twice: on the proposal, then again as a post gate with the approver's identity. */
export type KernelStage = "proposal" | "post_gate";

export interface KernelResult {
  stage: KernelStage;
  verdict: KernelVerdict;
  /** True when materiality, autonomy level or leftover judgment means a person must approve before posting. */
  requires_approval: boolean;
  marks: Mark[];
  failed: Mark[];
  /** Set only when verdict is block. */
  block_rule?: BlockRule;
  /** Marks the kernel re-performed itself, over all marks. */
  checkable_num: number;
  checkable_den: number;
}

/** DECIDE (roadmap Phase 0, q1): the approval threshold. One number for now; the board proposes three. */
export const MATERIALITY_CENTS = 50_000;
