import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile } from "../../contract/types.js";
import { scoreboard } from "../../learn/scoreboard.js";
import type { DocumentReader } from "../../reader/types.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { openDb, type Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { runOpenIntents } from "../runOpenIntents.js";

const REMITTANCE = "2026-07-18 ACH RMT76314 CASTELLAN BIOTECH USD 8,511.30 INV-2002:3,016.32 INV-2004:5,494.98";

/** Castellan has four open invoices. One ACH with no invoice numbers pays the second and the fourth. */
function world(): Db {
  const db = openDb();
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-07','open');
    INSERT INTO party (id, kind, name, owner_user) VALUES ('castellan','customer','Castellan Biotech','U_DANA'), ('other','customer','Other Co','U_DANA');
    INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES
      ('INV-2001','castellan','2026-06-01','2026-06-30',700000,700000,'open'), ('INV-2002','castellan','2026-06-10','2026-07-10',301632,301632,'open'),
      ('INV-2003','castellan','2026-06-20','2026-07-20',250000,250000,'open'), ('INV-2004','castellan','2026-07-01','2026-07-31',549498,549498,'open'),
      ('INV-9001','other','2026-07-01','2026-07-31',549498,549498,'open');
    INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-C','2026-07-18',851130,'ORIG CO NAME:CASTELLAN BIOTECH CO ENTRY DESCR:AP BATCH SEC:CCD','ach','castellan');
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at) VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-07','2026-07-01','dec_open','Open invoices','2026-07-01T00:00:00Z');
    INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES ('je_open',1,'${ACCOUNTS.ar}',2350628,0), ('je_open',2,'${ACCOUNTS.deferred_revenue}',0,2350628);
  `);
  const payload = JSON.stringify({ from: "ap@castellanbiotech.test", to: "ar@northwind.test", subject: "payment sent", body: REMITTANCE });
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES ('tr_remit','gmail','email','m-castellan-1',?,?,?,'castellan',?,?)")
    .run("2026-07-17T15:00:00Z", "2026-07-17T15:00:00Z", "2026-09-19T20:00:00Z", createHash("sha256").update(payload).digest("hex"), payload);
  const c: CaseFile = { intent_id: "int_c", function: "ar", party_id: "castellan", entry_date: "2026-07-18", bank_txn_id: "BTX-C", doc_ids: [],
    expected_cents: 0, received_cents: 851130, shortfall_cents: -851130, method: "ach", trace_ids: [],
    matching_issue: "No unique invoice allocation; obtain the customer's remittance." };
  db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES ('int_c','ar','Identify the $8,511.30 deposit','ar','open',?, '2026-07-18T09:00:00Z')").run(JSON.stringify(c));
  return db;
}

const reads = (doc: unknown): DocumentReader => ({ name: "scripted", read: () => Promise.resolve({ ok: true, doc, latency_ms: 5, tokens_in: 120, tokens_out: 60 }) });
const correct = { doc_kind: "remittance", amount_cents: 851130, applications: [{ invoice: "INV-2002", amount_cents: 301632 }, { invoice: "INV-2004", amount_cents: 549498 }],
  discount_cents: 0, discount_pct: 0, date: "2026-07-18", method: "ACH", payer: "Castellan Biotech", ref: "RMT76314" };
const open = (db: Db): Record<string, number> => Object.fromEntries((db.prepare("SELECT id, open_cents FROM invoice WHERE party_id = 'castellan' ORDER BY id").all() as { id: string; open_cents: number }[]).map((r) => [r.id, r.open_cents]));

describe("a small model reads the customer's remittance; code decides whether to believe it", () => {
  it("without a reader the payment is not guessed at: nothing posts, the case stays open", async () => {
    const db = world();
    const report = await runOpenIntents(db, { investigators: [], clock: fixedClock });
    expect(report.worked[0]).toMatchObject({ routes: [], status: "open" });
    expect(open(db)).toEqual({ "INV-2001": 700000, "INV-2002": 301632, "INV-2003": 250000, "INV-2004": 549498 });
  });

  it("a correct reading settles the second and fourth invoices from code, not the oldest, and the kernel agrees it to the customer's words", async () => {
    const db = world();
    const report = await runOpenIntents(db, { investigators: [], reader: reads(correct), clock: fixedClock });
    expect(report.readings).toMatchObject([{ outcome: "applied", reader: "scripted", trace_id: "tr_remit" }]);
    expect(report.worked[0]).toMatchObject({ routes: ["AUTO"], tier_used: 0, status: "resolved" });
    expect(open(db)).toEqual({ "INV-2001": 700000, "INV-2002": 0, "INV-2003": 250000, "INV-2004": 0 });
    const marks = db.prepare("SELECT w.marks_json FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = 'int_c' AND d.kind = 'apply_payment' ORDER BY w.rowid LIMIT 1").get() as { marks_json: string };
    expect(marks.marks_json).toContain("free-form remittance: every invoice and amount agrees");
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
    expect(scoreboard(db)).toMatchObject({ documents_read: 1, readings_used: 1, model_calls: 0, auto_posted: 1 });
  });

  it("refuses a reading with the amounts swapped, an invoice of another customer, a total off the bank line, or a reply that is not a remittance", async () => {
    const bad: Array<[unknown, string]> = [
      [{ ...correct, applications: [{ invoice: "INV-2002", amount_cents: 549498 }, { invoice: "INV-2004", amount_cents: 301632 }] }, "has 301632 open"],
      [{ ...correct, applications: [{ invoice: "INV-2002", amount_cents: 301632 }, { invoice: "INV-9001", amount_cents: 549498 }] }, "not an invoice of this customer"],
      [{ ...correct, amount_cents: 851100 }, "the bank line is 851130"],
      [{ vendor: "Castellan", total: "8511.30" }, "not a remittance"],
    ];
    for (const [doc, why] of bad) {
      const db = world();
      const report = await runOpenIntents(db, { investigators: [], reader: reads(doc), clock: fixedClock });
      expect(report.readings[0]).toMatchObject({ outcome: "rejected" });
      expect(report.readings[0]!.reason).toContain(why);
      expect(report.worked[0]).toMatchObject({ routes: [], status: "open" });
      expect(open(db)["INV-2002"]).toBe(301632);
      expect(scoreboard(db)).toMatchObject({ documents_read: 1, readings_used: 0, auto_posted: 0 });
    }
  });

  it("a reader that is down or talks nonsense costs nothing but the attempt", async () => {
    const db = world();
    const down: DocumentReader = { name: "down", read: () => Promise.resolve({ ok: false, reason: "reader unreachable: ECONNREFUSED", latency_ms: 3 }) };
    const report = await runOpenIntents(db, { investigators: [], reader: down, clock: fixedClock });
    expect(report.readings).toMatchObject([{ outcome: "rejected", reason: "reader unreachable: ECONNREFUSED" }]);
    expect(report.worked[0]).toMatchObject({ status: "open" });
  });

  it("a remittance from another month cannot direct this receipt, whoever proposes it: the kernel checks the dates itself", () => {
    const db = world();
    const payload = JSON.stringify({ from: "ap@castellanbiotech.test", to: "ar@northwind.test", subject: "payment sent", body: REMITTANCE });
    db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES ('tr_old','gmail','email','m-castellan-0',?,?,?,'castellan',?,?)")
      .run("2026-05-20T15:00:00Z", "2026-05-20T15:00:00Z", "2026-09-19T20:00:00Z", createHash("sha256").update(payload).digest("hex"), payload);
    const entry = (traceId: string) => ({ intent_id: "int_c", function: "ar" as const, kind: "apply_payment" as const, party_id: "castellan", entry_date: "2026-07-18", bank_txn_id: "BTX-C",
      remittance_trace_id: traceId, applications: [{ doc_id: "INV-2002", amount_cents: 301632 }, { doc_id: "INV-2004", amount_cents: 549498 }],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 851130, credit_cents: 0, memo: "cash" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 851130, memo: "cash" }],
      evidence: [{ claim: "the customer's remittance", trace_id: traceId }], policy_refs: [], fact_refs: [], judgment: [] });
    const meta = { actor: "agent:ar:haiku", mode: "live" as const, autonomy_level: "auto" as const, tier: 1 };
    const stale = proposeEntry(db, entry("tr_old"), meta, { clock: fixedClock });
    expect(stale.status === "rejected" ? stale.failed.map((m) => `${m.check}: ${m.detail}`).join(" ") : stale.status).toContain("too far apart to be the same payment");
    expect(proposeEntry(db, entry("tr_remit"), meta, { clock: fixedClock }).status).toBe("posted");
  });
});
