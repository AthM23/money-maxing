import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { out, runCli, warn } from "../../cli/flags.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import { SEED_ACCOUNTS } from "../../ledger/accounts.js";
import { openDb, type Db } from "../../runtime/db.js";

/**
 * The payables side the global July never had: two vendors that bill every month, three months of bills booked and
 * paid, and no bill yet for July. It is what gives the close something to accrue. It is added on top of a month that
 * is already seeded, touches no customer, no receipt and no case, and keeps payables tied (every bill here is paid).
 *
 *   Castlegate Property Trust   office lease, USD 14,000.00 a month, the same every month: code can estimate July.
 *   Harborline Cloud            hosting by usage: 18,210.40, 18,954.75, 19,377.10. It moves, so nobody averages it;
 *                               their July usage statement states 21,480.00, and that is for an agent to find.
 */
const INGESTED = "2026-09-19T20:00:00Z";

interface Vendor { id: string; name: string; account: string; from: string; bills: { no: string; period: string; label: string; cents: number; billed: string; paid: string }[] }

const usd = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const VENDORS: Vendor[] = [
  { id: "castlegate", name: "Castlegate Property Trust", account: SEED_ACCOUNTS.office, from: "billing@castlegate-property.test", bills: [
    { no: "CPT-2604", period: "2026-04", label: "April 2026", cents: 1_400_000, billed: "2026-04-28", paid: "2026-05-13" },
    { no: "CPT-2605", period: "2026-05", label: "May 2026", cents: 1_400_000, billed: "2026-05-28", paid: "2026-06-12" },
    { no: "CPT-2606", period: "2026-06", label: "June 2026", cents: 1_400_000, billed: "2026-06-26", paid: "2026-07-13" },
  ] },
  { id: "harborline", name: "Harborline Cloud", account: SEED_ACCOUNTS.hosting, from: "invoices@harborline-cloud.test", bills: [
    { no: "HLC-118204", period: "2026-04", label: "April 2026", cents: 1_821_040, billed: "2026-04-30", paid: "2026-05-15" },
    { no: "HLC-121877", period: "2026-05", label: "May 2026", cents: 1_895_475, billed: "2026-05-29", paid: "2026-06-15" },
    { no: "HLC-125391", period: "2026-06", label: "June 2026", cents: 1_937_710, billed: "2026-06-30", paid: "2026-07-15" },
  ] },
];

const LEASE = "Lease NW-CPT-2024 between Castlegate Property Trust and Northwind Systems, Inc. Premises: Suite 400, 210 Harbor Street.\n\n## Rent\nMonthly rent: USD 14,000.00, fixed for the term, invoiced on or about the 28th of each month for that month and payable within 15 days.\n\n## Term\n1 January 2024 to 31 December 2027.";
const JULY_USAGE = "Harborline Cloud usage statement\nAccount: NW-PROD\nUsage period: 1 July to 31 July 2026\nEstimated charges for the period: USD 21,480.00\nCompute and storage were higher than June: reprocessing after the 17/18 June incident ran into the first week of July.\nYour invoice will be issued on 6 August 2026. This statement is not an invoice.";
const CPT_DELAY = "Dear Northwind accounts payable,\n\nWe are moving to a new billing system this month, so the July rent invoice for Suite 400 will reach you in the first week of August instead of on the 28th. The rent is unchanged under the lease.\n\nCastlegate Property Trust, tenant billing";

