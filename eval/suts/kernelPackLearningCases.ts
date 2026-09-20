import { ACCOUNTS } from "../../src/contract/accounts.js";
import { compilePolicies, approvePolicy } from "../../src/learn/compile.js";
import type { FactCandidate } from "../../src/memory/facts.js";
import { approveFact, recordFactCandidate } from "../../src/memory/facts.js";
import type { Db } from "../../src/runtime/index.js";
import { routeTier0 } from "../../src/router/route.js";
import {
  DEPS,
  fixedClock,
  insertApprover,
  insertBankTxn,
  insertInvoice,
  insertIntent,
  insertParty,
  insertPeriod,
  insertTrace,
  newDb,
  postOpeningBalance,
  seedDecisionPoints,
  type Outcome,
} from "./kernelPackFixtures.js";

/** G-05: one correction is not a rule. MIN_AGREEING in src/learn/compile.ts is 3, so a single
 *  decision point should never even form a draft. */
export function caseG05(): Outcome {
  const db = newDb();
  seedDecisionPoints(db, "ar", "cust_g05", [
    { id: "dp_g05_1", shortfallCents: 1500, kind: "write_off", account: ACCOUNTS.bank_charges },
  ]);
  const drafts = compilePolicies(db, fixedClock, "ar");
  const policyCount = (db.prepare("SELECT COUNT(*) AS n FROM policy").get() as { n: number }).n;
  if (drafts.length === 0 && policyCount === 0) {
    return { route: "REFUSE", refuse_places_looked: ["decision_point history: 1 agreeing case, 3 required"] };
  }
  return {
    route: "PROPOSE",
    error: `compilePolicies generalised a rule from a single decision point: drafts=${drafts.length}, policy rows=${policyCount}`,
  };
}

/** G-06: four agreeing write-offs plus one dispute_hold inside the same shortfall range. The
 *  dispute_hold has no `account`, so it never forms its own candidate group, but it still counts
 *  in the backtest run against the write-off group's condition (src/learn/compile.ts runBacktest
 *  scans every loaded point, not just the grouped ones) — which is what should refuse the draft. */
function seedG06Points(db: Db): void {
  seedDecisionPoints(db, "ar", "cust_g06", [
    { id: "dp_g06_1", shortfallCents: 1000, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g06_2", shortfallCents: 1200, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g06_3", shortfallCents: 1400, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g06_4", shortfallCents: 1600, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g06_5", shortfallCents: 1300, kind: "dispute_hold" },
  ]);
}

export function caseG06(): Outcome {
  const db = newDb();
  seedG06Points(db);
  const drafts = compilePolicies(db, fixedClock, "ar");
  const draft = drafts[0];
  if (draft && draft.policy_id === null && draft.refused_reason) {
    return { route: "BLOCK", block_rule: "BACKTEST_MISCLEAR" };
  }
  return {
    route: "NOT_RUN",
    error: `compilePolicies did not refuse the mis-clearing rule as expected: ${JSON.stringify(drafts)}`,
  };
}

/** Records a fact candidate and immediately approves it, collapsing the two-step memory API into
 *  the single outcome G-07 needs: either the new fact's id, or why it never went active. */
function recordAndApproveFact(db: Db, input: FactCandidate, approverId: string): { fact_id: string } | { detail: string } {
  const candidate = recordFactCandidate(db, fixedClock, input);
  if (candidate.status !== "candidate") return { detail: `fact candidate was rejected: ${JSON.stringify(candidate)}` };
  const approved = approveFact(db, fixedClock, candidate.fact_id, approverId);
  if (approved.status !== "active") return { detail: `fact did not activate: ${JSON.stringify(approved)}` };
  return { fact_id: candidate.fact_id };
}

/** G-07: a second, contradicting correction for the same party and predicate. src/memory/facts.ts
 *  approveFact supersedes the prior active fact rather than editing it in place. */
