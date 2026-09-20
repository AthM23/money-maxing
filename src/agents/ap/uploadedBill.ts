import type { Clock } from "../../runtime/config.js";
import type { Db } from "../../runtime/db.js";

/** Bills filed from an upload on the pipeline page carry this prefix; nothing else may be reviewed here. */
export const UPLOADED_BILL_PREFIX = "BILL-UP-";

export type BillReviewResult =
  | { status: "reviewed"; bill_id: string; now: "accepted" | "void"; by: string }
  | { status: "already_decided"; bill_id: string; bill: string }
  | { status: "not_found" | "not_an_upload"; bill_id: string }
  | { status: "blocked"; rule: "UNKNOWN_APPROVER" | "OVER_APPROVER_LIMIT"; detail: string };

const usd = (cents: number): string => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * A person accepts or rejects a bill that arrived as an upload. The web button and the Slack button both end here.
 *
 * Accepting is NOT approval. In this ledger `bill.status = 'approved'` means the payable was booked by an
 * `approve_bill` entry through the kernel, and F3 ties the approved bills to the AP control account before every
 * proposal: a status flipped by hand unties them, and from then on the kernel refuses every entry in the month.
 * So an accepted bill stays `open`; who accepted it, and when, is a row in `bill_review`. Rejecting voids the bill,
 * which takes it out of payables altogether.
 *
 * Who may accept: a person on the approval matrix whose limit covers the bill. Anyone else is refused by name.
 */
export function reviewUploadedBill(db: Db, clock: Clock, billId: string, approverId: string, outcome: "approved" | "rejected"): BillReviewResult {
  if (!billId.startsWith(UPLOADED_BILL_PREFIX)) return { status: "not_an_upload", bill_id: billId };
  const bill = db.prepare("SELECT status, total_cents FROM bill WHERE id = ?").get(billId) as { status: string; total_cents: number } | undefined;
  if (!bill) return { status: "not_found", bill_id: billId };
  const earlier = db.prepare("SELECT outcome FROM bill_review WHERE bill_id = ?").get(billId) as { outcome: string } | undefined;
  if (earlier || bill.status !== "open") return { status: "already_decided", bill_id: billId, bill: earlier?.outcome ?? bill.status };

  const person = db.prepare("SELECT name, role, limit_cents FROM approver WHERE id = ?").get(approverId) as { name: string; role: string; limit_cents: number } | undefined;
  if (!person || person.role === "controller_agent") {
    return { status: "blocked", rule: "UNKNOWN_APPROVER", detail: `${approverId} is not a person on the approval matrix, so they cannot accept or reject a bill.` };
  }
  if (outcome === "approved" && person.limit_cents < bill.total_cents) {
    return { status: "blocked", rule: "OVER_APPROVER_LIMIT", detail: `${person.name} may approve up to ${usd(person.limit_cents)}; this bill is ${usd(bill.total_cents)}.` };
  }

  db.transaction(() => {
    db.prepare("INSERT INTO bill_review (bill_id, outcome, approver_id, reviewed_at) VALUES (?, ?, ?, ?)").run(billId, outcome === "approved" ? "accepted" : "rejected", approverId, clock.now());
    if (outcome === "rejected") db.prepare("UPDATE bill SET status = 'void', open_cents = 0 WHERE id = ?").run(billId);
  })();
  return { status: "reviewed", bill_id: billId, now: outcome === "approved" ? "accepted" : "void", by: approverId };
}

/** One line a person can read, for a toast or a Slack reply. */
export function billReviewSaid(result: BillReviewResult): string {
  if (result.status === "reviewed") {
    return result.now === "accepted" ? "Accepted for the payment run. Nothing posts to the ledger: the payable is booked when the bill is approved through the kernel." : "Rejected and voided.";
  }
  if (result.status === "blocked") return `Not accepted. ${result.detail}`;
  if (result.status === "already_decided") return `Already decided (${result.bill}).`;
  return result.status === "not_found" ? "No such bill." : "Only uploaded bills are reviewed here.";
}
