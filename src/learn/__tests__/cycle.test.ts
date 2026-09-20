import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile } from "../../contract/types.js";
import type { Investigator } from "../../agents/investigator.js";
import { approveDecision } from "../../runtime/approve.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { cloneDb, openDb, type Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { autonomyFor, rebuildLadder } from "../autonomy.js";
import { carryMemory } from "../carry.js";
import { approvePolicy, compilePolicies } from "../compile.js";
import { harvestLiveOutcomes } from "../harvest.js";
import { compareRuns, scoreboard } from "../scoreboard.js";

const FEES = [1500, 2500, 3500, 2000, 4500, 1000];

/** A July with six customers who each paid by wire, short by a bank fee. Nothing on file explains any of them. */
function julyOfWireFees(): Db {
  const db = openDb();
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-07','open');
    INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES
      ('U_CTRL','Priya','controller','U_CTRL',10000000), ('controller:claude','Controller agent','controller_agent',NULL,49999);
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at)
      VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-07','2026-07-01','dec_open','July invoices','2026-07-01T00:00:00Z');
    INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES
      ('je_open',1,'${ACCOUNTS.ar}',${FEES.length * 2000000},0), ('je_open',2,'${ACCOUNTS.deferred_revenue}',0,${FEES.length * 2000000});
  `);
  FEES.forEach((fee, i) => seedCustomer(db, i + 1, fee));
  return db;
}

function seedCustomer(db: Db, n: number, fee: number): void {
  const [party, inv, btx, tr, day] = [`cust${n}`, `INV-${n}`, `BTX-${n}`, `tr_bank_${n}`, String(10 + n)];
  const payload = JSON.stringify({ descriptor: `WIRE CUSTOMER ${n}`, amount_cents: 2000000 - fee });
  db.prepare("INSERT INTO party (id, kind, name, owner_user) VALUES (?, 'customer', ?, 'U_DANA')").run(party, `Customer ${n}`);
  db.prepare("INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, ?, '2026-07-01', '2026-07-31', 2000000, 2000000, 'open')").run(inv, party);
  db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES (?, ?, ?, ?, 'wire', ?, ?)")
    .run(btx, `2026-07-${day}`, 2000000 - fee, `WIRE CUSTOMER ${n}`, party, tr);
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, 'bank', 'bank_line', ?, ?, ?, ?, ?, ?, ?)")
    .run(tr, tr, `2026-07-${day}T10:00:00Z`, `2026-07-${day}T10:00:00Z`, "2026-09-19T20:00:00Z", party, createHash("sha256").update(payload).digest("hex"), payload);
  const c: CaseFile = { intent_id: `int_${n}`, function: "ar", party_id: party, entry_date: `2026-07-${day}`, bank_txn_id: btx, doc_ids: [inv],
    expected_cents: 2000000, received_cents: 2000000 - fee, shortfall_cents: fee, method: "wire", trace_ids: [tr] };
  db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?)")
    .run(c.intent_id, `Resolve the ${fee} cent shortfall for ${party}`, JSON.stringify(c), `2026-07-${day}T09:00:00Z`);
}

/** Stands in for the model tier: it reads the bank line and writes the shortfall off as a bank fee, citing the line. */
const writesOffTheFee: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const c = task.case_file;
    const n = c.party_id.replace("cust", "");
    call("propose_entry", {
      intent_id: c.intent_id, function: "ar", kind: "write_off", party_id: c.party_id, entry_date: c.entry_date,
      applications: [{ doc_id: c.doc_ids[0], amount_cents: c.shortfall_cents }],
      entries: [
        { account: ACCOUNTS.bank_charges, debit_cents: c.shortfall_cents, credit_cents: 0, memo: "Wire fee deducted by the sending bank" },
        { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo: "Wire fee deducted by the sending bank" },
      ],
      evidence: [{ claim: "paid by wire, short by a bank fee", trace_id: c.trace_ids[0], quote: `WIRE CUSTOMER ${n}` }],
      policy_refs: [], fact_refs: [], judgment: [],
    });
    return { outcome: "proposed", summary: "wire fee", places_looked: ["bank"], model_calls: 4, cost_micros: 20000 };
  },
};

/** The controller of the company clicks approve on everything parked, oldest first. */
function personApprovesAll(db: Db): number {
  const parked = db.prepare("SELECT id FROM decision WHERE mode = 'live' AND route = 'PROPOSE' AND posted_at IS NULL ORDER BY rowid").all() as { id: string }[];
  for (const p of parked) {
    const r = approveDecision(db, p.id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock });
    if (r.status !== "posted") throw new Error(`approval of ${p.id} did not post: ${JSON.stringify(r)}`);
  }
  return parked.length;
}

describe("improves: what a person approves beyond the rule becomes the rule's next version", () => {
  it("v1 is learned from the month, a bigger fee is approved by a person, v2 widens to it and retires v1", async () => {
    const db = julyOfWireFees();
    await runOpenIntents(db, { investigators: [writesOffTheFee], clock: fixedClock });
    personApprovesAll(db);
    harvestLiveOutcomes(db);
    const [v1] = compilePolicies(db, fixedClock, "ar");
    expect(v1!.name).toBe("SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150");
    approvePolicy(db, fixedClock, v1!.policy_id!, "U_CTRL");
    // Compiling again with nothing new drafts nothing new.
    expect(compilePolicies(db, fixedClock, "ar")).toMatchObject([{ policy_id: v1!.policy_id, unchanged: true }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM policy").get()).toEqual({ n: 1 });

    // A seventh customer's wire arrives $60 short: above the rule's ceiling, so it takes a model and a person again.
    seedCustomer(db, 7, 6000);
    db.exec("UPDATE gl_line SET debit_cents = debit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 1; UPDATE gl_line SET credit_cents = credit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 2;");
    const seventh = await runOpenIntents(db, { investigators: [writesOffTheFee], clock: fixedClock });
    expect(seventh.worked).toMatchObject([{ intent_id: "int_7", tier_used: 1, final_route: "PROPOSE" }]);
    personApprovesAll(db);
    harvestLiveOutcomes(db);

    const [v2] = compilePolicies(db, fixedClock, "ar");
    expect(v2).toMatchObject({ name: "SHORT-PAY-01 v2 · wire short ≤ $60.00 → write_off to 6150", supersedes: v1!.policy_id, backtest: { n: 7, agree: 7, regressions: [] } });
    // Until a person approves v2, v1 is still the rule.
    expect(db.prepare("SELECT status FROM policy WHERE id = ?").get(v1!.policy_id)).toEqual({ status: "approved" });
    approvePolicy(db, fixedClock, v2!.policy_id!, "U_CTRL");
    expect(db.prepare("SELECT code, version, status FROM policy ORDER BY version").all()).toEqual([
      { code: "SHORT-PAY-01", version: 1, status: "retired" }, { code: "SHORT-PAY-01", version: 2, status: "approved" }]);

    // An unseen customer does not inherit the learned policy, even under the new ceiling.
    seedCustomer(db, 8, 5500);
    db.exec("UPDATE gl_line SET debit_cents = debit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 1; UPDATE gl_line SET credit_cents = credit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 2;");
    const eighth = await runOpenIntents(db, { investigators: [writesOffTheFee], clock: fixedClock });
    expect(eighth.worked).toMatchObject([{ intent_id: "int_8", tier_used: 1, final_route: "PROPOSE" }]);
    const cited = db.prepare("SELECT json_extract(proposal_json, '$.policy_refs[0]') AS ref FROM decision WHERE intent_id = 'int_8' AND kind = 'write_off'").get() as { ref: string | null };
    expect(cited.ref).toBeNull();
  });
});

describe("the same month twice: run cold, learn from what people approved, run again with only memory changed", () => {
  it("run 1 needs a model and a person for every shortfall; run 2 needs no model at all", async () => {
    const run1 = julyOfWireFees();
    const cold = cloneDb(run1);

    await runOpenIntents(run1, { investigators: [writesOffTheFee], clock: fixedClock });
    // The cash is applied by code from the first day: there is no judgment in it. Every shortfall takes a model and a person.
    expect(scoreboard(run1)).toMatchObject({ intents: 6, resolved: 0, waiting_on_human: 6, auto_posted: 6, decided_by_model: 6, model_calls: 24 });
    expect(personApprovesAll(run1)).toBe(6);
    expect(scoreboard(run1)).toMatchObject({ resolved: 6, human_approvals: 6 });

    expect(harvestLiveOutcomes(run1)).toHaveLength(6);
    expect(harvestLiveOutcomes(run1)).toHaveLength(0);
    const drafts = compilePolicies(run1, fixedClock, "ar");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ action: { kind: "write_off", account: ACCOUNTS.bank_charges }, backtest: { n: 6, agree: 6, regressions: [] } });
    expect(approvePolicy(run1, fixedClock, drafts[0]!.policy_id!, "U_CTRL").status).toBe("approved");
    rebuildLadder(run1, fixedClock);
    // Six approvals, but every one of them was free inference by a model: good enough for review, never for auto.
    expect(autonomyFor(run1, "ar", "write_off")).toBe("review");

    const run2 = cold;
    expect(carryMemory(run1, run2)).toEqual({ traces: 0, facts: 0, policies: 1, autonomy_rows: 1 });
    await runOpenIntents(run2, { investigators: [writesOffTheFee], clock: fixedClock });
    // Twelve decisions reached by code; six of them (the cash) post with no person, six (the rule's write-offs) park for review.
    expect(scoreboard(run2)).toMatchObject({ decided_by_model: 0, model_calls: 0, cost_micros: 0, decided_by_code: 12, auto_posted: 6, parked: 6, questions: 0 });
    const delta = Object.fromEntries(compareRuns(scoreboard(run1), scoreboard(run2)).map((d) => [d.metric, [d.run1, d.run2]]));
    expect(delta.model_calls).toEqual([24, 0]);
    expect(delta.cost_micros).toEqual([120000, 0]);
  });

  it("the write-off climbs to auto only after people have approved the compiled rule's own entries", async () => {
    const run1 = julyOfWireFees();
    const run2 = cloneDb(run1);
    const run3 = cloneDb(run1);
    await runOpenIntents(run1, { investigators: [writesOffTheFee], clock: fixedClock });
    personApprovesAll(run1);
    harvestLiveOutcomes(run1);
    const [draft] = compilePolicies(run1, fixedClock, "ar");
    approvePolicy(run1, fixedClock, draft!.policy_id!, "U_CTRL");
    rebuildLadder(run1, fixedClock);

    carryMemory(run1, run2);
    await runOpenIntents(run2, { investigators: [], clock: fixedClock });
    expect(personApprovesAll(run2)).toBe(6);
    rebuildLadder(run2, fixedClock);
    expect(autonomyFor(run2, "ar", "write_off")).toBe("auto");

    carryMemory(run2, run3);
    await runOpenIntents(run3, { investigators: [], clock: fixedClock });
    expect(scoreboard(run3)).toMatchObject({ resolved: 6, waiting_on_human: 0, auto_posted: 12, human_approvals: 0, model_calls: 0 });
    const t = readControlTotals(run3);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
    expect(t.ar_subledger_cents).toBe(0);
  });
});
