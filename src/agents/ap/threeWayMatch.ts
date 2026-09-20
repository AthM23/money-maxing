import type { Mark, Proposal, ProposalKind } from "../../contract/types.js";
import type { ExtraCheck } from "../../kernel/types.js";
import type { Db } from "../../runtime/db.js";
import { matchBill, DEFAULT_TOLERANCE, type MatchResult, type Tolerance } from "./match.js";
import { matchFail, matchJudgment, matchPass } from "./marks.js";

/**
 * E4 — nothing is approved or paid on the vendor's word alone. The bill is agreed to the purchase
 * order and to the goods receipts booked against it, in code, before the entry is allowed through.
 * This complements the kernel's hard rules rather than repeating them: DUPLICATE_PAYMENT and
 * BANK_DETAILS_CHANGED already guard the payment itself (src/kernel/blockRules.ts).
 */
export interface ThreeWayMatchOptions {
  /** Floor of the tolerance band, in cents. Default 100. */
  tolerance_cents?: number;
  /** Percentage of the supported amount. The band is the larger of the two. Default 0.5. */
  tolerance_pct?: number;
}

/** Only the two kinds that let money out. Every other kind gets no mark from this check. */
const MATCHED_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>(["approve_bill", "schedule_payment"]);

/**
 * The band E4 tests a bill against. P7 reuses it (see `obligation.ts`), so a duplicate obligation
 * cannot be split off by a cent that this check would have tolerated.
 */
export function matchTolerance(opts: ThreeWayMatchOptions = {}): Tolerance {
  return {
    floor_cents: opts.tolerance_cents ?? DEFAULT_TOLERANCE.floor_cents,
    pct: opts.tolerance_pct ?? DEFAULT_TOLERANCE.pct,
  };
}

export function threeWayMatchCheck(db: Db, opts: ThreeWayMatchOptions = {}): ExtraCheck {
  const tol = matchTolerance(opts);
  return (proposal) => {
    if (!MATCHED_KINDS.has(proposal.kind)) return [];
    const applied = appliedByDoc(proposal);
    if (applied.size === 0) {
      return [matchFail(`kind ${proposal.kind} names no bill, so there is nothing to match`, [proposal.intent_id])];
    }
    return [...applied].map(([billId, cents]) => markForBill(db, proposal, billId, cents, tol));
  };
}

/** One mark per bill the proposal touches, so a workpaper names the bill that failed. */
function markForBill(db: Db, proposal: Proposal, billId: string, applied: number, tol: Tolerance): Mark {
  const refs = [billId, proposal.party_id];
  try {
    const result = matchBill(db, billId, tol);
    if (result.status === "error") return matchFail(result.detail, refs);
    if (result.bill.party_id !== proposal.party_id) {
      return matchFail(`bill ${billId} is from ${result.bill.party_id}, but the proposal names ${proposal.party_id}`, refs);
    }
    if (applied > result.bill.open_cents) {
      return matchFail(`${applied} cents applied to bill ${billId} exceeds its open amount of ${result.bill.open_cents} cents`, refs);
    }
    if (result.status === "no_po") return matchJudgment(result.detail, refs);
    if (result.status === "over") return matchFail(result.detail, refs);
    return matchPass(tiedDetail(result, applied), refs);
  } catch (err) {
    return matchFail(`three-way match on bill ${billId} could not be re-performed: ${errorMessage(err)}`, refs);
  }
}

function tiedDetail(result: Extract<MatchResult, { status: "tied" }>, applied: number): string {
  return (
    `bill ${result.bill.id} (${result.bill.vendor_invoice_no}) ties: billed ${result.billed_cents} cents, ` +
    `ordered ${result.ordered_cents} cents, received ${result.received_cents} cents, ` +
    `supported ${result.supported_cents} cents within tolerance ${result.tolerance_cents}; ${applied} cents applied`
  );
}

/** One proposal may apply to the same bill twice. The match is against the total it puts on that bill. */
function appliedByDoc(proposal: Proposal): Map<string, number> {
  const totals = new Map<string, number>();
  for (const app of proposal.applications) {
    totals.set(app.doc_id, (totals.get(app.doc_id) ?? 0) + app.amount_cents);
  }
  return totals;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
