import type { AutonomyLevel, Mark, Proposal, ProposalKind } from "../contract/types.js";

/**
 * Everything the kernel may look at. Plain data and lookups only: the kernel never imports a
 * database, a connector or a model client, so it can be re-run by an auditor on any entry.
 */
export interface TraceLite {
  id: string;
  recorded_time: string;
  /** The trace payload flattened to text. Quotes are checked against this. */
  payload_text: string;
  party_id?: string | null;
}

export interface DocLite {
  id: string;
  kind: "invoice" | "bill";
  party_id: string;
  total_cents: number;
  open_cents: number;
  date: string;
}

export interface BankTxnLite {
  id: string;
  /** Signed: money in is positive. */
  amount_cents: number;
  posted_date: string;
  party_id?: string | null;
}

export interface FactLite {
  id: string;
  party_id: string;
  predicate: string;
  status: "candidate" | "approved" | "active" | "expired" | "superseded";
  valid_from: string;
  valid_to: string;
  learned_at: string;
  uses: "standing" | "one_time";
  /** How many posted decisions already cited this fact. A one_time fact may be used once. */
  used_count: number;
  kinds?: ProposalKind[];
  max_amount_cents?: number | null;
  approved_by?: string | null;
}

/** The small rule language compiled policies use. Evaluated in code, never by a model. */
export type ConditionLeaf = {
  field: string;
  op: "==" | "!=" | "<=" | "<" | ">=" | ">" | "in";
  value: string | number | boolean | Array<string | number>;
};
export type Condition = { all: Condition[] } | { any: Condition[] } | ConditionLeaf;

export interface PolicyLite {
  id: string;
  function: string;
  status: "proposed" | "approved" | "retired";
  condition: Condition;
  max_amount_cents?: number | null;
  approved_by?: string | null;
}

export interface ApproverLite {
  id: string;
  role: string;
  limit_cents: number;
}

export interface ApprovalLite {
  approver_id: string;
  approver_kind: "human" | "controller_agent";
  outcome: "approved" | "rejected" | "corrected";
}

export interface ControlTotals {
  ar_account: string;
  ap_account: string;
  cash_account: string;
  /** Balances BEFORE this proposal posts, in cents. AP is stated as a positive liability. */
  ar_gl_cents: number;
  ar_subledger_cents: number;
  ap_gl_cents: number;
  ap_subledger_cents: number;
}

export type ExtraCheck = (proposal: Proposal, ctx: KernelContext) => Mark[];

export interface KernelContext {
  mode: "live" | "replay";
  /** Replay only: nothing recorded after this instant may be cited. */
  as_of?: string;
  period: { id: string; status: "open" | "closing" | "locked" };
  fiscal_window: { from: string; to: string };
  preparer: string;
  autonomy_level: AutonomyLevel;
  /** Absent on the proposal pass. Present on the post gate when someone approved. */
  approval?: ApprovalLite | null;
  materiality_cents: number;
  /** Unanswered escalations attached to this decision. */
  open_escalations: number;
  control: ControlTotals;
  /** Accounts that are routine for a kind. Any other account on a line needs evidence (E5). */
  standardAccounts(kind: ProposalKind): readonly string[];
  /** Facts the policy condition evaluator may read, e.g. shortfall_cents, method, party_id. */
  features: Readonly<Record<string, string | number | boolean>>;
  getTrace(id: string): TraceLite | undefined;
  getDoc(id: string): DocLite | undefined;
  getBankTxn(id: string): BankTxnLite | undefined;
  getFact(id: string): FactLite | undefined;
  getPolicy(id: string): PolicyLite | undefined;
  getApprover(id: string): ApproverLite | undefined;
  /** DUPLICATE_PAYMENT: a different paid document for the same vendor and amount. */
  findPaidDuplicate?(party_id: string, amount_cents: number, exclude_doc_ids: string[]): { doc_id: string } | undefined;
  /** BANK_DETAILS_CHANGED: remit-to differs from the details last paid, with no out-of-band confirmation on record. */
  remitChangedUnverified?(party_id: string): boolean;
  /** Pack-specific checks (three-way match, typed bank-rec match groups, forecast opening cash). */
  extra_checks?: ExtraCheck[];
}
