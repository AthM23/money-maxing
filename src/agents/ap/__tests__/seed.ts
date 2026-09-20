import { createHash } from "node:crypto";
import { ACCOUNTS } from "../../../contract/accounts.js";
import type { CaseFile } from "../../../contract/types.js";
import type { Clock } from "../../../runtime/config.js";
import { openDb, type Db } from "../../../runtime/db.js";

/** A tiny July on the payables side: one vendor, one purchase order, one delivery, one bill. */
export const apClock: Clock = { now: () => "2026-07-20T12:00:00.000Z" };

export const VENDOR = "acme";
export const OTHER_VENDOR = "globex";
export const PO_ID = "PO-1";
export const BILL_ID = "BILL-1";
export const INTENT_ID = "int_ap_1";
export const INVOICE_NO = "ACME-1001";
export const SERVICE_PERIOD = "2026-07";
/** 10 widgets at 40.00. Under materiality on purpose, so a clean match posts instead of parking. */
export const DEFAULT_PO_LINES = JSON.stringify([{ sku: "WIDGET", qty: 10, unit_cents: 4000 }]);

export interface SeedApOptions {
  /** Raw override, so a test can seed lines_json that does not parse. */
  po_lines_json?: string;
  /** One goods receipt per entry. An empty array means the goods never arrived. */
  receipt_qtys?: number[];
  bill_total_cents?: number;
  bill_po_id?: string | null;
  po_party_id?: string;
}

export function seedAp(opts: SeedApOptions = {}): Db {
  const db = openDb();
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-06','locked'), ('2026-07','open');
    INSERT INTO party (id, kind, name, owner_user) VALUES ('${VENDOR}','vendor','Acme Supply','U_BUYER'), ('${OTHER_VENDOR}','vendor','Globex Parts','U_BUYER');
    INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES
      ('U_CTRL','Priya','controller','U_CTRL',10000000), ('U_AP','Lee','ap_clerk','U_AP',500000);
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES
      ('${INTENT_ID}','ap','Clear the Acme bill','ap','open','2026-07-12T09:00:00Z'),
      ('int_open','ap','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at)
      VALUES ('dec_open','int_open','ap','live','no_action','seed','auto','2026-07-01T00:00:00Z');
  `);
  addPo(db, { id: PO_ID, party_id: opts.po_party_id ?? VENDOR, lines_json: opts.po_lines_json ?? DEFAULT_PO_LINES });
  (opts.receipt_qtys ?? [10]).forEach((qty, i) => {
    addReceipt(db, { id: `RCPT-${i + 1}`, po_id: PO_ID, qty, received_date: `2026-07-0${i + 1}` });
  });
  addBill(db, {
    id: BILL_ID, po_id: opts.bill_po_id === undefined ? PO_ID : opts.bill_po_id,
    vendor_invoice_no: INVOICE_NO, total_cents: opts.bill_total_cents ?? 40000,
  });
  return db;
}

export function addPo(db: Db, po: { id: string; party_id: string; lines_json: string }): void {
  const total = totalOf(po.lines_json);
  db.prepare("INSERT INTO po (id, party_id, lines_json, total_cents) VALUES (?, ?, ?, ?)")
    .run(po.id, po.party_id, po.lines_json, total);
}

export function addReceipt(db: Db, r: { id: string; po_id: string; qty: number; received_date: string; lines_json?: string }): void {
  const lines = r.lines_json ?? JSON.stringify([{ sku: "WIDGET", qty: r.qty }]);
  db.prepare("INSERT INTO receipt (id, po_id, received_date, lines_json) VALUES (?, ?, ?, ?)")
    .run(r.id, r.po_id, r.received_date, lines);
}

export interface BillSpec {
  id: string;
  vendor_invoice_no: string;
  total_cents: number;
  party_id?: string;
  po_id?: string | null;
  service_period?: string | null;
  status?: string;
  bill_date?: string;
}

/**
 * A bill that arrives already approved or scheduled is already in the AP subledger, so it needs the
 * matching credit on the AP control account. Without it the kernel fails F3 before it reaches the
 * pack's own checks, and the test would prove nothing.
 */
export function addBill(db: Db, spec: BillSpec): void {
  const status = spec.status ?? "open";
  const billDate = spec.bill_date ?? "2026-07-10";
  const traceId = `tr_${spec.id}`;
  insertBillTrace(db, traceId, spec);
  db.prepare(
    `INSERT INTO bill (id, party_id, po_id, vendor_invoice_no, bill_date, due_date, service_period, total_cents, open_cents, status, trace_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(spec.id, spec.party_id ?? VENDOR, spec.po_id ?? null, spec.vendor_invoice_no, billDate, "2026-08-09",
    spec.service_period === undefined ? SERVICE_PERIOD : spec.service_period, spec.total_cents, spec.total_cents, status, traceId);
  if (status === "approved" || status === "scheduled") bookAp(db, spec.id, spec.total_cents);
}

function insertBillTrace(db: Db, traceId: string, spec: BillSpec): void {
  const payload = JSON.stringify({
    from: `billing@${spec.party_id ?? VENDOR}.test`,
    subject: `Invoice ${spec.vendor_invoice_no}`,
    body: `Invoice ${spec.vendor_invoice_no} against purchase order ${spec.po_id ?? "none"}, total ${spec.total_cents} cents, payable net 30.`,
  });
  db.prepare(
    `INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json)
     VALUES (?, 'gmail', 'vendor_bill', ?, ?, ?, '2026-09-19T20:00:00Z', ?, ?, ?)`,
  ).run(traceId, spec.id, "2026-07-10T08:00:00Z", "2026-07-10T08:00:00Z", spec.party_id ?? VENDOR,
    createHash("sha256").update(payload).digest("hex"), payload);
}

/** Dr misc expense / Cr accounts payable, so the control account ties to the subledger. */
function bookAp(db: Db, billId: string, cents: number): void {
  const entryId = `je_${billId}`;
  db.prepare("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES (?, '2026-07', '2026-07-01', 'dec_open', ?, '2026-07-01T00:00:00Z')")
    .run(entryId, `Opening: ${billId} already approved`);
  const line = db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES (?, ?, ?, ?, ?)");
  line.run(entryId, 1, ACCOUNTS.misc_expense, cents, 0);
  line.run(entryId, 2, ACCOUNTS.ap, 0, cents);
}

function totalOf(linesJson: string): number {
  try {
    const parsed = JSON.parse(linesJson) as Array<{ qty?: number; unit_cents?: number }>;
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((n, l) => n + (l.qty ?? 0) * (l.unit_cents ?? 0), 0);
  } catch {
    return 0; // A deliberately malformed PO has no computable total; the test is about the failure.
  }
}

/** The AP reading of a CaseFile: received is what the vendor billed, expected is what is supported. */
export function apCase(over: Partial<CaseFile> = {}): CaseFile {
  const billed = over.received_cents ?? 40000;
  const supported = over.expected_cents ?? 40000;
  return {
    intent_id: INTENT_ID, function: "ap", party_id: VENDOR, entry_date: "2026-07-12",
    doc_ids: [BILL_ID], expected_cents: supported, received_cents: billed,
    shortfall_cents: supported - billed, trace_ids: [`tr_${BILL_ID}`], ...over,
  };
}
