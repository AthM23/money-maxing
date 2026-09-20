import type { Mark, Proposal, ProposalKind } from "../../contract/types.js";
import type { ExtraCheck } from "../../kernel/types.js";
import type { Db } from "../../runtime/db.js";
import { DEFAULT_TOLERANCE, getBill, toleranceCents, type BillRow, type Tolerance } from "./match.js";
import { duplicateFail, duplicatePass } from "./marks.js";

/**
 * P7 — duplicate defence on the OBLIGATION, not on the invoice number. A vendor chasing an unpaid
 * bill re-sends the same charge under a new number, and an invoice-number check waves it through.
 *
 * This complements the kernel's DUPLICATE_PAYMENT block (src/kernel/blockRules.ts), which only fires
 * on `schedule_payment` against an already PAID document of the same amount. P7 also catches the
 * duplicate one step earlier, at `approve_bill`, and catches it after a renumbering.
 */

/** The two kinds that commit us to the money. */
const GUARDED_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>(["approve_bill", "schedule_payment"]);

/** A bill in one of these states is already an obligation we have taken on. */
const SETTLED_STATUSES: ReadonlySet<string> = new Set(["approved", "scheduled", "paid"]);

/** A service period as the month it bills, so "2026-07-01" and "2026-07" are one period, not two. */
export function normalizeServicePeriod(raw: string | null): string {
  if (!raw) return "-";
  const trimmed = raw.trim();
  const month = /^(\d{4})-(\d{2})/.exec(trimmed);
  return month ? `${month[1]}-${month[2]}` : trimmed.toUpperCase();
}

/**
 * The part of an obligation that has to agree exactly: vendor, service period as a month, and the
 * purchase order — two bills against DIFFERENT purchase orders are two obligations even when
 * everything else agrees, which is the false-duplicate guard, not a loophole.
 *
 * The amount is deliberately NOT in the key. It is compared against the band E4 already tolerates
 * (`sameObligation`), because a re-numbered bill one cent apart is the same charge, and a key that
 * demands the cents agree hands the vendor a way through.
 */
export function obligationKey(bill: Pick<BillRow, "party_id" | "service_period" | "po_id">): string {
  return [bill.party_id, normalizeServicePeriod(bill.service_period), bill.po_id ?? "-"].join("|");
}

/** The band, taken on the larger total, so the comparison reads the same whichever bill arrived first. */
function duplicateBandCents(bill: BillRow, other: BillRow, tol: Tolerance): number {
  return toleranceCents(Math.max(bill.total_cents, other.total_cents), tol);
}

/** One charge twice: the key agrees and the totals are inside the band E4 would have let through anyway. */
function sameObligation(bill: BillRow, other: BillRow, tol: Tolerance): boolean {
  if (obligationKey(bill) !== obligationKey(other)) return false;
  return Math.abs(bill.total_cents - other.total_cents) <= duplicateBandCents(bill, other, tol);
}

/** Uppercase, drop punctuation, drop the leading zeros of every number: INV-0042, inv 42 and INV42 are one number. */
export function normalizeInvoiceNo(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}

export interface DuplicateHit {
  bill_id: string;
  reason: string;
}

/** The other bill that already covers this obligation, if there is one. */
export function findDuplicateObligation(db: Db, bill: BillRow, tol: Tolerance = DEFAULT_TOLERANCE): DuplicateHit | undefined {
  const number = normalizeInvoiceNo(bill.vendor_invoice_no);
  for (const other of siblingBills(db, bill)) {
    if (SETTLED_STATUSES.has(other.status) && sameObligation(bill, other, tol)) {
      return { bill_id: other.id, reason: repeatReason(bill, other, duplicateBandCents(bill, other, tol)) };
    }
    if (normalizeInvoiceNo(other.vendor_invoice_no) === number) {
      return {
        bill_id: other.id,
        reason: `bill ${bill.id} carries vendor invoice number ${bill.vendor_invoice_no}, already on bill ${other.id} (${other.status}) for ${bill.party_id}`,
      };
    }
  }
  return undefined;
}

function repeatReason(bill: BillRow, other: BillRow, band: number): string {
  return (
    `bill ${bill.id} (${bill.vendor_invoice_no}) repeats an obligation already ${other.status}: ` +
    `bill ${other.id} (${other.vendor_invoice_no}) carries the same vendor, service period and purchase order ` +
    `(obligation key ${obligationKey(bill)}), and its ${other.total_cents} cents is within ${band} cents ` +
    `of this bill's ${bill.total_cents}`
  );
}

/** Every other live bill from the same vendor. A voided bill is not an obligation. */
function siblingBills(db: Db, bill: BillRow): BillRow[] {
  return db
    .prepare(
      `SELECT id, party_id, po_id, vendor_invoice_no, service_period, total_cents, open_cents, status, trace_id
       FROM bill WHERE party_id = ? AND id <> ? AND status <> 'void' ORDER BY bill_date, id`,
    )
    .all(bill.party_id, bill.id) as BillRow[];
}

/** The tolerance is E4's, passed in by the pack, so the two checks can never disagree by a cent. */
export function duplicateObligationCheck(db: Db, tol: Tolerance = DEFAULT_TOLERANCE): ExtraCheck {
  return (proposal) => {
    if (!GUARDED_KINDS.has(proposal.kind)) return [];
    const billIds = [...new Set(proposal.applications.map((app) => app.doc_id))];
    return billIds.map((billId) => markForBill(db, proposal, billId, tol));
  };
}

function markForBill(db: Db, proposal: Proposal, billId: string, tol: Tolerance): Mark {
  const refs = [billId, proposal.party_id];
  try {
    const bill = getBill(db, billId);
    if (!bill) return duplicateFail(`bill ${billId} is not in the ledger, so it cannot be cleared of duplicates`, refs);
    const hit = findDuplicateObligation(db, bill, tol);
    if (hit) return duplicateFail(hit.reason, [...refs, hit.bill_id]);
    const detail =
      `no other live bill for ${bill.party_id} carries obligation key ${obligationKey(bill)} ` +
      `within ${toleranceCents(bill.total_cents, tol)} cents of ${bill.total_cents}, ` +
      `or vendor invoice number ${bill.vendor_invoice_no}`;
    return duplicatePass(detail, refs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return duplicateFail(`duplicate check on bill ${billId} could not be re-performed: ${message}`, refs);
  }
}
