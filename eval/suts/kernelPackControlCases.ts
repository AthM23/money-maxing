import { ACCOUNTS } from "../../src/contract/accounts.js";
import type { Proposal } from "../../src/contract/types.js";
import type { Db } from "../../src/runtime/index.js";
import { approveDecision, proposeEntry } from "../../src/runtime/index.js";
import {
  DEPS,
  baseProposal,
  fixedClock,
  fromApproveResult,
  fromProposeResult,
  insertApprover,
  insertBankTxn,
  insertBill,
  insertIntent,
  insertInvoice,
  insertParty,
  insertPeriod,
  insertTrace,
  newDb,
  postOpeningBalance,
  type Outcome,
} from "./kernelPackFixtures.js";

/** G-03: posting into a closed period. Block should fire on the proposal itself (H3/PERIOD_LOCKED)
 *  before anyone is asked to approve anything. */
function setupG03(db: Db): Proposal {
  insertPeriod(db, "2026-06", "locked");
  insertParty(db, "cust_g03", "customer", "Closed Period Co");
  insertInvoice(db, "INV-G03", "cust_g03", "2026-06-01", "2026-06-30", 100_000, 100_000, "open");
  insertBankTxn(db, "BTX-G03", "2026-06-15", 100_000, "ACH CLOSED PERIOD CO", "ach", "cust_g03");
  insertIntent(db, "int_g03", "ar", "Apply a payment dated inside a locked period");
  return baseProposal({
    intent_id: "int_g03",
    function: "ar",
    kind: "apply_payment",
    party_id: "cust_g03",
    entry_date: "2026-06-15",
    bank_txn_id: "BTX-G03",
    applications: [{ doc_id: "INV-G03", amount_cents: 100_000 }],
    entries: [
      { account: ACCOUNTS.cash, debit_cents: 100_000, credit_cents: 0, memo: "ACH into a locked period" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 100_000, memo: "ACH into a locked period" },
    ],
  });
}

export function caseG03(): Outcome {
  const db = newDb();
  const proposal = setupG03(db);
  const r = proposeEntry(db, proposal, { actor: "agent:ar", mode: "live", autonomy_level: "auto", tier: 0 }, DEPS);
  return fromProposeResult(r);
}

/** G-02: preparer equals approver. The preparer's own id is added to the approver table with a
 *  very high limit, so OVER_APPROVER_LIMIT cannot be the one that fires instead. */
function setupG02(db: Db): Proposal {
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "cust_g02", "customer", "Segregation Co");
  insertInvoice(db, "INV-G02", "cust_g02", "2026-07-01", "2026-07-31", 500_000, 500_000, "open");
  postOpeningBalance(db, {
    id: "je_open_g02",
    period: "2026-07",
    date: "2026-07-01",
    memo: "Opening AR",
    lines: [
      { account: ACCOUNTS.ar, debit_cents: 500_000, credit_cents: 0 },
      { account: ACCOUNTS.deferred_revenue, debit_cents: 0, credit_cents: 500_000 },
    ],
  });
  insertIntent(db, "int_g02", "ar", "Concession credit memo");
  insertTrace(db, "tr_g02", { partyId: "cust_g02", payload: { body: "Approved a $1,500 concession for Segregation Co." } });
  insertApprover(db, "agent:ar_g02", "agent", 99_999_999, "AR agent");
  return baseProposal({
    intent_id: "int_g02",
    function: "ar",
    kind: "credit_memo",
    party_id: "cust_g02",
    entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-G02", amount_cents: 150_000 }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: 150_000, credit_cents: 0, memo: "Concession" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 150_000, memo: "Concession" },
    ],
    evidence: [{ claim: "Concession approved", trace_id: "tr_g02", quote: "Approved a $1,500 concession for Segregation Co." }],
  });
}

export function caseG02(): Outcome {
  const db = newDb();
  const proposal = setupG02(db);
  const parked = proposeEntry(db, proposal, { actor: "agent:ar_g02", mode: "live", autonomy_level: "auto", tier: 2 }, DEPS);
  if (parked.status !== "pending_approval") return fromProposeResult(parked);
  const r = approveDecision(db, parked.decision_id, { approver_id: "agent:ar_g02", approver_kind: "human", outcome: "approved" }, DEPS);
  return fromApproveResult(r);
}

/** B-24: a $14,000 adjustment against a $10,000 controller limit. Preparer and approver are
 *  deliberately different actors, so OVER_APPROVER_LIMIT is the only rule in play. */