export function caseG07(): Outcome {
  const db = newDb();
  insertParty(db, "cust_g07", "customer", "Contradiction Co");
  insertApprover(db, "U_CTRL_G07", "controller", 1_000_000, "Priya");
  insertTrace(db, "tr_g07_a", { partyId: "cust_g07", payload: { body: "10% off confirmed for Contradiction Co." } });
  insertTrace(db, "tr_g07_b", { partyId: "cust_g07", payload: { body: "Correction: only 5% off for Contradiction Co." } });

  const first = recordAndApproveFact(
    db,
    {
      party_id: "cust_g07", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"],
      uses: "standing", valid_from: "2026-07-01", valid_to: "2027-06-30", source_trace_ids: ["tr_g07_a"], stated_by: "ceo@example.test",
    },
    "U_CTRL_G07",
  );
  if ("detail" in first) return { route: "ESCALATE", escalate_unknown: first.detail };

  const second = recordAndApproveFact(
    db,
    {
      party_id: "cust_g07", predicate: "concession_pct", value: { pct_off: 5 }, kinds: ["credit_memo"],
      uses: "standing", valid_from: "2026-07-01", valid_to: "2027-06-30", source_trace_ids: ["tr_g07_b"], stated_by: "ceo@example.test",
    },
    "U_CTRL_G07",
  );
  if ("detail" in second) return { route: "ESCALATE", escalate_unknown: second.detail };

  return checkSupersession(db, first.fact_id, second.fact_id);
}

function checkSupersession(db: Db, firstId: string, secondId: string): Outcome {
  const firstRow = db.prepare("SELECT status FROM fact WHERE id = ?").get(firstId) as { status: string } | undefined;
  const secondRow = db.prepare("SELECT status FROM fact WHERE id = ?").get(secondId) as { status: string } | undefined;
  if (firstRow?.status === "superseded" && secondRow?.status === "active") return { route: "PROPOSE" };
  return {
    route: "ESCALATE",
    escalate_unknown: `expected first=superseded, second=active; got first=${firstRow?.status}, second=${secondRow?.status}`,
  };
}

/** G-08 setup, part 1: learn a policy from five agreeing wire write-offs whose largest shortfall
 *  is 4,500 cents, then approve it. Returns null if the learner did not produce an approved policy. */
