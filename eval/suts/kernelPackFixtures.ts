import type { ApproveResult, Clock, Db, ProposeResult, RuntimeDeps } from "../../src/runtime/index.js";
import { openDb } from "../../src/runtime/index.js";
import type { CaseOutcome } from "../sut.js";
import type { Proposal, ProposalKind } from "../../src/contract/types.js";

/** What one case handler returns before the harness fills in case_id, cost_micros and model_calls. */
export type Outcome = Omit<CaseOutcome, "case_id" | "cost_micros" | "model_calls">;

/** Every case runs at the same instant, so decisions and traces are reproducible. */
export const fixedClock: Clock = { now: () => "2026-07-14T16:00:00.000Z" };

export const DEPS: RuntimeDeps = { clock: fixedClock };

/** A fresh in-memory database with the real schema applied, nothing seeded. */
export function newDb(): Db {
  return openDb();
}

export function insertParty(
  db: Db,
  id: string,
  kind: "customer" | "vendor" | "employee" | "bank" | "other",
  name: string,
): void {
  db.prepare("INSERT INTO party (id, kind, name) VALUES (?, ?, ?)").run(id, kind, name);
}

export function insertPeriod(db: Db, id: string, status: "open" | "closing" | "locked"): void {
  db.prepare("INSERT INTO period (id, status) VALUES (?, ?)").run(id, status);
}

export function insertApprover(db: Db, id: string, role: string, limitCents: number, name = id): void {
  db.prepare("INSERT INTO approver (id, name, role, limit_cents) VALUES (?, ?, ?, ?)").run(id, name, role, limitCents);
}

