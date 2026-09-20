import {
  MATERIALITY_CENTS,
  type EntryLine,
  type KernelResult,
  type Mark,
  type MarkStatus,
  type Proposal,
  type ProposalKind,
} from "../../contract/types.js";
import type {
  ApproverLite,
  BankTxnLite,
  ControlTotals,
  DocLite,
  FactLite,
  KernelContext,
  PolicyLite,
  TraceLite,
} from "../types.js";

export const CASH = "1000 Cash";
export const AR = "1200 Accounts receivable";
export const AP = "2000 Accounts payable";
export const DEFERRED = "2400 Deferred revenue";
export const REVENUE = "4000 Revenue";
export const BAD_DEBT = "6100 Bad debt expense";
export const EXPENSE = "6000 Operating expense";

/** Everything the kernel can look up, as plain arrays. */
export interface World {
  traces?: TraceLite[];
  docs?: DocLite[];
  bankTxns?: BankTxnLite[];
  facts?: FactLite[];
  policies?: PolicyLite[];
  approvers?: ApproverLite[];
  /** Routine accounts per kind. Anything else on a line is a judgment and needs evidence (E5). */
  standard?: Partial<Record<ProposalKind, readonly string[]>>;
}

export function line(account: string, debit_cents: number, credit_cents: number, memo = ""): EntryLine {
  return { account, debit_cents, credit_cents, memo };
}

export function trace(id: string, payload_text: string, over: Partial<TraceLite> = {}): TraceLite {
  return { id, recorded_time: "2026-09-10T12:00:00Z", payload_text, ...over };
}

export function invoice(id: string, party_id: string, open_cents: number, over: Partial<DocLite> = {}): DocLite {
  return { id, kind: "invoice", party_id, total_cents: open_cents, open_cents, date: "2026-08-01", ...over };
}

export function bill(id: string, party_id: string, open_cents: number, over: Partial<DocLite> = {}): DocLite {
  return { id, kind: "bill", party_id, total_cents: open_cents, open_cents, date: "2026-08-01", ...over };
}

export function bankTxn(id: string, amount_cents: number, over: Partial<BankTxnLite> = {}): BankTxnLite {
  return { id, amount_cents, posted_date: "2026-09-12", ...over };
}

export function fact(id: string, over: Partial<FactLite> = {}): FactLite {
  return {
    id,
    party_id: "cust:initech",
    predicate: "discount_terms",
    value: { amount_cents: 120_000 },
    status: "active",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    learned_at: "2026-02-01T09:00:00Z",
    uses: "standing",
    used_count: 0,
    ...over,
  };
}

export function policy(id: string, over: Partial<PolicyLite> = {}): PolicyLite {
  return {
    id,
    function: "ar",
    status: "approved",
    condition: { field: "shortfall_cents", op: "<=", value: 200_000 },
    action: { kind: "credit_memo", account: DEFERRED },
    ...over,
  };
}

export function approver(id: string, limit_cents: number, over: Partial<ApproverLite> = {}): ApproverLite {
  return { id, role: "controller", limit_cents, ...over };
}

function index<T extends { id: string }>(rows: readonly T[] | undefined): (id: string) => T | undefined {
  const map = new Map((rows ?? []).map((row) => [row.id, row]));
  return (id: string) => map.get(id);
}

/** Balances tied at zero movement, so a proposal's own deltas are what F3 actually tests. */
function defaultControl(): KernelContext["control"] {
  return {
    ar_account: AR,
    ap_account: AP,
    cash_account: CASH,
    ar_gl_cents: 5_000_000,
    ar_subledger_cents: 5_000_000,
    ap_gl_cents: 3_000_000,
    ap_subledger_cents: 3_000_000,
  };
}

/** Overrides for makeCtx. `control` may be partial; everything else replaces the default. */
export type CtxOverrides = Partial<Omit<KernelContext, "control">> & { control?: Partial<ControlTotals> };

export function makeCtx(world: World = {}, over: CtxOverrides = {}): KernelContext {
  const base: KernelContext = {
    mode: "live",
    period: { id: "2026-09", status: "open" },
    fiscal_window: { from: "2026-01-01", to: "2026-12-31" },
    preparer: "agent:ar",
    autonomy_level: "auto",
    materiality_cents: MATERIALITY_CENTS,
    open_escalations: 0,
    control: defaultControl(),
    standardAccounts: (kind: ProposalKind) => world.standard?.[kind] ?? [],
    features: {},
    getTrace: index(world.traces),
    getDoc: index(world.docs),
    getBankTxn: index(world.bankTxns),
    getFact: index(world.facts),
    getPolicy: index(world.policies),
    getApprover: index(world.approvers),
  };
  return { ...base, ...over, control: { ...base.control, ...over.control } };
}

export function makeProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    intent_id: "int-1",
    function: "ar",
    kind: "no_action",
    party_id: "cust:initech",
    entry_date: "2026-09-15",
    applications: [],
    entries: [],
    evidence: [],
    policy_refs: [],
    fact_refs: [],
    judgment: [],
    ...over,
  };
}

/** The CEO email behind the Initech credit memo, used by the demo mutation test. */
export const CEO_EMAIL_TEXT = [
  "From: dana@initech.example",
  "Subject: Re: INV-9001",
  "",
  "We are short 120,000 cents this quarter because the",
  "September onboarding slipped. Approved: issue a credit",
  "memo for the shortfall and we will pay the balance now.",
].join("\n");

export const CEO_EMAIL_QUOTE = "Approved: issue a credit memo for the shortfall";

export function marksOf(result: KernelResult, check: string): Mark[] {
  return result.marks.filter((m) => m.check === check);
}

/** The single mark for a check. Throws loudly if a check emitted none or more than one. */
export function markOf(result: KernelResult, check: string): Mark {
  const found = marksOf(result, check);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${check} mark, got ${found.length} of [${checkIds(result).join(", ")}]`);
  }
  return found[0] as Mark;
}

export function statusOf(result: KernelResult, check: string): MarkStatus {
  return markOf(result, check).status;
}

export function checkIds(result: KernelResult): string[] {
  return result.marks.map((m) => m.check);
}
