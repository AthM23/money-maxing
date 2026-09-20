import { pathToFileURL } from "node:url";
import { ingest } from "../ingest/ingest.js";
import { runInvoiceVsCash } from "../drift/invoiceVsCash.js";
import { openWorldDb, type Db } from "../ledger/db.js";
import { ACCOUNTS } from "../contract/accounts.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { routeTier0 } from "../router/route.js";

/** A separate, synthetic Northwind scene; does not alter the original eleven-receipt world. */
export function seedRemittanceDemo(db: Db): void {
  db.exec(`INSERT INTO period (id, status) VALUES ('2026-07','open');
    INSERT INTO party (id, kind, name) VALUES ('meridian','customer','Meridian Data');
    INSERT INTO intent (id,function,question,owner,status,created_at) VALUES ('opening','ar','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id,intent_id,function,mode,kind,actor,autonomy_level,created_at) VALUES ('opening','opening','ar','live','no_action','seed','auto','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id,period,date,source_decision_id,memo,posted_at) VALUES ('opening','2026-07','2026-07-01','opening','Fourteen synthetic invoices','2026-07-01T00:00:00Z');
    INSERT INTO gl_line (entry_id,line_no,account,debit_cents,credit_cents) VALUES ('opening',1,'${ACCOUNTS.ar}',1400000,0),('opening',2,'${ACCOUNTS.deferred_revenue}',0,1400000);`);
  const lines: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const id = `INV-${3000 + i}`;
    db.prepare("INSERT INTO invoice (id,party_id,issue_date,due_date,total_cents,open_cents,status) VALUES (?,'meridian','2026-07-01','2026-07-31',100000,100000,'open')").run(id);
    lines.push(`${id},${i === 1 ? "505.00" : "1000.00"}`);
  }
  const body = ["Please apply Friday's ACH as follows. We dispute $495 on INV-3001; all other lines are paid in full.",
    "BEGIN REMITTANCE", "Reference: NW-ACH-0718-0001", "Date: 2026-07-18", "Amount: 13505.00", "invoice,amount", ...lines, "END REMITTANCE"].join("\n");
  ingest(db, [
    { source: "gmail", kind: "email", external_id: "meridian-remit-0716", event_time: "2026-07-16T09:00:00Z", recorded_time: "2026-07-16T09:00:00Z",
      party_hint: { party_id: "meridian" }, payload: { from: "ap@meridian.test", to: ["ar@northwind.test"], subject: "July remittance", body } },
    { source: "bank", kind: "bank_line", external_id: "BTX-REMIT", event_time: "2026-07-18T09:00:00Z", recorded_time: "2026-07-18T09:00:00Z",
      party_hint: { party_id: "meridian" }, payload: { descriptor: "ACH NW-ACH-0718-0001", amount_cents: 1350500 },
      bank_txn: { id: "BTX-REMIT", posted_date: "2026-07-18", amount_cents: 1350500, descriptor: "ACH NW-ACH-0718-0001", method: "ach" } },
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openWorldDb();
  try {
    seedRemittanceDemo(db);
    const finding = runInvoiceVsCash(db)[0]!;
    const result = routeTier0(db, finding.case_file, { mode: "live", autonomy_level: "earned" });
    const totals = readControlTotals(db);
    if (result.routes[0] !== "AUTO" || totals.ar_gl_cents !== 49500 || totals.ar_gl_cents !== totals.ar_subledger_cents) throw new Error("Remittance rehearsal failed");
    console.log(JSON.stringify({ synthetic: true, cash_applied_cents: 1350500, invoices: 14, remaining_invoice: "INV-3001",
      remaining_cents: 49500, model_calls: result.model_calls, next: result.status, control_totals: totals }, null, 2));
  } finally { db.close(); }
}
