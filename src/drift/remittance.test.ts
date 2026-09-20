import { describe, expect, it } from "vitest";
import { seedRemittanceDemo } from "../demo/remittance.js";
import { parseRemittance } from "../contract/remittance.js";
import { openWorldDb as openDb } from "../ledger/db.js";
import { routeTier0 } from "../router/route.js";
import { planTier0 } from "../router/tier0.js";
import { proposeEntry } from "../runtime/proposeEntry.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { runInvoiceVsCash } from "./invoiceVsCash.js";

describe("separate remittance and unambiguous cash matching", () => {
  it("applies fourteen explicit lines, leaves the FIRST invoice short and keeps the controls tied", () => {
    const db = openDb(); seedRemittanceDemo(db);
    const c = runInvoiceVsCash(db)[0]!.case_file;
    expect(c.remittance?.applications).toHaveLength(14);
    expect(c.doc_ids.at(-1)).toBe("INV-3001");
    const result = routeTier0(db, c, { mode: "live", autonomy_level: "earned" });
    expect(result).toMatchObject({ status: "needs_agent", routes: ["AUTO"], model_calls: 0, unexplained_cents: 49500 });
    expect(db.prepare("SELECT id,open_cents FROM invoice WHERE open_cents > 0").all()).toEqual([{ id: "INV-3001", open_cents: 49500 }]);
    expect(readControlTotals(db)).toMatchObject({ ar_gl_cents: 49500, ar_subledger_cents: 49500 });
    expect(runInvoiceVsCash(db)).toEqual([]);
    db.close();
  });

  it("the kernel refuses a correct total with the shortfall moved to another invoice", () => {
    const db = openDb(); seedRemittanceDemo(db);
    const c = runInvoiceVsCash(db)[0]!.case_file;
    const p = planTier0(db, c).proposals[0]!;
    for (const a of p.applications) {
      if (a.doc_id === "INV-3001") a.amount_cents = 100000;
      if (a.doc_id === "INV-3002") a.amount_cents = 50500;
    }
    const out = proposeEntry(db, p, { actor: "router:tier0", mode: "live", tier: 0, autonomy_level: "auto" });
    expect(out.status).toBe("rejected");
    if (out.status === "rejected") expect(out.failed.some(m => m.check === "E_REMIT")).toBe(true);
    db.close();
  });

  it("does not choose an arbitrary invoice when several match, or drop an unresolved reference", () => {
    for (const descriptor of ["ACH MERIDIAN", "ACH MERIDIAN INV-3001 INV-9999"]) {
      const db = openDb(); seedRemittanceDemo(db);
      db.prepare("UPDATE bank_txn SET amount_cents = 100000, descriptor = ?").run(descriptor);
      const c = runInvoiceVsCash(db)[0]!.case_file;
      expect(c.matching_issue).toBeTruthy();
      expect(routeTier0(db, c, { mode: "live", autonomy_level: "earned" })).toMatchObject({ status: "needs_agent", results: [] });
      db.close();
    }
  });

  it("refuses duplicate invoice rows, non-footing tables and impossible dates", () => {
    const body = "BEGIN REMITTANCE\nReference: ACH-1234\nDate: 2026-07-18\nAmount: 10.00\ninvoice,amount\nINV-1,10.00\nEND REMITTANCE";
    expect(parseRemittance(body)?.amount_cents).toBe(1000);
    expect(parseRemittance(body.replace("2026-07-18", "2026-02-31"))).toBeNull();
    expect(parseRemittance(body.replace("INV-1,10.00", "INV-1,5.00\nINV-1,5.00"))).toBeNull();
    expect(parseRemittance(body.replace("INV-1,10.00", "INV-1,9.00"))).toBeNull();
  });
});
