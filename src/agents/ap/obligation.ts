import type { Mark, Proposal, ProposalKind } from "../../contract/types.js";
import type { ExtraCheck } from "../../kernel/types.js";
import type { Db } from "../../runtime/db.js";
import { getBill, type BillRow } from "./match.js";
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

/**
 * The same charge, however it is labelled: vendor, service period and amount, plus the purchase
 * order when the bill cites one. Two bills against DIFFERENT purchase orders are two obligations
 * even when the vendor, period and amount agree — that is the false-duplicate guard, not a loophole.
 */
export function obligationKey(bill: Pick<BillRow, "party_id" | "service_period" | "total_cents" | "po_id">): string {
  const parts = [bill.party_id, bill.service_period ?? "-", String(bill.total_cents)];
  if (bill.po_id) parts.push(bill.po_id);
  return parts.join("|");
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
export function findDuplicateObligation(db: Db, bill: BillRow): DuplicateHit | undefined {
  const key = obligationKey(bill);
  const number = normalizeInvoiceNo(bill.vendor_invoice_no);
  for (const other of siblingBills(db, bill)) {
    if (SETTLED_STATUSES.has(other.status) && obligationKey(other) === key) {
      return {
        bill_id: other.id,
        reason:
          `bill ${bill.id} (${bill.vendor_invoice_no}) repeats an obligation already ${other.status}: ` +
          `bill ${other.id} (${other.vendor_invoice_no}) carries the same vendor, service period and amount ` +
          `(obligation key ${key})`,
      };
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

/** Every other live bill from the same vendor. A voided bill is not an obligation. */
function siblingBills(db: Db, bill: BillRow): BillRow[] {
  return db
    .prepare(
      `SELECT id, party_id, po_id, vendor_invoice_no, service_period, total_cents, open_cents, status, trace_id
       FROM bill WHERE party_id = ? AND id <> ? AND status <> 'void' ORDER BY bill_date, id`,
    )
    .all(bill.party_id, bill.id) as BillRow[];
}

export function duplicateObligationCheck(db: Db): ExtraCheck {
  return (proposal) => {
    if (!GUARDED_KINDS.has(proposal.kind)) return [];
    const billIds = [...new Set(proposal.applications.map((app) => app.doc_id))];
    return billIds.map((billId) => markForBill(db, proposal, billId));
  };
}

function markForBill(db: Db, proposal: Proposal, billId: string): Mark {
  const refs = [billId, proposal.party_id];
  try {
    const bill = getBill(db, billId);
    if (!bill) return duplicateFail(`bill ${billId} is not in the ledger, so it cannot be cleared of duplicates`, refs);
    const hit = findDuplicateObligation(db, bill);
    if (hit) return duplicateFail(hit.reason, [...refs, hit.bill_id]);
    const detail =
      `no other live bill for ${bill.party_id} carries obligation key ${obligationKey(bill)} ` +
      `or vendor invoice number ${bill.vendor_invoice_no}`;
    return duplicatePass(detail, refs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return duplicateFail(`duplicate check on bill ${billId} could not be re-performed: ${message}`, refs);
  }
}
