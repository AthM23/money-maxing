import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile, Proposal } from "../../contract/types.js";
import { normalizeWs } from "../../kernel/index.js";
import type { Db } from "../../runtime/db.js";
import type { Tier0Plan } from "../../router/tier0.js";
import { getTrace } from "../../runtime/lookups.js";
import { matchBill, type BillRow, type MatchResult } from "./match.js";
import { findDuplicateObligation } from "./obligation.js";

/**
 * Tier 0 for accounts payable: the code tier. It settles a bill with no model call when the
 * three-way match ties and nothing is duplicated, and holds the bill when the numbers say so.
 * Anything it cannot re-perform is handed up with a note saying exactly what did not tie, in cents,
 * so the model tier starts from the difference instead of rediscovering it.
 *
 * Same plan shape as the AR `planTier0` (src/router/tier0.ts), so `routeTier0` can drive either.
 */

/** Until per-vendor GL coding is compiled (diagram 12-ap, AP_CODE0), a matched bill lands in misc expense. */
export const AP_EXPENSE_ACCOUNT: string = ACCOUNTS.misc_expense;

/** Longest span of a source document the pack will quote. The kernel agrees it character by character. */
const QUOTE_MAX_CHARS = 160;

export function planApTier0(db: Db, c: CaseFile, asOf?: string): Tier0Plan {
  if (c.function !== "ap") {
    return { proposals: [], unexplained_cents: 0, notes: [`case ${c.intent_id} is function ${c.function}, not ap: the AP rule tier proposes nothing`] };
  }
  if (c.doc_ids.length === 0) {
    return { proposals: [], unexplained_cents: 0, notes: [`case ${c.intent_id} names no bill: nothing for the AP rule tier to match`] };
  }
  const plans = c.doc_ids.map((billId) => planOneBill(db, c, billId, asOf));
  return {
    proposals: plans.flatMap((p) => (p.proposal ? [p.proposal] : [])),
    unexplained_cents: plans.reduce((total, p) => total + p.unexplained_cents, 0),
    notes: plans.flatMap((p) => p.notes),
  };
}

interface BillPlan {
  proposal?: Proposal;
  notes: string[];
  /** Cents this bill leaves for someone else to explain. Above zero sends the case up a tier. */
  unexplained_cents: number;
}

/** Duplicate first: a bill that repeats an obligation is held whatever its match says. */
function planOneBill(db: Db, c: CaseFile, billId: string, asOf?: string): BillPlan {
  const result = matchBill(db, billId);
  if (result.status === "error" || !result.bill) {
    return { notes: [result.status === "error" ? result.detail : `bill ${billId} could not be matched`], unexplained_cents: 0 };
  }
  const bill = result.bill;
  if (bill.status !== "open" || bill.open_cents <= 0) {
    return { notes: [`bill ${bill.id} is already ${bill.status} with ${bill.open_cents} cents open: the rule tier proposes nothing`], unexplained_cents: 0 };
  }
  const duplicate = findDuplicateObligation(db, bill);
  if (duplicate) return holdPlan(db, c, bill, duplicate.reason, bill.total_cents, asOf);
  if (result.status === "over") return holdPlan(db, c, bill, result.detail, result.billed_cents - result.supported_cents, asOf);
  if (result.status === "no_po") return { notes: [result.detail], unexplained_cents: bill.total_cents };
  return approvePlan(db, c, bill, result, asOf);
}

/** The match ties and nothing is duplicated, so the bill is approved in code, citing its own source. */
function approvePlan(db: Db, c: CaseFile, bill: BillRow, result: Extract<MatchResult, { status: "tied" }>, asOf?: string): BillPlan {
  const claim = `bill ${bill.id} ties to purchase order and goods receipts at ${result.supported_cents} cents`;
  const evidence = billEvidence(db, bill, claim, asOf);
  if (evidence.length === 0) {
    return {
      notes: [`bill ${bill.id} ties at ${result.supported_cents} cents, but no source document can be quoted for it: the rule tier will not approve unevidenced`],
      unexplained_cents: bill.total_cents,
    };
  }
  const amount = bill.open_cents;
  const memo = `Approve bill ${bill.id} (${bill.vendor_invoice_no}): three-way match ties, billed ${result.billed_cents}, supported ${result.supported_cents}`;
  const proposal = baseProposal(c, bill, "approve_bill", amount, evidence);
  proposal.entries = [
    { account: AP_EXPENSE_ACCOUNT, debit_cents: amount, credit_cents: 0, memo },
    { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: amount, memo },
  ];
  return { proposal, notes: [], unexplained_cents: 0 };
}

/**
 * The bill is held and nothing is booked: a hold posts no entry lines by design (kernel F1 treats
 * hold_bill as a no-entry kind). `Proposal` has no memo field of its own, so the reason travels on
 * the evidence claim, which is what the workpaper and the console show.
 */
function holdPlan(db: Db, c: CaseFile, bill: BillRow, reason: string, unexplained: number, asOf?: string): BillPlan {
  const claim = `Hold reason: ${reason}`;
  const evidence = billEvidence(db, bill, claim, asOf);
  const proposal = baseProposal(c, bill, "hold_bill", bill.open_cents, evidence);
  return { proposal, notes: [claim], unexplained_cents: unexplained };
}

function baseProposal(c: CaseFile, bill: BillRow, kind: Proposal["kind"], amount: number, evidence: Proposal["evidence"]): Proposal {
  return {
    intent_id: c.intent_id,
    function: c.function,
    kind,
    party_id: bill.party_id,
    entry_date: c.entry_date,
    applications: amount > 0 ? [{ doc_id: bill.id, amount_cents: amount }] : [],
    entries: [],
    evidence,
    policy_refs: [],
    fact_refs: [],
    judgment: [],
  };
}

/**
 * The bill's own source document, quoted exactly. In replay a trace recorded after the as-of instant
 * did not exist yet, so it is not cited: the kernel would reject it at E1, and rightly.
 */
function billEvidence(db: Db, bill: BillRow, claim: string, asOf?: string): Proposal["evidence"] {
  if (!bill.trace_id) return [];
  const trace = getTrace(db, bill.trace_id);
  if (!trace) return [];
  if (asOf && trace.recorded_time > asOf) return [];
  const quote = exactQuote(trace.payload_text, bill.vendor_invoice_no);
  return quote ? [{ claim, trace_id: trace.id, quote }] : [];
}

/**
 * A span the kernel can agree character by character at E2. E2 normalises whitespace on both sides,
 * so a normalised slice of the normalised payload is always an exact quote. The span starts at the
 * vendor's invoice number when the document mentions it, and at the top of the document otherwise.
 */
function exactQuote(payloadText: string, invoiceNo: string): string | undefined {
  const text = normalizeWs(payloadText);
  if (text.length === 0) return undefined;
  const found = text.indexOf(normalizeWs(invoiceNo));
  const start = found >= 0 ? found : 0;
  const end = Math.min(text.length, start + QUOTE_MAX_CHARS);
  const span = text.slice(start, end);
  if (end === text.length) return span;
  const lastSpace = span.lastIndexOf(" ");
  return lastSpace > 0 ? span.slice(0, lastSpace) : span;
}
