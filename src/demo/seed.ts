import { createHash } from "node:crypto";
import { ACCOUNTS } from "../contract/accounts.js";
import type { CaseFile } from "../contract/types.js";
import type { Db } from "../runtime/db.js";

/**
 * A small July for running Person A's lane end to end before the real seeder exists: three customers, three
 * payments, one compiled policy, a mailbox with the answer buried among ordinary mail. Person B's seeder replaces this.
 */
export function seedDemoWorld(db: Db): void {
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-06','locked'), ('2026-07','open');
    INSERT INTO party (id, kind, name, owner_user) VALUES
      ('initech','customer','Initech','U_DANA'), ('wayne','customer','Wayne Enterprises','U_SAM'), ('umbrella','customer','Umbrella Corp','U_DANA'),
      ('meridian','customer','Meridian Infotech Pvt Ltd (Bengaluru)','U_SAM');
    INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES
      ('INV-1042','initech','2026-07-01','2026-07-31',1200000,1200000,'open'),
      ('INV-1050','wayne','2026-07-01','2026-07-31',3300000,3300000,'open'),
      ('INV-1060','umbrella','2026-07-01','2026-07-31',2000000,2000000,'open'),
      ('INV-1071','meridian','2026-07-01','2026-07-31',1800000,1800000,'open');
    INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES
      ('BTX-1','2026-07-12',1080000,'ACH INITECH INC INV 1042','ach','initech','tr_bank_1'),
      ('BTX-2','2026-07-15',1998000,'WIRE UMBRELLA CORP','wire','umbrella','tr_bank_2'),
      ('BTX-9','2026-07-16',2970000,'ACH WAYNE ENT','ach','wayne','tr_bank_9'),
      ('BTX-7','2026-07-17',1620000,'WIRE IN /ORG/MERIDIAN INFOTECH PVT LTD BENGALURU /OBI/INV-1071 NET OF TDS','wire','meridian','tr_bank_7');
    INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES
      ('U_CTRL','Priya (controller)','controller','U_CTRL',10000000), ('U_SAM','Sam (account owner)','account_owner','U_SAM',500000),
      ('U_DANA','Dana (account owner)','account_owner','U_DANA',500000), ('controller:claude','Controller agent','controller_agent',NULL,49999),
      ('controller:gpt','Controller agent','controller_agent',NULL,49999);
    INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, max_amount_cents, status, approved_by, approved_at) VALUES
      ('pol_wire_fee','ar','Wire shortfall up to $50 goes to bank charges',
       '{"all":[{"field":"shortfall_cents","op":">","value":0},{"field":"shortfall_cents","op":"<=","value":5000},{"field":"method","op":"==","value":"wire"}]}',
       '{"kind":"write_off","account":"${ACCOUNTS.bank_charges}"}','Do not chase customers for bank fees we cannot control','company',10000000,'approved','U_CTRL','2026-07-01T00:00:00Z');
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at)
      VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-07','2026-07-01','dec_open','July invoices','2026-07-01T00:00:00Z');
    INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES
      ('je_open',1,'${ACCOUNTS.ar}',8300000,0), ('je_open',2,'${ACCOUNTS.deferred_revenue}',0,8300000);
  `);
  for (const t of TRACES) insertTrace(db, t);
  for (const c of DEMO_CASES) {
    db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?)")
      .run(c.intent_id, `Resolve the ${c.shortfall_cents} cent shortfall for ${c.party_id}`, JSON.stringify(c), `${c.entry_date}T09:00:00Z`);
  }
}

interface SeedTrace { id: string; source: string; kind: string; party_id: string | null; at: string; payload: Record<string, unknown> }

const TRACES: SeedTrace[] = [
  { id: "tr_bank_1", source: "bank", kind: "bank_line", party_id: "initech", at: "2026-07-12T10:00:00Z", payload: { descriptor: "ACH INITECH INC INV 1042", amount_cents: 1080000 } },
  { id: "tr_bank_2", source: "bank", kind: "bank_line", party_id: "umbrella", at: "2026-07-15T10:00:00Z", payload: { descriptor: "WIRE UMBRELLA CORP", amount_cents: 1998000 } },
  { id: "tr_bank_9", source: "bank", kind: "bank_line", party_id: "wayne", at: "2026-07-16T10:00:00Z", payload: { descriptor: "ACH WAYNE ENT", amount_cents: 2970000 } },
  { id: "tr_bank_7", source: "bank", kind: "bank_line", party_id: "meridian", at: "2026-07-17T10:00:00Z", payload: { descriptor: "WIRE IN /ORG/MERIDIAN INFOTECH PVT LTD BENGALURU /OBI/INV-1071 NET OF TDS", amount_cents: 1620000 } },
  { id: "tr_mail_7", source: "gmail", kind: "email", party_id: "meridian", at: "2026-07-17T06:30:00Z",
    payload: { from: "accounts.payable@meridianinfotech.test", to: "ar@northwind.test", subject: "Remittance advice: INV-1071",
      body: "Dear Northwind AR team, we have remitted USD 16,200.00 today against invoice INV-1071 for USD 18,000.00. As required under Section 195 of the Income-tax Act, tax has been deducted at source at 10% (USD 1,800.00) and deposited with the Government of India. Form 16A for the quarter will follow by 15 August. Regards, Accounts Payable, Meridian Infotech Pvt Ltd" } },
  { id: "tr_mail_1", source: "gmail", kind: "email", party_id: "initech", at: "2026-06-20T14:00:00Z",
    payload: { from: "raj@initech.test", to: "ceo@northwind.test", subject: "Renewal pricing", body: "Morgan, given the volume we are bringing next year we would like to see 15% off the platform fee. Can you do that?" } },
  { id: "tr_mail_2", source: "gmail", kind: "email", party_id: "initech", at: "2026-06-28T15:00:00Z",
    payload: { from: "ceo@northwind.test", to: "raj@initech.test", subject: "Re: Renewal pricing", body: "Raj, 15% is more than I can do. Confirming what we discussed on the phone: Initech gets 10% off the platform fee through renewal on 2027-06-30. I have not told finance yet. Morgan" } },
  { id: "tr_mail_3", source: "gmail", kind: "email", party_id: "initech", at: "2026-07-02T09:00:00Z",
    payload: { from: "ap@initech.test", to: "ar@northwind.test", subject: "Invoice INV-1042", body: "We have INV-1042 in our queue for the 12 July run." } },
  { id: "tr_mail_4", source: "gmail", kind: "email", party_id: "wayne", at: "2026-07-03T11:00:00Z",
    payload: { from: "ap@wayne.test", to: "ar@northwind.test", subject: "Remittance", body: "Payment for INV-1050 is scheduled for 16 July." } },
  { id: "tr_mail_5", source: "gmail", kind: "email", party_id: null, at: "2026-07-05T08:00:00Z",
    payload: { from: "events@saasconf.test", to: "ceo@northwind.test", subject: "Early bird discount ends Friday", body: "Get 20% off your conference pass through Friday." } },
  { id: "tr_slack_1", source: "slack", kind: "message", party_id: "wayne", at: "2026-06-18T16:00:00Z",
    payload: { channel: "#cs-escalations", user: "sam", text: "Wayne's SSO rollout failed again this morning. Their CIO is not happy. I am on a call with them at 3." } },
  { id: "tr_contract_initech", source: "contract", kind: "order_form", party_id: "initech", at: "2025-07-01T00:00:00Z",
    payload: { title: "Order form NW-INI-2025", text: "Platform fee USD 12,000 per month, billed monthly in advance, net 30. Term 1 July 2025 to 30 June 2027. No discounts apply unless agreed in writing by an officer of Northwind." } },
  { id: "tr_contract_wayne", source: "contract", kind: "order_form", party_id: "wayne", at: "2025-01-01T00:00:00Z",
    payload: { title: "Order form NW-WAY-2025", text: "Platform fee USD 33,000 per month, billed monthly in advance, net 30. Service credits are at Northwind's discretion." } },
  { id: "tr_policy_memo", source: "file", kind: "policy_memo", party_id: null, at: "2026-01-02T00:00:00Z",
    payload: { title: "Northwind accounting policy memo", text: "Adjustments of USD 500 or more require approval by a person in the approval matrix. Account owners may approve customer credits up to USD 5,000. The controller approves up to USD 100,000. Price concessions on subscriptions still being delivered reduce deferred revenue (2400). Tax deducted at source by a customer under local law is not a discount and not an expense: settle it against the invoice to Withholding tax receivable (1350), and obtain the withholding certificate so the credit can be claimed." } },
];

function insertTrace(db: Db, t: SeedTrace): void {
  const payload = JSON.stringify(t.payload);
  db.prepare(
    "INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(t.id, t.source, t.kind, t.id, t.at, t.at, "2026-09-19T20:00:00Z", t.party_id, createHash("sha256").update(payload).digest("hex"), payload);
}

export const DEMO_CASES: CaseFile[] = [
  { intent_id: "int_umbrella", function: "ar", party_id: "umbrella", entry_date: "2026-07-15", bank_txn_id: "BTX-2", doc_ids: ["INV-1060"],
    expected_cents: 2000000, received_cents: 1998000, shortfall_cents: 2000, method: "wire", trace_ids: ["tr_bank_2"] },
  { intent_id: "int_initech", function: "ar", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1", doc_ids: ["INV-1042"],
    expected_cents: 1200000, received_cents: 1080000, shortfall_cents: 120000, method: "ach", trace_ids: ["tr_bank_1"] },
  { intent_id: "int_meridian", function: "ar", party_id: "meridian", entry_date: "2026-07-17", bank_txn_id: "BTX-7", doc_ids: ["INV-1071"],
    expected_cents: 1800000, received_cents: 1620000, shortfall_cents: 180000, method: "wire", trace_ids: ["tr_bank_7"] },
  { intent_id: "int_wayne", function: "ar", party_id: "wayne", entry_date: "2026-07-16", bank_txn_id: "BTX-9", doc_ids: ["INV-1050"],
    expected_cents: 3300000, received_cents: 2970000, shortfall_cents: 330000, method: "ach", trace_ids: ["tr_bank_9"] },
];