function setupG08Policy(db: Db): string | null {
  insertApprover(db, "U_CTRL_G08", "controller", 1_000_000, "Priya");
  seedDecisionPoints(db, "ar", "cust_g08", [
    { id: "dp_g08_1", shortfallCents: 1000, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g08_2", shortfallCents: 2000, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g08_3", shortfallCents: 3000, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g08_4", shortfallCents: 4000, kind: "write_off", account: ACCOUNTS.bank_charges },
    { id: "dp_g08_5", shortfallCents: 4500, kind: "write_off", account: ACCOUNTS.bank_charges },
  ]);
  const draft = compilePolicies(db, fixedClock, "ar")[0];
  if (!draft || draft.policy_id === null) return null;
  const approved = approvePolicy(db, fixedClock, draft.policy_id, "U_CTRL_G08");
  return approved.status === "approved" ? draft.policy_id : null;
}

interface WireCase {
  intent_id: string; function: "ar"; party_id: string; entry_date: string; bank_txn_id: string;
  doc_ids: string[]; expected_cents: number; received_cents: number; shortfall_cents: number; method: string; trace_ids: string[];
}

/** G-08 setup, part 2: two live wire shortfalls for the same party — 4,000 cents (inside the
 *  learned ceiling) and 6,000 cents (outside it) — each tied to a real invoice, bank line and trace. */
function setupG08LiveCases(db: Db): { caseA: WireCase; caseB: WireCase } {
  insertPeriod(db, "2026-07", "open");
  insertParty(db, "cust_g08", "customer", "Wire Shortfall Co");
  insertInvoice(db, "INV-G08-A", "cust_g08", "2026-07-01", "2026-07-31", 2_000_000, 2_000_000, "open");
  insertInvoice(db, "INV-G08-B", "cust_g08", "2026-07-01", "2026-07-31", 2_000_000, 2_000_000, "open");
  postOpeningBalance(db, {
    id: "je_open_g08", period: "2026-07", date: "2026-07-01", memo: "Opening AR",
    lines: [
      { account: ACCOUNTS.ar, debit_cents: 4_000_000, credit_cents: 0 },
      { account: ACCOUNTS.deferred_revenue, debit_cents: 0, credit_cents: 4_000_000 },
    ],
  });
  insertBankTxn(db, "BTX-G08-A", "2026-07-15", 1_996_000, "WIRE CUST G08 A", "wire", "cust_g08");
  insertBankTxn(db, "BTX-G08-B", "2026-07-16", 1_994_000, "WIRE CUST G08 B", "wire", "cust_g08");
  insertTrace(db, "tr_g08_a", { partyId: "cust_g08", payload: { descriptor: "WIRE CUST G08 A", amount_cents: 1_996_000 } });
  insertTrace(db, "tr_g08_b", { partyId: "cust_g08", payload: { descriptor: "WIRE CUST G08 B", amount_cents: 1_994_000 } });
  insertIntent(db, "int_g08_a", "ar", "Resolve wire shortfall A");
  insertIntent(db, "int_g08_b", "ar", "Resolve wire shortfall B");
  return {
    caseA: {
      intent_id: "int_g08_a", function: "ar", party_id: "cust_g08", entry_date: "2026-07-15", bank_txn_id: "BTX-G08-A",
      doc_ids: ["INV-G08-A"], expected_cents: 2_000_000, received_cents: 1_996_000, shortfall_cents: 4000, method: "wire", trace_ids: ["tr_g08_a"],
    },
    caseB: {
      intent_id: "int_g08_b", function: "ar", party_id: "cust_g08", entry_date: "2026-07-16", bank_txn_id: "BTX-G08-B",
      doc_ids: ["INV-G08-B"], expected_cents: 2_000_000, received_cents: 1_994_000, shortfall_cents: 6000, method: "wire", trace_ids: ["tr_g08_b"],
    },
  };
}

/** G-08: does the learned rule stay clamped to the 4,500 cent ceiling it was learned from? Case A
 *  (4,000) should clear AUTO on the policy; case B (6,000) should NOT also clear unattended in the
 *  same database — if it does, the rule was not clamped, and that is reported rather than hidden. */
export function caseG08(): Outcome {
  const db = newDb();
  const policyId = setupG08Policy(db);
  if (!policyId) return { route: "NOT_RUN", error: "compilePolicies/approvePolicy did not produce an approved policy from 5 agreeing points" };
  const { caseA, caseB } = setupG08LiveCases(db);
  const live = { mode: "live" as const, autonomy_level: "auto" as const };

  const outA = routeTier0(db, caseA, live, DEPS);
  if (outA.status !== "done" || outA.routes.length === 0 || !outA.routes.every((r) => r === "AUTO")) {
    return { route: "NOT_RUN", error: `the 4,000 cent case did not clear as AUTO: ${JSON.stringify({ status: outA.status, routes: outA.routes })}` };
  }
  const writeOff = outA.results[outA.results.length - 1];
  const line = writeOff?.status === "posted" && writeOff.entry_id
    ? (db.prepare("SELECT debit_cents FROM gl_line WHERE entry_id = ? AND account = ?").get(writeOff.entry_id, ACCOUNTS.bank_charges) as { debit_cents: number } | undefined)
    : undefined;

  const outB = routeTier0(db, caseB, live, DEPS);
  const notClamped = outB.status === "done" && outB.routes.length > 0 && outB.routes.every((r) => r === "AUTO");

  const outcome: Outcome = { route: "AUTO", auto_posted_entry_matches_key: !notClamped && line?.debit_cents === 4000 };
  if (notClamped) outcome.error = "a 6,000 cent wire shortfall also cleared unattended in the same database: the learned rule was not clamped to its 4,500 cent ceiling";
  return outcome;
}
