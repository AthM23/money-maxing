import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Investigator } from "../../agents/investigator.js";
import { seedDemoWorld } from "../../demo/seed.js";
import { approveDecision } from "../../runtime/approve.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { openDb, type Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { runOpenIntents } from "../runOpenIntents.js";

function world(): Db {
  const db = openDb();
  seedDemoWorld(db);
  return db;
}

function earn(db: Db, kind: string, level: "auto" | "review"): void {
  db.prepare("INSERT INTO autonomy (function, kind, agree, n, covered, level, updated_at) VALUES ('ar', ?, 6, 6, 1, ?, '2026-07-01T00:00:00Z')").run(kind, level);
}

const count = (db: Db, sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;
const intentStatus = (db: Db, id: string): string => (db.prepare("SELECT status FROM intent WHERE id = ?").get(id) as { status: string }).status;

describe("worker: open intents run at the autonomy each kind of entry has earned", () => {
  it("cold start: cash that matches posts from code on day one; everything that carries judgment parks for a person", async () => {
    const db = world();
    const report = await runOpenIntents(db, { investigators: [], clock: fixedClock });
    expect(report.worked.map((w) => w.intent_id)).toEqual(["int_initech", "int_umbrella", "int_wayne"]);
    // Umbrella: the wire is applied by code; the rule-driven write-off is a kind with no track record, so it parks.
    expect(report.worked.find((w) => w.intent_id === "int_umbrella")).toMatchObject({ routes: ["AUTO", "PROPOSE"], tier_used: 0, status: "waiting_on_human" });
    expect(count(db, "SELECT COUNT(*) AS n FROM gl_entry")).toBe(4);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision WHERE mode = 'live' AND posted_at IS NOT NULL AND kind != 'apply_payment' AND id != 'dec_open'")).toBe(0);
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("a cash application that touches anything but control accounts is judged like everything else", async () => {
    const db = world();
    // Umbrella overpays by $50: the excess would sit in customer credits, which is a judgment, so the entry parks.
    db.prepare("UPDATE bank_txn SET amount_cents = 2005000 WHERE id = 'BTX-2'").run();
    db.prepare("UPDATE intent SET case_json = ? WHERE id = 'int_umbrella'").run(JSON.stringify({
      intent_id: "int_umbrella", function: "ar", party_id: "umbrella", entry_date: "2026-07-15", bank_txn_id: "BTX-2", doc_ids: ["INV-1060"],
      expected_cents: 2000000, received_cents: 2005000, shortfall_cents: -5000, method: "wire", trace_ids: ["tr_bank_2"] }));
    const report = await runOpenIntents(db, { investigators: [], function: "ar", clock: fixedClock });
    const umbrella = report.worked.find((w) => w.intent_id === "int_umbrella")!;
    expect(umbrella.routes.includes("AUTO")).toBe(false);
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1060'").get()).toEqual({ open_cents: 2000000 });
  });

  it("a second pass finds nothing to do and records nothing twice", async () => {
    const db = world();
    await runOpenIntents(db, { investigators: [], clock: fixedClock });
    const decisions = count(db, "SELECT COUNT(*) AS n FROM decision");
    const again = await runOpenIntents(db, { investigators: [], clock: fixedClock });
    expect(again.worked).toEqual([]);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision")).toBe(decisions);
  });

  it("kinds that earned auto post from code with no model call, and the books still tie", async () => {
    const db = world();
    earn(db, "apply_payment", "auto");
    earn(db, "write_off", "auto");
    const report = await runOpenIntents(db, { investigators: [], function: "ar", clock: fixedClock });
    expect(report.worked.find((w) => w.intent_id === "int_umbrella")).toMatchObject({ routes: ["AUTO", "AUTO"], final_route: "AUTO", status: "resolved" });
    expect(db.prepare("SELECT closed_at FROM intent WHERE id = 'int_umbrella'").get()).toEqual({ closed_at: fixedClock.now() });
    expect(count(db, "SELECT COALESCE(SUM(model_calls), 0) AS n FROM decision")).toBe(0);
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("cash applied but the shortfall unexplained is not resolved: it stays open for a stronger pass, with the reasons on record", async () => {
    const db = world();
    earn(db, "apply_payment", "auto");
    const report = await runOpenIntents(db, { investigators: [], clock: fixedClock });
    expect(report.worked.find((w) => w.intent_id === "int_initech")).toMatchObject({ routes: ["AUTO"], final_route: null, status: "open" });
    const step = db.prepare("SELECT s.output_json FROM decision_step s JOIN decision d ON d.id = s.decision_id WHERE d.intent_id = 'int_initech' AND d.actor = 'router:unsettled'").get() as { output_json: string };
    expect(step.output_json).toContain("no tier reached a route");
  });

  it("a code-only pass does not retry what code already tried; a pass with a model tier does, and when every tier fails it is a person's", async () => {
    const db = world();
    earn(db, "apply_payment", "auto");
    await runOpenIntents(db, { investigators: [], clock: fixedClock });
    const decisions = count(db, "SELECT COUNT(*) AS n FROM decision");
    expect((await runOpenIntents(db, { investigators: [], clock: fixedClock })).worked).toEqual([]);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision")).toBe(decisions);

    // Memory changed: a rule that covers Initech's case was approved after code gave up, so code is worth another pass.
    const later = { now: () => "2026-07-15T09:00:00.000Z" };
    db.prepare("UPDATE policy SET approved_at = ? WHERE id = 'pol_wire_fee'").run(later.now());
    expect((await runOpenIntents(db, { investigators: [], function: "ar", limit: 1, clock: later })).worked.map((w) => w.intent_id)).toEqual(["int_initech"]);

    const shrugs: Investigator = { name: "scripted", investigate: () => Promise.resolve({ outcome: "budget_exhausted", summary: "ran out of turns", places_looked: ["mail"] }) };
    const again = await runOpenIntents(db, { investigators: [shrugs], clock: fixedClock });
    expect(again.worked.map((w) => [w.intent_id, w.tier_used, w.status])).toEqual([["int_initech", 1, "waiting_on_human"], ["int_wayne", 1, "waiting_on_human"]]);
  });

  it("an intent closes on its end condition in the ledger, not because an entry posted", async () => {
    const db = world();
    db.prepare("UPDATE policy SET status = 'retired' WHERE id = 'pol_wire_fee'").run();
    db.prepare("UPDATE intent SET end_condition_json = ? WHERE id = 'int_umbrella'").run(JSON.stringify({ bank_txn_applied: "BTX-2", docs_settled: ["INV-1060"] }));
    await runOpenIntents(db, { investigators: [], function: "ar", clock: fixedClock });
    // The wire is applied and posted, but $20 is still owed on the invoice.
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1060'").get()).toEqual({ open_cents: 2000 });
    expect(intentStatus(db, "int_umbrella")).toBe("open");
  });

  it("a credit for half the shortfall does not close the case, even with no end condition written: it is read off the case file", async () => {
    const db = world();
    db.prepare("UPDATE policy SET status = 'retired' WHERE id = 'pol_wire_fee'").run();
    const halfCredit: Investigator = {
      name: "scripted",
      async investigate(task, call) {
        call("propose_entry", {
          intent_id: task.case_file.intent_id, function: "ar", kind: "write_off", party_id: "umbrella", entry_date: "2026-07-15",
          applications: [{ doc_id: "INV-1060", amount_cents: 1000 }],
          entries: [
            { account: ACCOUNTS.bank_charges, debit_cents: 1000, credit_cents: 0, memo: "Half the fee" },
            { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1000, memo: "Half the fee" },
          ],
          evidence: [{ claim: "the wire arrived short", trace_id: "tr_bank_2", quote: "WIRE UMBRELLA CORP" }],
          policy_refs: [], fact_refs: [], judgment: [],
        });
        return { outcome: "proposed", summary: "half", places_looked: ["bank"] };
      },
    };
    const report = await runOpenIntents(db, { investigators: [halfCredit], intent_id: "int_umbrella", clock: fixedClock });
    const parked = report.worked[0]!.decision_id!;
    expect(approveDecision(db, parked, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1060'").get()).toEqual({ open_cents: 1000 });
    expect(intentStatus(db, "int_umbrella")).toBe("open");
  });

  it("keeps the document balances as they stood before anything posted", async () => {
    const db = world();
    earn(db, "apply_payment", "auto");
    await runOpenIntents(db, { investigators: [], clock: fixedClock });
    const row = db.prepare("SELECT case_json FROM intent WHERE id = 'int_initech'").get() as { case_json: string };
    expect(JSON.parse(row.case_json).docs_snapshot).toEqual([{ id: "INV-1042", kind: "invoice", party_id: "initech", total_cents: 1200000, open_cents: 1200000, date: "2026-07-01" }]);
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 120000 });
  });
});

describe("worker: the snapshot is of the case before anything posted, whoever ran it first", () => {
  it("adds back what an earlier pass already applied, so the entry can be re-performed later", async () => {
    const db = world();
    // Another runner (the walking skeleton) applies Initech's cash before the worker ever sees the case.
    const { runCase } = await import("../../agents/runCase.js");
    const initech = JSON.parse((db.prepare("SELECT case_json FROM intent WHERE id = 'int_initech'").get() as { case_json: string }).case_json) as unknown;
    await runCase(db, initech, { mode: "live", autonomy_level: "auto", investigators: [], clock: fixedClock });
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 120000 });
    await runOpenIntents(db, { investigators: [], function: "ar", retry: true, clock: fixedClock });
    const row = db.prepare("SELECT case_json FROM intent WHERE id = 'int_initech'").get() as { case_json: string };
    expect(JSON.parse(row.case_json).docs_snapshot[0]).toMatchObject({ id: "INV-1042", open_cents: 1200000 });
  });
});

describe("worker: who may approve what parked", () => {
  it("the controller agent cannot approve a kind still in shadow; a person can, and the intent then resolves", async () => {
    const db = world();
    await runOpenIntents(db, { investigators: [], function: "ar", limit: 3, clock: fixedClock });
    const parked = db.prepare("SELECT id, kind FROM decision WHERE intent_id = 'int_umbrella' AND route = 'PROPOSE' ORDER BY rowid").all() as { id: string; kind: string }[];
    expect(parked.map((p) => p.kind)).toEqual(["write_off"]);
    const byAgent = approveDecision(db, parked[0]!.id, { approver_id: "controller:claude", approver_kind: "controller_agent", outcome: "approved" }, { clock: fixedClock });
    expect(byAgent.status).toBe("rejected");
    expect(byAgent.status === "rejected" && byAgent.failed.map((m) => m.detail).join(" ")).toContain("still in shadow");
    for (const p of parked) {
      expect(approveDecision(db, p.id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    }
    expect(intentStatus(db, "int_umbrella")).toBe("resolved");
  });

  it("on a kind that earned auto, an entry reached by free inference is still held for review", async () => {
    const db = world();
    for (const kind of ["apply_payment", "credit_memo"]) earn(db, kind, "auto");
    const infers: Investigator = {
      name: "scripted",
      async investigate(task, call) {
        call("propose_entry", {
          intent_id: task.case_file.intent_id, function: "ar", kind: "credit_memo", party_id: "umbrella", entry_date: "2026-07-15",
          applications: [{ doc_id: "INV-1060", amount_cents: 2000 }],
          entries: [
            { account: ACCOUNTS.deferred_revenue, debit_cents: 2000, credit_cents: 0, memo: "Goodwill credit" },
            { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 2000, memo: "Goodwill credit" },
          ],
          evidence: [{ claim: "the wire arrived short", trace_id: "tr_bank_2", quote: "WIRE UMBRELLA CORP" }],
          policy_refs: [], fact_refs: [], judgment: [],
        });
        return { outcome: "proposed", summary: "guessed a goodwill credit", places_looked: ["bank"] };
      },
    };
    db.prepare("UPDATE policy SET status = 'retired' WHERE id = 'pol_wire_fee'").run();
    const report = await runOpenIntents(db, { investigators: [infers], function: "ar", limit: 3, clock: fixedClock });
    const umbrella = report.worked.find((w) => w.intent_id === "int_umbrella")!;
    expect(umbrella).toMatchObject({ final_route: "PROPOSE", tier_used: 1, status: "waiting_on_human" });
    expect(db.prepare("SELECT autonomy_level, posted_at FROM decision WHERE id = ?").get(umbrella.decision_id)).toEqual({ autonomy_level: "review", posted_at: null });
  });
});

describe("worker: bad input and failures are handed to a person, never guessed at", () => {
  it("a case file that does not parse, or names another intent, is skipped with the reason", async () => {
    const db = world();
    db.prepare("UPDATE intent SET case_json = ? WHERE id = 'int_wayne'").run(JSON.stringify({ intent_id: "int_wayne", function: "ar" }));
    db.prepare("UPDATE intent SET case_json = replace(case_json, 'int_initech', 'int_umbrella') WHERE id = 'int_initech'").run();
    const report = await runOpenIntents(db, { investigators: [], clock: fixedClock });
    expect(report.skipped.map((s) => s.intent_id)).toEqual(["int_initech", "int_wayne"]);
    expect(report.skipped[0]!.reason).toContain("names intent int_umbrella");
    expect(report.skipped[1]!.reason).toContain("does not parse");
    expect(intentStatus(db, "int_wayne")).toBe("waiting_on_human");
    expect(report.worked.map((w) => w.intent_id)).toEqual(["int_umbrella"]);
  });

  it("a run that throws leaves the case open for another pass, then gives it to a person", async () => {
    const db = world();
    earn(db, "apply_payment", "auto");
    const outage: Investigator = { name: "down", investigate: () => Promise.reject(new Error("model unavailable")) };
    for (const pass of [1, 2, 3]) {
      const report = await runOpenIntents(db, { investigators: [outage], function: "ar", clock: fixedClock });
      const initech = report.worked.find((w) => w.intent_id === "int_initech")!;
      expect(initech.error).toBe("model unavailable");
      expect(initech.status).toBe(pass < 3 ? "open" : "waiting_on_human");
    }
    expect(count(db, "SELECT COUNT(*) AS n FROM gl_entry WHERE source_decision_id IN (SELECT id FROM decision WHERE intent_id = 'int_initech')")).toBe(1);
  });
});