function setupB24(db: Db): Proposal {
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "cust_b24", "customer", "Big Write-off Co");
  insertInvoice(db, "INV-B24", "cust_b24", "2026-07-01", "2026-07-31", 2_000_000, 2_000_000, "open");
  postOpeningBalance(db, {
    id: "je_open_b24",
    period: "2026-07",
    date: "2026-07-01",
    memo: "Opening AR",
    lines: [
      { account: ACCOUNTS.ar, debit_cents: 2_000_000, credit_cents: 0 },
      { account: ACCOUNTS.deferred_revenue, debit_cents: 0, credit_cents: 2_000_000 },
    ],
  });
  insertIntent(db, "int_b24", "ar", "Write-off over the controller's limit");
  insertTrace(db, "tr_b24", { partyId: "cust_b24", payload: { body: "Uncollectible balance approved for write-off." } });
  insertApprover(db, "U_CTRL_B24", "controller", 1_000_000, "Priya");
  return baseProposal({
    intent_id: "int_b24",
    function: "ar",
    kind: "write_off",
    party_id: "cust_b24",
    entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-B24", amount_cents: 1_400_000 }],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: 1_400_000, credit_cents: 0, memo: "Write-off" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1_400_000, memo: "Write-off" },
    ],
    evidence: [{ claim: "Uncollectible balance approved for write-off", trace_id: "tr_b24", quote: "Uncollectible balance approved for write-off." }],
  });
}

export function caseB24(): Outcome {
  const db = newDb();
  const proposal = setupB24(db);
  const parked = proposeEntry(db, proposal, { actor: "agent:ap_b24", mode: "live", autonomy_level: "auto", tier: 2 }, DEPS);
  if (parked.status !== "pending_approval") return fromProposeResult(parked);
  const r = approveDecision(db, parked.decision_id, { approver_id: "U_CTRL_B24", approver_kind: "human", outcome: "approved" }, DEPS);
  return fromApproveResult(r);
}

/** G-01 / H-1: a human clicks approve on a duplicate payment. The same vendor and amount as an
 *  already-paid bill, under a new invoice number. DUPLICATE_PAYMENT is stage-independent, so the
 *  real system is expected to block this on the proposal itself, before any approval happens. */
function setupDuplicatePayment(db: Db): Proposal {
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "vendor_dup", "vendor", "Northwind Supply");
  insertBill(db, "BILL-DUP-1", "vendor_dup", "NW-1001", "2026-06-01", "2026-06-30", 1_250_000, 0, "paid");
  insertBill(db, "BILL-DUP-2", "vendor_dup", "NW-1002", "2026-07-01", "2026-07-31", 1_250_000, 1_250_000, "approved");
  postOpeningBalance(db, {
    id: "je_open_dup",
    period: "2026-07",
    date: "2026-07-01",
    memo: "Opening AP for the approved bill",
    lines: [
      { account: ACCOUNTS.misc_expense, debit_cents: 1_250_000, credit_cents: 0 },
      { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: 1_250_000 },
    ],
  });
  insertIntent(db, "int_dup", "ap", "Schedule payment for BILL-DUP-2");
  insertApprover(db, "U_AP_LARGE_LIMIT", "controller", 99_999_999, "Large-limit approver");
  return baseProposal({
    intent_id: "int_dup",
    function: "ap",
    kind: "schedule_payment",
    party_id: "vendor_dup",
    entry_date: "2026-07-14",
    applications: [{ doc_id: "BILL-DUP-2", amount_cents: 1_250_000 }],
    entries: [
      { account: ACCOUNTS.ap, debit_cents: 1_250_000, credit_cents: 0, memo: "Schedule payment BILL-DUP-2" },
      { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: 1_250_000, memo: "Schedule payment BILL-DUP-2" },
    ],
  });
}

export function caseDuplicatePayment(): Outcome {
  const db = newDb();
  const proposal = setupDuplicatePayment(db);
  const proposed = proposeEntry(db, proposal, { actor: "agent:ap_dup", mode: "live", autonomy_level: "auto", tier: 2 }, DEPS);
  if (proposed.status === "blocked") return { route: "BLOCK", block_rule: proposed.rule };
  if (proposed.status !== "pending_approval") return fromProposeResult(proposed);
  const approved = approveDecision(
    db,
    proposed.decision_id,
    { approver_id: "U_AP_LARGE_LIMIT", approver_kind: "human", outcome: "approved" },
    DEPS,
  );
  return fromApproveResult(approved);
}

/** G-04: a rule a controller approved with a $10,000 ceiling is cited on a $50,000 write-off.
 *  RULE_ABOVE_APPROVER_AUTHORITY is stage-independent too, so this is expected to block on propose. */