export function seedPayablesSide(db: Db): { status: "seeded" | "already_there"; vendors: number; bills: number } {
  if (db.prepare("SELECT 1 FROM party WHERE id = ?").get(VENDORS[0]!.id)) return { status: "already_there", vendors: 0, bills: 0 };
  db.transaction(() => {
    db.exec(`INSERT INTO intent (id, function, question, owner, status, created_at, closed_at) VALUES ('int_payables_seed','ap','Payables history before July','seed','resolved','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');
             INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at) VALUES ('dec_payables_seed','int_payables_seed','ap','live','no_action','seed','auto','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');`);
    for (const v of VENDORS) {
      db.prepare("INSERT INTO party (id, kind, name, owner_user) VALUES (?, 'vendor', ?, NULL)").run(v.id, v.name);
      for (const b of v.bills) seedBill(db, v, b);
    }
    trace(db, "tr_contract_NW-CPT-2024", "contract", "contract", "2024-01-01T00:00:00Z", "castlegate", { title: "Lease NW-CPT-2024", text: LEASE });
    trace(db, "tr_gmail_cpt_july_delay", "gmail", "email", "2026-07-24T09:12:00Z", "castlegate", { from: VENDORS[0]!.from, to: "ap@northwind.test", subject: "July rent invoice will be late", body: CPT_DELAY });
    trace(db, "tr_gmail_hlc_july_usage", "gmail", "email", "2026-07-31T18:00:00Z", "harborline", { from: "usage@harborline-cloud.test", to: "ap@northwind.test", subject: "Your July usage statement", body: JULY_USAGE });
  })();
  return { status: "seeded", vendors: VENDORS.length, bills: VENDORS.reduce((n, v) => n + v.bills.length, 0) };
}

function seedBill(db: Db, v: Vendor, b: Vendor["bills"][number]): void {
  const traceId = `tr_gmail_bill_${b.no}`;
  const body = `Invoice ${b.no}\n${v.name}\nService period: ${b.label}\nAmount due: USD ${usd(b.cents)}\nPayable within 15 days of the invoice date.`;
  trace(db, traceId, "gmail", "email", `${b.billed}T08:30:00Z`, v.id, { from: v.from, to: "ap@northwind.test", subject: `Invoice ${b.no} for ${b.label}`, body });
  db.prepare("INSERT INTO bill (id, party_id, po_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status, trace_id) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, 'paid', ?)")
    .run(`BILL-${b.no}`, v.id, b.no, b.billed, b.paid, b.period, b.cents, traceId);
  // Booked in the month it is for, paid when it fell due: payables nets to nothing, so the control account stays tied.
  entry(db, `je_bill_${b.no}`, b.period, b.billed, `${v.name} ${b.no}: ${b.label}`, v.id, [[v.account, b.cents, 0], [ACCOUNTS.ap, 0, b.cents]]);
  entry(db, `je_pay_${b.no}`, b.paid.slice(0, 7), b.paid, `Paid ${v.name} ${b.no}`, v.id, [[ACCOUNTS.ap, b.cents, 0], [ACCOUNTS.cash, 0, b.cents]]);
}

function entry(db: Db, id: string, period: string, date: string, memo: string, partyId: string, lines: [string, number, number][]): void {
  db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES (?, ?, ?, 'dec_payables_seed', ?, ?)").run(id, period, date, memo, `${date}T12:00:00Z`);
  lines.forEach(([account, debit, credit], i) => db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents, party_id) VALUES (?, ?, ?, ?, ?, ?)").run(id, i + 1, account, debit, credit, partyId));
}

function trace(db: Db, id: string, source: string, kind: string, at: string, partyId: string, payload: Record<string, string>): void {
  const json = JSON.stringify(payload);
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, source, kind, id, at, at, INGESTED, partyId, createHash("sha256").update(json).digest("hex"), json);
}

/** pnpm demo:payables <db>: add the payables side to a month that is already seeded. Books nothing for July. */
function main(argv: string[] = process.argv.slice(2)): number {
  const dbPath = argv[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : "usage: pnpm demo:payables <db>");
    return 1;
  }
  const r = seedPayablesSide(openDb(dbPath));
  out(r.status === "seeded" ? `payables side added to ${dbPath}: ${r.vendors} vendors, ${r.bills} bills booked and paid, no bill for July` : `${dbPath} already has the payables side`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(main);
