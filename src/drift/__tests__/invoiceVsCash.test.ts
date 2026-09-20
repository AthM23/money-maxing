import { describe, expect, it } from "vitest";
import { seedRemittanceDemo } from "../../demo/remittance.js";
import { openWorldDb as openDb, type Db } from "../../ledger/db.js";
import { runInvoiceVsCash } from "../invoiceVsCash.js";

const brief = (db: Db, intentId: string): { doc_ids: string[]; expected_cents: number; received_cents: number; shortfall_cents: number } =>
  JSON.parse((db.prepare("SELECT case_json FROM intent WHERE id = ?").get(intentId) as { case_json: string }).case_json);
const updates = (db: Db): Record<string, unknown>[] =>
  (db.prepare("SELECT payload_json FROM event WHERE topic = 'drift.updated' ORDER BY id").all() as { payload_json: string }[])
    .map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);

describe("a bank line restated after its case opened", () => {
  it("rewrites the stored brief from the ledger and says what changed", () => {
    const db = openDb();
    seedRemittanceDemo(db);
    const opened = runInvoiceVsCash(db)[0]!;
    expect(opened).toMatchObject({ opened: true, kind: "short_pay" });
    expect(opened.case_file).toMatchObject({ expected_cents: 1400000, received_cents: 1350500, shortfall_cents: 49500 });
    expect(opened.case_file.doc_ids).toHaveLength(14);

    // The bank corrects the deposit down by $200. The remittance no longer covers what arrived, so this is not a
    // $495 shortfall on fourteen invoices any more — and that is what the brief handed to an agent has to say.
    db.prepare("UPDATE bank_txn SET amount_cents = amount_cents - 20000").run();
    const again = runInvoiceVsCash(db)[0]!;

    expect(again.intent_id).toBe(opened.intent_id); // still one intent for one difference
    expect(again).toMatchObject({ opened: false, restated: true, kind: "no_open_document" });
    expect(again.case_file).toMatchObject({ received_cents: 1330500, doc_ids: [], expected_cents: 0 });
    expect(again.case_file.matching_issue).toBeTruthy();
    expect(brief(db, opened.intent_id)).toMatchObject({ received_cents: 1330500, doc_ids: [] });
    expect(db.prepare("SELECT delta_cents FROM drift_case").get()).toEqual({ delta_cents: -1330500 });
    expect(db.prepare("SELECT end_condition_json AS e FROM intent WHERE id = ?").get(opened.intent_id))
      .toEqual({ e: JSON.stringify({ bank_txn_applied: opened.case_file.bank_txn_id, docs_settled: [] }) });
    expect(updates(db)).toHaveLength(1);
    expect(updates(db)[0]).toMatchObject({
      bank_txn_id: opened.case_file.bank_txn_id,
      was: { expected_cents: 1400000, received_cents: 1350500, shortfall_cents: 49500 },
      now: { expected_cents: 0, received_cents: 1330500, shortfall_cents: -1330500 },
      decisions_on_superseded_case: [],
    });
    db.close();
  });

  it("follows a document that moved, and says nothing at all when nothing moved", () => {
    const db = openDb();
    seedRemittanceDemo(db);
    const opened = runInvoiceVsCash(db)[0]!;

    // Same ledger, same brief: a re-run is silent, as it always was.
    const quiet = runInvoiceVsCash(db)[0]!;
    expect(quiet.opened).toBe(false);
    expect(quiet.restated).toBeUndefined();
    expect(updates(db)).toEqual([]);

    // A credit note lands against the short-paid invoice: the money did not move, what is owed did.
    db.prepare("UPDATE invoice SET open_cents = open_cents - 20000 WHERE id = 'INV-3001'").run();
    const again = runInvoiceVsCash(db)[0]!;
    expect(again.restated).toBe(true);
    expect(again.case_file).toMatchObject({ expected_cents: 1380000, received_cents: 1350500, shortfall_cents: 29500 });
    expect(brief(db, opened.intent_id).shortfall_cents).toBe(29500);
    db.close();
  });

  it("names a decision that was taken on the amount that no longer stands", () => {
    const db = openDb();
    seedRemittanceDemo(db);
    const opened = runInvoiceVsCash(db)[0]!;
    db.prepare(
      `INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at)
       VALUES ('dec-restated-1', ?, 'ar', 'live', 'cash_application', 'router:tier0', 'auto', '2026-07-20T00:00:00Z')`,
    ).run(opened.intent_id);
    db.prepare("UPDATE bank_txn SET amount_cents = amount_cents - 20000").run();
    runInvoiceVsCash(db);

    expect(updates(db)[0]).toMatchObject({ decisions_on_superseded_case: ["dec-restated-1"] });
    const { question } = db.prepare("SELECT question FROM intent WHERE id = ?").get(opened.intent_id) as { question: string };
    expect(question).toContain("restated after this was worked");
    expect(question).toContain("one decision was taken on the old amount");
    db.close();
  });
});