export function insertInvoice(
  db: Db,
  id: string,
  partyId: string,
  issueDate: string,
  dueDate: string,
  totalCents: number,
  openCents: number,
  status: string,
): void {
  db.prepare(
    "INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, partyId, issueDate, dueDate, totalCents, openCents, status);
}

export function insertBill(
  db: Db,
  id: string,
  partyId: string,
  vendorInvoiceNo: string,
  billDate: string,
  dueDate: string,
  totalCents: number,
  openCents: number,
  status: string,
): void {
  db.prepare(
    "INSERT INTO bill (id, party_id, vendor_invoice_no, bill_date, due_date, total_cents, open_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, partyId, vendorInvoiceNo, billDate, dueDate, totalCents, openCents, status);
}

export function insertBankTxn(
  db: Db,
  id: string,
  postedDate: string,
  amountCents: number,
  descriptor: string,
  method: string,
  partyId: string,
): void {
  db.prepare(
    "INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, postedDate, amountCents, descriptor, method, partyId);
}

export function insertIntent(
  db: Db,
  id: string,
  fn: string,
  question: string,
  opts: { owner?: string; status?: string } = {},
): void {
  db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    fn,
    question,
    opts.owner ?? "seed",
    opts.status ?? "open",
    fixedClock.now(),
  );
}

/** A trace whose payload is flattened to text by the kernel's own payloadText — nest the string
 *  under any key and a quote naming it verbatim is still found. */
export function insertTrace(db: Db, id: string, opts: { partyId?: string; recordedTime?: string; payload: unknown }): void {
  const recorded = opts.recordedTime ?? fixedClock.now();
  db.prepare(
    `INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json)
     VALUES (?, 'gmail', 'email', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, id, recorded, recorded, fixedClock.now(), opts.partyId ?? null, `h_${id}`, JSON.stringify(opts.payload));
}

export interface OpeningLine {
  account: string;
  debit_cents: number;
  credit_cents: number;
}

/** Ties a control account to its subledger before any proposal runs (kernel F3), the same way
 *  src/runtime/__tests__/seed.ts posts opening balances. The period named must already exist. */
export function postOpeningBalance(
  db: Db,
  opts: { id: string; period: string; date: string; memo: string; lines: readonly OpeningLine[] },
): void {
  const intentId = `int_open_${opts.id}`;
  const decisionId = `dec_open_${opts.id}`;
  db.prepare(
    "INSERT INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'revenue', 'Opening balances', 'seed', 'resolved', ?)",
  ).run(intentId, fixedClock.now());
  db.prepare(
    "INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at) VALUES (?, ?, 'revenue', 'live', 'no_action', 'seed', 'auto', ?)",
  ).run(decisionId, intentId, fixedClock.now());
  db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    opts.id,
    opts.period,
    opts.date,
    decisionId,
    opts.memo,
    fixedClock.now(),
  );
  const insertLine = db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES (?, ?, ?, ?, ?)");
  opts.lines.forEach((line, i) => insertLine.run(opts.id, i + 1, line.account, line.debit_cents, line.credit_cents));
}

/** Fill in the parts of a Proposal every case leaves empty; callers override only what the
 *  scenario needs (kind, party, entries, and whatever evidence/refs the routing depends on). */
export function baseProposal(
  fields: Pick<Proposal, "intent_id" | "function" | "kind" | "party_id" | "entry_date" | "entries"> & Partial<Proposal>,
): Proposal {
  return { applications: [], evidence: [], policy_refs: [], fact_refs: [], judgment: [], ...fields };
}

export interface SeedPoint {
  id: string;
  shortfallCents: number;
  kind: ProposalKind;
  account?: string;
  method?: string;
}

/** decision_point rows shaped like src/learn/__tests__/learn.test.ts's seedQ2: a CaseFile the
 *  drift monitor would have produced, paired with what a human actually booked. Used to exercise
 *  compilePolicies without touching the __tests__ seed module. */
export function seedDecisionPoints(db: Db, fn: string, partyId: string, points: readonly SeedPoint[]): void {
  const insert = db.prepare(
    `INSERT INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json)
     VALUES (?, ?, '2026-05', 'short_pay', '[]', ?, ?, ?)`,
  );
  points.forEach((p, i) => {
    const doc = `${p.id}-doc`;
    const day = String(10 + i).padStart(2, "0");
    const caseFile = {
      intent_id: `int_${p.id}`,
      function: fn,
      party_id: partyId,
      entry_date: `2026-05-${day}`,
      doc_ids: [doc],
      expected_cents: 2_000_000,
      received_cents: 0,
      shortfall_cents: p.shortfallCents,
      method: p.method ?? "wire",
      trace_ids: [],
      docs_snapshot: [{ id: doc, kind: "invoice", party_id: partyId, total_cents: 2_000_000, open_cents: p.shortfallCents, date: "2026-05-01" }],
    };
    const humanOutcome: Record<string, unknown> = { kind: p.kind, amount_cents: p.shortfallCents, doc_ids: [doc] };
    if (p.account) humanOutcome.account = p.account;
    insert.run(p.id, fn, `2026-05-${day}T12:00:00Z`, JSON.stringify(caseFile), JSON.stringify(humanOutcome));
  });
}

/** Never reached: exhaustiveness guard so a new ProposeResult/ApproveResult variant fails to compile. */
function assertNever(x: never): never {
  throw new Error(`kernel-pack SUT: unhandled runtime result variant ${JSON.stringify(x)}`);
}

/** Map what proposeEntry actually did to the harness's route vocabulary. Never guesses: a status
 *  the case did not expect is reported as NOT_RUN with the detail in `error`, not coerced. */
export function fromProposeResult(r: ProposeResult): Outcome {
  switch (r.status) {
    case "blocked":
      return { route: "BLOCK", block_rule: r.rule };
    case "rejected":
      return { route: "REFUSE", refuse_places_looked: r.failed.map((m) => `kernel:${m.check}`) };
    case "posted":
      return { route: "AUTO" };
    case "pending_approval":
      return { route: "PROPOSE" };
    case "invalid":
      return { route: "NOT_RUN", error: `proposeEntry returned invalid: ${r.issues.join("; ")}` };
    case "replay_recorded":
      return { route: "NOT_RUN", error: `proposeEntry returned replay_recorded (route ${r.route}) for a live-mode case` };
    default:
      return assertNever(r);
  }
}

/** Same idea as fromProposeResult, for the answer to a parked decision. */
export function fromApproveResult(r: ApproveResult): Outcome {
  switch (r.status) {
    case "blocked":
      return { route: "BLOCK", block_rule: r.rule };
    case "rejected":
      return { route: "REFUSE", refuse_places_looked: r.failed.map((m) => `kernel:${m.check}`) };
    case "posted":
      return { route: "PROPOSE" };
    case "declined":
      return { route: "NOT_RUN", error: "approveDecision returned declined: nothing to route" };
    case "not_found":
    case "not_pending":
      return { route: "NOT_RUN", error: `approveDecision returned ${r.status}` };
    default:
      return assertNever(r);
  }
}
