import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { approveFact, recordFactCandidate } from "../../memory/facts.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import { routeTier0 } from "../route.js";

const deps = { clock: fixedClock };
const live = { mode: "live" as const, autonomy_level: "auto" as const };
const initechCase = {
  intent_id: "int_1", function: "ar", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1",
  doc_ids: ["INV-1042"], expected_cents: 1200000, received_cents: 1080000, shortfall_cents: 120000, method: "ach", trace_ids: ["tr_email_1"],
};

function seedWireFee(db: ReturnType<typeof seedInitech>): void {
  db.exec(`
    INSERT INTO party (id, kind, name) VALUES ('umbrella','customer','Umbrella Corp');
    INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-1060','umbrella','2026-07-01','2026-07-31',2000000,2000000,'open');
    INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES ('BTX-2','2026-07-15',1998000,'WIRE UMBRELLA CORP','wire','umbrella','tr_bank_2');
    INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json)
      VALUES ('tr_bank_2','bank','bank_line','BTX-2','2026-07-15T10:00:00Z','2026-07-15T10:00:00Z','2026-09-19T20:00:00Z','umbrella','h2','{"descriptor":"WIRE UMBRELLA CORP","amount_cents":1998000}');
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_2','ar','Resolve the $20 shortfall on INV-1060','ar','open','2026-07-15T10:00:00Z');
    INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, max_amount_cents, status, approved_by, approved_at)
      VALUES ('pol_wire_fee','ar','Wire shortfall up to $50 goes to bank charges',
        '{"all":[{"field":"shortfall_cents","op":"<=","value":5000},{"field":"method","op":"==","value":"wire"}]}',
        '{"kind":"write_off","account":"${ACCOUNTS.bank_charges}"}','Do not chase customers for bank fees we cannot control','company',1000000,'approved','U_CTRL','2026-07-10T00:00:00Z');
    UPDATE gl_line SET debit_cents = debit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 1;
    UPDATE gl_line SET credit_cents = credit_cents + 2000000 WHERE entry_id = 'je_open' AND line_no = 2;
  `);
}
const wireCase = {
  intent_id: "int_2", function: "ar", party_id: "umbrella", entry_date: "2026-07-15", bank_txn_id: "BTX-2",
  doc_ids: ["INV-1060"], expected_cents: 2000000, received_cents: 1998000, shortfall_cents: 2000, method: "wire", trace_ids: ["tr_bank_2"],
};

describe("router tier 0: code decides, no model call", () => {
  it("clears a $20 wire shortfall on the compiled policy: two AUTO posts, zero model calls, books tied", () => {
    const db = seedInitech();
    seedWireFee(db);
    const out = routeTier0(db, wireCase, live, deps);
    expect(out).toMatchObject({ status: "done", routes: ["AUTO", "AUTO"], unexplained_cents: 0, model_calls: 0 });
    const fees = db.prepare("SELECT SUM(debit_cents) AS n FROM gl_line WHERE account = ?").get(ACCOUNTS.bank_charges);
    expect(fees).toEqual({ n: 2000 });
    expect(db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1060'").get()).toEqual({ open_cents: 0, status: "paid" });
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("does not stretch the policy: a $60 wire shortfall is applied, and the remainder goes up a tier", () => {
    const db = seedInitech();
    seedWireFee(db);
    db.prepare("UPDATE bank_txn SET amount_cents = 1994000 WHERE id = 'BTX-2'").run();
    const out = routeTier0(db, { ...wireCase, received_cents: 1994000, shortfall_cents: 6000 }, live, deps);
    expect(out.status).toBe("needs_agent");
    expect(out.routes).toEqual(["AUTO"]);
    expect(out.unexplained_cents).toBe(6000);
    expect(out.notes.join(" ")).toContain("pol_wire_fee");
  });

  it("with nothing on file, applies the cash and hands the $1,200 up with no guess", () => {
    const db = seedInitech();
    const out = routeTier0(db, initechCase, live, deps);
    expect(out).toMatchObject({ status: "needs_agent", routes: ["AUTO"], unexplained_cents: 120000 });
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 120000 });
  });

  it("with the concession fact active, proposes the credit memo in code and parks it for a person ($1,200 is material)", () => {
    const db = seedInitech();
    const rec = recordFactCandidate(db, fixedClock, {
      party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
      valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: ["tr_email_1"], stated_by: "ceo@northwind.test",
    });
    approveFact(db, fixedClock, rec.status === "candidate" ? rec.fact_id : "", "U_CTRL");
    const out = routeTier0(db, initechCase, live, deps);
    expect(out).toMatchObject({ status: "done", routes: ["AUTO", "PROPOSE"], unexplained_cents: 0, model_calls: 0 });
  });

  it("refuses to use the Initech fact for a different shortfall amount", () => {
    const db = seedInitech();
    const rec = recordFactCandidate(db, fixedClock, {
      party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
      valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: ["tr_email_1"], stated_by: "ceo@northwind.test",
    });
    approveFact(db, fixedClock, rec.status === "candidate" ? rec.fact_id : "", "U_CTRL");
    const out = routeTier0(db, { ...initechCase, received_cents: 1000000, shortfall_cents: 200000 }, live, deps);
    expect(out.status).toBe("needs_agent");
    expect(out.notes.join(" ")).toContain("explains 120000");
  });

  it("rejects a malformed case file without touching the ledger", () => {
    const db = seedInitech();
    expect(routeTier0(db, { ...initechCase, shortfall_cents: 1200.5 }, live, deps).status).toBe("invalid");
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision").get()).toEqual({ n: 1 });
  });
});
