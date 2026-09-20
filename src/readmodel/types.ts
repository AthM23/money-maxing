import type { PackSummary, Finding } from "../audit/types.js";
import type { FactCandidateView } from "../memory/facts.js";
import type { Scoreboard } from "../learn/scoreboard.js";

/**
 * Shapes the demo console reads. Every field is read from the tables in AGENTS.md; nothing here is invented and
 * nothing here writes. See src/readmodel/state.ts for how each piece is built.
 */

export interface CashReceipt {
  bank_txn_id: string;
  posted_date: string;
  /** USD, as booked. */
  amount_cents: number;
  descriptor: string;
  party_id: string | null;
  entity: string | null;
  account: string | null;
  country: string | null;
  currency: string;
  /** Where the customer is, when the seeded world says (lane B's `party_profile`). */
  payer_country: string | null;
  /** From bank_txn_fx, when the receipt was foreign. */
  original_currency: string | null;
  foreign_amount_cents: number | null;
}

export interface CashGroup {
  entity: string | null;
  account: string | null;
  country: string | null;
  currency: string;
  total_cents: number;
  /** Receipts in this account that the bank converted from another currency. */
  converted_receipts: number;
  receipts: CashReceipt[];
}

export interface CashState {
  groups: CashGroup[];
  total_cents: number;
}

export interface RuleRef {
  policy_id: string;
  code: string | null;
  version: number;
}

export interface FactRef {
  fact_id: string;
  predicate: string;
  scope: string[];
  valid_from: string;
  valid_to: string;
  approved_by: string | null;
}

export interface ApprovalRef {
  approver_id: string;
  approver_kind: "human" | "controller_agent";
  outcome: string;
  note: string | null;
  approved_at: string;
}

/** Who or what is behind one decision: the mechanism (rule, fact, reader, model, plain code) plus any approvals on it. */
export interface SettledBy {
  tier: number | null;
  actor: string;
  rule: RuleRef | null;
  fact: FactRef | null;
  reader: string | null;
  model: { tier: number; model_calls: number; cost_micros: number } | null;
  approvals: ApprovalRef[];
  label: string;
}

export interface PostedEntry {
  decision_id: string;
  kind: string;
  entry_date: string;
  amount_cents: number;
  settled_by: SettledBy;
}

export interface ParkedEntry {
  decision_id: string;
  intent_id: string;
  kind: string;
  party_id: string;
  amount_cents: number;
  prepared_by: SettledBy;
  controller_note: string | null;
}

export interface OpenQuestion {
  escalation_id: string;
  decision_id: string;
  intent_id: string;
  asked_user: string;
  question: unknown;
  asked_at: string;
}

export interface BankLineRef {
  id: string;
  descriptor: string;
  posted_date: string;
  amount_cents: number;
}

export interface ReceiptRow {
  intent_id: string;
  function: string;
  status: "open" | "waiting_on_human" | "resolved";
  party_id: string;
  party_name: string | null;
  bank_line: BankLineRef | null;
  doc_ids: string[];
  expected_cents: number;
  received_cents: number;
  shortfall_cents: number;
  /** Live open balance on the case's documents, right now. */
  open_cents_now: number;
  posted: PostedEntry[];
  parked: ParkedEntry[];
  open_questions: OpenQuestion[];
}

export interface WorkpaperMark {
  check: string;
  status: string;
  detail: string;
  refs: string[];
}

export interface EvidenceOffset {
  start: number;
  end: number;
}

export interface WorkpaperEvidence {
  claim: string;
  trace_id: string;
  quote: string | null;
  /** Character offsets of the quote inside the trace's flattened text, so the UI can highlight it. Null when the quote could not be located. */
  offset: EvidenceOffset | null;
}

export interface ForeignSplit {
  currency: string;
  cash_cents: number;
  fee_cents: number;
  realized_fx_cents: number;
  held_back_cents: number;
  booked_rate_ppm: number;
  settled_rate_ppm: number;
}

export interface WorkpaperView {
  decision_id: string;
  intent_id: string;
  kind: string;
  route: string | null;
  posted_at: string | null;
  marks_by_class: { F: WorkpaperMark[]; E: WorkpaperMark[]; P: WorkpaperMark[]; J: WorkpaperMark[] };
  evidence: WorkpaperEvidence[];
  /** Present only when the decision's bank line has a foreign-currency record. */
  foreign_split: ForeignSplit | null;
}

export interface RuleCard {
  policy_id: string;
  code: string | null;
  version: number;
  status: string;
  function: string;
  name: string;
  action: { kind: string; account: string } | null;
  customer_scope: string[];
  condition: unknown;
  backtest: unknown;
  supersedes: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface FactView {
  fact_id: string;
  party_id: string;
  predicate: string;
  value: Record<string, unknown>;
  status: string;
  uses: string;
  valid_from: string;
  valid_to: string;
  approved_by: string | null;
  source_traces: { trace_id: string; text: string }[];
}

export interface MemoryState {
  active: FactView[];
  candidate: FactView[];
}

export interface CertificateFollowup {
  intent_id: string;
  parent_id: string;
  function: string;
  question: string;
  owner: string;
  created_at: string;
}

export interface AwaitingYou {
  open_questions: OpenQuestion[];
  parked_entries: ParkedEntry[];
  proposed_facts: FactCandidateView[];
  rule_drafts: RuleCard[];
  certificate_followups: CertificateFollowup[];
}

export interface AuditSummaryView {
  path: string;
  summary: PackSummary;
  findings: Finding[];
}

export interface ConsoleState {
  generated_at: string;
  cash: CashState;
  receipts: ReceiptRow[];
  /** Present only when opts.decision_id was given and it resolves. */
  workpaper: WorkpaperView | null;
  rules: RuleCard[];
  memory: MemoryState;
  awaiting_you: AwaitingYou;
  scoreboard: Scoreboard;
  /** Present only when opts.audit_pack_path was given. */
  audit: AuditSummaryView | null;
}