function setupG04(db: Db): Proposal {
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "cust_g04", "customer", "Big Rule Co");
  insertInvoice(db, "INV-G04", "cust_g04", "2026-07-01", "2026-07-31", 6_000_000, 6_000_000, "open");
  postOpeningBalance(db, {
    id: "je_open_g04",
    period: "2026-07",
    date: "2026-07-01",
    memo: "Opening AR",
    lines: [
      { account: ACCOUNTS.ar, debit_cents: 6_000_000, credit_cents: 0 },
      { account: ACCOUNTS.deferred_revenue, debit_cents: 0, credit_cents: 6_000_000 },
    ],
  });
  insertIntent(db, "int_g04", "ar", "Write-off citing a controller-approved rule");
  insertTrace(db, "tr_g04", { partyId: "cust_g04", payload: { body: "Per the approved write-off policy for Big Rule Co." } });
  insertApprover(db, "U_CTRL_G04", "controller", 1_000_000, "Priya");
  db.prepare(
    `INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, max_amount_cents, status, approved_by, approved_at)
     VALUES ('pol_g04', 'ar', 'Routine write-offs for Big Rule Co', ?, ?, 'Approved by controller for routine write-offs', 'company', 1000000, 'approved', 'U_CTRL_G04', ?)`,
  ).run(
    JSON.stringify({ all: [{ field: "party_id", op: "==", value: "cust_g04" }] }),
    JSON.stringify({ kind: "write_off", account: ACCOUNTS.misc_expense }),
    fixedClock.now(),
  );
  return baseProposal({
    intent_id: "int_g04",
    function: "ar",
    kind: "write_off",
    party_id: "cust_g04",
    entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-G04", amount_cents: 5_000_000 }],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: 5_000_000, credit_cents: 0, memo: "Write-off per policy" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 5_000_000, memo: "Write-off per policy" },
    ],
    policy_refs: ["pol_g04"],
    evidence: [{ claim: "Per approved write-off policy", trace_id: "tr_g04" }],
  });
}

export function caseG04(): Outcome {
  const db = newDb();
  const proposal = setupG04(db);
  const r = proposeEntry(db, proposal, { actor: "agent:ar_g04", mode: "live", autonomy_level: "auto", tier: 1 }, DEPS);
  return fromProposeResult(r);
}

/** F-09: an entry dated 2024 while the fiscal window is 2026. The period itself is left OPEN so
 *  only P9's date check can fail — otherwise an absent period row would block on PERIOD_LOCKED
 *  first and mask the case this is meant to exercise. */
function setupF09(db: Db): Proposal {
  insertPeriod(db, "2024-07", "open");
  insertParty(db, "cust_f09", "customer", "Time Traveler Co");
  insertInvoice(db, "INV-F09", "cust_f09", "2024-07-01", "2024-07-31", 50_000, 50_000, "open");
  postOpeningBalance(db, {
    id: "je_open_f09",
    period: "2024-07",
    date: "2024-07-01",
    memo: "Opening AR",
    lines: [
      { account: ACCOUNTS.ar, debit_cents: 50_000, credit_cents: 0 },
      { account: ACCOUNTS.deferred_revenue, debit_cents: 0, credit_cents: 50_000 },
    ],
  });
  insertBankTxn(db, "BTX-F09", "2024-07-12", 50_000, "ACH TIME TRAVELER CO", "ach", "cust_f09");
  insertIntent(db, "int_f09", "ar", "Apply a payment dated with an invented year");
  return baseProposal({
    intent_id: "int_f09",
    function: "ar",
    kind: "apply_payment",
    party_id: "cust_f09",
    entry_date: "2024-07-12",
    bank_txn_id: "BTX-F09",
    applications: [{ doc_id: "INV-F09", amount_cents: 50_000 }],
    entries: [
      { account: ACCOUNTS.cash, debit_cents: 50_000, credit_cents: 0, memo: "ACH" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 50_000, memo: "ACH" },
    ],
  });
}

export function caseF09(): Outcome {
  const db = newDb();
  const proposal = setupF09(db);
  const before = (db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n;
  const r = proposeEntry(db, proposal, { actor: "agent:ar_f09", mode: "live", autonomy_level: "auto", tier: 0 }, DEPS);
  const after = (db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n;
  const outcome = fromProposeResult(r);
  if (before !== after) {
    return { ...outcome, error: `${outcome.error ?? ""} gl_entry count changed from ${before} to ${after}`.trim() };
  }
  return outcome;
}
