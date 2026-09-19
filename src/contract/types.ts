// Contract types: Proposal and Mark from PROJECT_SPEC.md §8, plus the enums both lanes switch on.
// zod schemas are the source of truth; the TS types are inferred from them.
// Changed only with both people in the conversation.
import { z } from 'zod';

/** Integer cents. Models never add numbers and nothing here is ever a float. */
export const Cents = z.number().int().safe();
export type Cents = z.infer<typeof Cents>;
export const NonNegCents = Cents.nonnegative();

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const IsoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'expected ISO-8601 UTC');
export const PeriodId = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');

/** Function packs. Spelled as in tests/cases.csv `pack`, so the eval joins without a mapping. */
export const FUNCTIONS = ['ar', 'ap', 'bank-rec', 'revenue', 'close', 'forecast', 'reporting', 'audit', 'equity'] as const;
export const Fn = z.enum(FUNCTIONS);
export type Fn = z.infer<typeof Fn>;

/** Non-pack emitters allowed in event.from_function. */
export const SYSTEM_SOURCES = ['ingest', 'drift', 'kernel', 'runtime', 'memory', 'human', 'mirror', 'seed'] as const;
export const EventSource = z.enum([...FUNCTIONS, ...SYSTEM_SOURCES]);
export type EventSource = z.infer<typeof EventSource>;

/** What the eval scores (tests/README.md). INVARIANT is a corpus label, never a runtime route. */
export const ROUTES = ['AUTO', 'PROPOSE', 'ESCALATE', 'REFUSE', 'BLOCK'] as const;
export const Route = z.enum(ROUTES);
export type Route = z.infer<typeof Route>;

export const DecisionMode = z.enum(['live', 'replay', 'shadow']);
export type DecisionMode = z.infer<typeof DecisionMode>;

export const AutonomyLevel = z.enum(['shadow', 'review', 'auto']);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

/** trace.source values. Bank and payout are files (Phase 0 decisions 3 and 4). */
export const TRACE_SOURCES = [
  'gmail', 'slack', 'hubspot', 'quickbooks', 'bank_file', 'payout_file',
  'contract_file', 'board_consent_file', 'policy_memo', 'q2_workbook', 'grants_ledger', 'payroll_register',
] as const;
export const TraceSource = z.enum(TRACE_SOURCES);
export type TraceSource = z.infer<typeof TraceSource>;

export const REVERSAL_MODES = ['none', 'auto_next_period', 'on_bill_arrival', 'accumulate_true_up'] as const;
export const ReversalMode = z.enum(REVERSAL_MODES);
export type ReversalMode = z.infer<typeof ReversalMode>;

export const PROPOSAL_KINDS = [
  'apply_payment', 'credit_memo', 'write_off', 'customer_credit', 'dispute_hold',
  'approve_bill', 'hold_bill', 'schedule_payment', 'bank_adjustment',
  'rev_recognition', 'accrual', 'amortization', 'payroll_accrual', 'no_action',
] as const;
export const ProposalKind = z.enum(PROPOSAL_KINDS);
export type ProposalKind = z.infer<typeof ProposalKind>;

export const Application = z.object({
  doc_id: z.string().min(1),
  amount_cents: Cents.positive(),
});
export type Application = z.infer<typeof Application>;

export const EntryLine = z
  .object({
    account: z.string().min(1),
    debit_cents: NonNegCents,
    credit_cents: NonNegCents,
    memo: z.string(),
  })
  .refine((l) => (l.debit_cents === 0) !== (l.credit_cents === 0), 'exactly one of debit_cents / credit_cents is non-zero');
export type EntryLine = z.infer<typeof EntryLine>;

export const Evidence = z.object({
  claim: z.string().min(1),
  trace_id: z.string().min(1),
  quote: z.string().min(1).optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Confidence = z.enum(['high', 'medium', 'low']);

/**
 * The only thing an agent can submit. Shape checks only: whether debits equal credits, a quote is really in
 * its trace, or the period is open is the kernel's job (spec §9), so that a failure is a Mark, not a parse error.
 */
export const Proposal = z.object({
  intent_id: z.string().min(1),
  function: Fn,
  kind: ProposalKind,
  party_id: z.string().min(1),
  /** Bank line this proposal consumes, when there is one. +P0: the kernel's "applications fit the bank amount". */
  bank_txn_id: z.string().min(1).optional(),
  /** Accounting date; defaults to the bank line or document date in the runtime. +P0: the kernel's period check. */
  entry_date: IsoDate.optional(),
  applications: z.array(Application),
  entries: z.array(EntryLine),
  terms_change: z
    .object({ pct_off: z.number().min(0).max(100).optional(), until: IsoDate.optional() })
    .optional(),
  /** +P0 required by the kernel when kind is 'accrual' or 'payroll_accrual'. */
  reversal_mode: ReversalMode.optional(),
  evidence: z.array(Evidence),
  policy_refs: z.array(z.string()),
  fact_refs: z.array(z.string()),
  judgment: z.array(z.object({ note: z.string().min(1), confidence: Confidence })),
});
export type Proposal = z.infer<typeof Proposal>;

/** Audit tick-mark classes: Formal, Evidence, Process, Judgment. */
export const MARK_CLASSES = ['F', 'E', 'P', 'J'] as const;
export const Mark = z.object({
  cls: z.enum(MARK_CLASSES),
  check: z.string().min(1),
  status: z.enum(['pass', 'fail', 'judgment']),
  detail: z.string(),
  refs: z.array(z.string()),
});
export type Mark = z.infer<typeof Mark>;

export const KernelVerdict = z.enum(['accept', 'reject']);
export type KernelVerdict = z.infer<typeof KernelVerdict>;

/** `escalate(question)`: what was checked and 2-4 treatments, so the human answers once and in scope. */
export const EscalationQuestion = z.object({
  intent_id: z.string().min(1),
  function: Fn,
  party_id: z.string().min(1).optional(),
  ask_user: z.string().min(1),
  question: z.string().min(1),
  checked: z.array(z.string()).min(1),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), treatment: z.string().min(1) })).min(2).max(4),
  /** party | predicate | decision kind. No period, so July run 2 does not ask again. */
  dedupe_key: z.string().min(1),
  amount_cents: Cents.optional(),
});
export type EscalationQuestion = z.infer<typeof EscalationQuestion>;

/** `record_fact_candidate(fact)`. Applicability is decided in code from scope and validity, never by a model. */
export const FactScope = z.object({
  function: z.array(Fn).optional(),
  decision_kinds: z.array(ProposalKind).optional(),
  contract_id: z.string().optional(),
  doc_ids: z.array(z.string()).optional(),
  max_amount_cents: Cents.optional(),
});
export type FactScope = z.infer<typeof FactScope>;

export const FactCandidate = z.object({
  party_id: z.string().min(1).optional(),
  predicate: z.string().min(1),
  value: z.unknown(),
  scope: FactScope,
  valid_from: IsoDate,
  valid_to: IsoDate.optional(),
  source_trace_ids: z.array(z.string()).min(1),
  stated_by: z.string().optional(),
  explained_amount_cents: Cents.optional(),
});
export type FactCandidate = z.infer<typeof FactCandidate>;

/** One row of the bus. `topic` is checked against TOPICS by emit(), not here, to keep this file import-free. */
export const BusEvent = z.object({
  id: z.number().int().positive(),
  ts: IsoTimestamp,
  topic: z.string().min(1),
  from_function: EventSource,
  intent_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type BusEvent = z.infer<typeof BusEvent>;
