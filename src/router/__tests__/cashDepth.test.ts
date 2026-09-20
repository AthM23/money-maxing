import { describe, expect, it } from "vitest";
import { seedDemoWorld } from "../../demo/seed.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { openDb, type Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { routeTier0 } from "../route.js";

function world(): Db {
  const db = openDb();
  seedDemoWorld(db);
  return db;
}

const earned = { mode: "live" as const, autonomy_level: "earned" as const };

describe("cash application, the hard 10%: what code settles and what it refuses to guess", () => {
  it("one payment for three invoices is applied to each, oldest first, and posts from code", () => {
    const db = world();
    db.exec(`INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES
      ('INV-2001','umbrella','2026-06-01','2026-06-30',500000,500000,'open'), ('INV-2002','umbrella','2026-06-15','2026-07-15',250000,250000,'open');
      UPDATE invoice SET open_cents = 0, status = 'paid' WHERE id = 'INV-1060';
      UPDATE gl_line SET debit_cents = debit_cents - 1250000 WHERE entry_id = 'je_open' AND line_no = 1;
      UPDATE gl_line SET credit_cents = credit_cents - 1250000 WHERE entry_id = 'je_open' AND line_no = 2;
      INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-2003','umbrella','2026-07-01','2026-07-31',125000,125000,'open');
      UPDATE gl_line SET debit_cents = debit_cents + 125000 WHERE entry_id = 'je_open' AND line_no = 1;
      UPDATE gl_line SET credit_cents = credit_cents + 125000 WHERE entry_id = 'je_open' AND line_no = 2;
      INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-3X','2026-07-18',875000,'ACH UMBRELLA CORP INV-2001 INV-2002 INV-2003','ach','umbrella');
      INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_3x','ar','Apply one payment to three invoices','ar','open','2026-07-18T09:00:00Z');`);
    const r = routeTier0(db, { intent_id: "int_3x", function: "ar", party_id: "umbrella", entry_date: "2026-07-18", bank_txn_id: "BTX-3X",
      doc_ids: ["INV-2001", "INV-2002", "INV-2003"], expected_cents: 875000, received_cents: 875000, shortfall_cents: 0, method: "ach", trace_ids: [] }, earned, { clock: fixedClock });
    expect(r).toMatchObject({ status: "done", routes: ["AUTO"], model_calls: 0 });
    expect(db.prepare("SELECT id, open_cents FROM invoice WHERE id LIKE 'INV-200%' ORDER BY id").all()).toEqual([
      { id: "INV-2001", open_cents: 0 }, { id: "INV-2002", open_cents: 0 }, { id: "INV-2003", open_cents: 0 }]);
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("a second payment for an invoice already paid is never applied on a guess: it is held as unapplied cash for a person", () => {
    const db = world();
    db.exec(`UPDATE invoice SET open_cents = 0, status = 'paid' WHERE id = 'INV-1060';
      UPDATE gl_line SET debit_cents = debit_cents - 2000000 WHERE entry_id = 'je_open' AND line_no = 1;
      UPDATE gl_line SET credit_cents = credit_cents - 2000000 WHERE entry_id = 'je_open' AND line_no = 2;`);
    const r = routeTier0(db, { intent_id: "int_umbrella", function: "ar", party_id: "umbrella", entry_date: "2026-07-15", bank_txn_id: "BTX-2",
      doc_ids: [], expected_cents: 0, received_cents: 1998000, shortfall_cents: -1998000, method: "wire", trace_ids: ["tr_bank_2"] }, earned, { clock: fixedClock });
    expect(r.routes).toEqual(["PROPOSE"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
    const parked = db.prepare("SELECT proposal_json FROM decision WHERE intent_id = 'int_umbrella' AND route = 'PROPOSE'").get() as { proposal_json: string };
    expect(JSON.parse(parked.proposal_json).entries.map((l: { account: string }) => l.account)).toEqual(["1000", "2100"]);
  });
});
