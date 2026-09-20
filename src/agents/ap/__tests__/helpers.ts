import { ACCOUNTS } from "../../../contract/accounts.js";
import type { Mark, Proposal } from "../../../contract/types.js";
import type { Db } from "../../../runtime/db.js";
import { proposeEntry, type ProposeResult } from "../../../runtime/proposeEntry.js";
import { APP_CONFIG } from "../../../packs/index.js";
import { getBill } from "../match.js";
import { apClock, BILL_ID, INTENT_ID } from "./seed.js";

/** Every proposal in these tests goes through the one write path. The pack's checks arrive through the configuration, as they do at every gate. */
export function proposeAp(db: Db, proposal: Proposal, features: Record<string, string | number | boolean> = {}): ProposeResult {
  return proposeEntry(db, proposal,
    { actor: "test:ap", mode: "live", autonomy_level: "auto", tier: 0, features },
    { clock: apClock, config: APP_CONFIG });
}

export interface ApproveOptions {
  bill_id?: string;
  amount_cents?: number;
  /** Override the party, to prove the pack notices a bill that is not the vendor's. */
  party_id?: string;
  entry_date?: string;
}

/**
 * What an agent would hand to propose_entry to approve a bill: expense debited, payable credited,
 * the bill's own email quoted. The quote is an exact span of the payload the seeder writes.
 */
export function approveBillProposal(db: Db, opts: ApproveOptions = {}): Proposal {
  const bill = getBill(db, opts.bill_id ?? BILL_ID);
  if (!bill) throw new Error(`test setup: bill ${opts.bill_id ?? BILL_ID} was not seeded`);
  const amount = opts.amount_cents ?? bill.open_cents;
  const memo = `Approve bill ${bill.id} (${bill.vendor_invoice_no})`;
  return {
    intent_id: INTENT_ID, function: "ap", kind: "approve_bill", party_id: opts.party_id ?? bill.party_id,
    entry_date: opts.entry_date ?? "2026-07-12",
    applications: [{ doc_id: bill.id, amount_cents: amount }],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: amount, credit_cents: 0, memo },
      { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: amount, memo },
    ],
    evidence: [{
      claim: `bill ${bill.id} as received from the vendor`,
      trace_id: bill.trace_id ?? "missing",
      quote: `Invoice ${bill.vendor_invoice_no} against purchase order`,
    }],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}

/** Every tick mark the kernel recorded for a decision, both passes and failures. */
export function marksOf(db: Db, decisionId: string): Mark[] {
  const rows = db
    .prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid")
    .all(decisionId) as Array<{ marks_json: string }>;
  return rows.flatMap((row) => (JSON.parse(row.marks_json) as { marks: Mark[] }).marks);
}

export function findMark(marks: readonly Mark[], check: string): Mark | undefined {
  return marks.find((m) => m.check === check);
}

/** The decision a propose result belongs to, whichever way it went. */
export function decisionIdOf(result: ProposeResult): string {
  if (result.status === "invalid") throw new Error(`proposal was invalid: ${result.issues.join("; ")}`);
  return result.decision_id;
}
