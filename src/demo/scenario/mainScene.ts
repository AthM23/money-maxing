import { createHash } from "node:crypto";
import type { CaseFile } from "../../contract/types.js";
import type { Db } from "../../runtime/db.js";

/**
 * The main scene: one wire, $4,200 short for three different reasons, and only one of them needs a person.
 * Vossberg Logistik (Hamburg) is invoiced EUR 100,000.00, booked at 1.1000 = USD 110,000.00. It pays EUR 98,000.00;
 * the bank converts at 1.0800 and takes USD 40.00, so USD 105,800.00 arrives. The rate moved (USD 1,960.00), the bank
 * took a fee (USD 40.00), and the customer held back EUR 2,000.00 (USD 2,200.00 at the booked rate) for an outage that
 * Slack proves happened and nobody with authority has agreed to credit. Fictional company; the figures are the team's
 * agreed fixture (context/FIXTURE_INTL_PROPOSAL.md, GATE1_ANSWERS_A.md).
 */
// The charge is stated before the amounts so that the first "40.00" in the advice is the charge, not the tail of 105,840.00.
export const ADVICE_320 = "Credit advice: incoming international wire, charges SHA. By order of VOSSBERG LOGISTIK GMBH, Hamburg. Remittance information INV-3201. Bank charges deducted USD 40.00. Amount received EUR 98,000.00. Exchange rate applied 1.0800 USD per EUR. USD equivalent 105,840.00. Net credit USD 105,800.00 to account ending 4417. Value date 2026-07-15.";
export const ADVICE_321 = "Credit advice: incoming international wire, charges SHA. By order of VOSSBERG LOGISTIK GMBH, Hamburg. Remittance information INV-3202. Bank charges deducted USD 25.00. Amount received EUR 24,500.00. Exchange rate applied 1.0900 USD per EUR. USD equivalent 26,705.00. Net credit USD 26,680.00 to account ending 4417. Value date 2026-07-22.";

const DOCS: { id: string; source: string; kind: string; at: string; payload: Record<string, string> }[] = [
  { id: "tr_bank_BTX-320", source: "bank", kind: "bank_line", at: "2026-07-15T10:00:00Z", payload: { descriptor: "WIRE TYPE:INTL IN TRN:2026071500881203 ORG:VOSSBERG LOGISTIK GMBH HAMBURG OBI:INV-3201", account: "JPMorgan Chase USD operating ··4417", entity: "Northwind Systems Inc", currency: "USD" } },
  { id: "tr_bank_BTX-321", source: "bank", kind: "bank_line", at: "2026-07-22T10:00:00Z", payload: { descriptor: "WIRE TYPE:INTL IN TRN:2026072200413377 ORG:VOSSBERG LOGISTIK GMBH HAMBURG OBI:INV-3202", account: "JPMorgan Chase USD operating ··4417", entity: "Northwind Systems Inc", currency: "USD" } },
  { id: "tr_advice_BTX-320", source: "gmail", kind: "email", at: "2026-07-15T10:05:00Z", payload: { from: "wire.advices@jpm-treasury.test", to: "treasury@northwind.test", subject: "Credit advice: incoming wire 2026071500881203", body: ADVICE_320 } },
  { id: "tr_advice_BTX-321", source: "gmail", kind: "email", at: "2026-07-22T10:05:00Z", payload: { from: "wire.advices@jpm-treasury.test", to: "treasury@northwind.test", subject: "Credit advice: incoming wire 2026072200413377", body: ADVICE_321 } },
  { id: "tr_mail_vossberg_1", source: "gmail", kind: "email", at: "2026-07-14T14:30:00Z", payload: { from: "kreditoren@vossberg-logistik.test", to: "ar@northwind.test", subject: "Zahlungsavis / remittance advice INV-3201",
    body: "Invoice INV-3201, invoice amount EUR 100,000.00. Less EUR 2,000.00 withheld re the service outage of 17 to 18 June (your ticket NW-48213). Payment EUR 98,000.00, value 15 July. Kreditorenbuchhaltung, Vossberg Logistik GmbH" } },
  { id: "tr_slack_vossberg_1", source: "slack", kind: "message", at: "2026-06-18T08:40:00Z", payload: { channel: "#cs-escalations", user: "sam", text: "Vossberg's tracking API was down for about nine hours overnight (NW-48213). Their ops director wants to talk about a credit. I have not promised anything." } },
  { id: "tr_contract_vossberg", source: "contract", kind: "order_form", at: "2025-10-01T00:00:00Z", payload: { title: "Order form NW-VOS-2025", text: "Fees EUR 100,000 per quarter for the platform, invoiced quarterly in advance, payable in euro, net 30. Add-on modules invoiced separately. Section 7: service credits of up to 2% of the fees for the affected period may be granted at Northwind's discretion and are effective only when confirmed in writing by an officer of Northwind." } },
];

export const MAIN_CASES: CaseFile[] = [
  { intent_id: "int_main", function: "ar", party_id: "vossberg", entry_date: "2026-07-15", bank_txn_id: "BTX-320", doc_ids: ["INV-3201"],
    expected_cents: 11000000, received_cents: 10580000, shortfall_cents: 420000, method: "wire", trace_ids: ["tr_bank_BTX-320", "tr_advice_BTX-320"] },
  // Variant 2: a separate add-on invoice a week later, again net of the same 2%. A standing answer must cover it without asking.
  { intent_id: "int_addon", function: "ar", party_id: "vossberg", entry_date: "2026-07-22", bank_txn_id: "BTX-321", doc_ids: ["INV-3202"],
    expected_cents: 2750000, received_cents: 2668000, shortfall_cents: 82000, method: "wire", trace_ids: ["tr_bank_BTX-321", "tr_advice_BTX-321"] },
];

/** Adds the main scene to a seeded global July. The opening AR entry is topped up so the books still tie. */
export function seedMainScene(db: Db): void {
  db.prepare("INSERT INTO party (id, kind, name, owner_user) VALUES ('vossberg','customer','Vossberg Logistik GmbH','U_SAM')").run();
  const invoice = db.prepare("INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, 'vossberg', ?, ?, ?, ?, 'open')");
  invoice.run("INV-3201", "2026-06-15", "2026-07-15", 11000000, 11000000);
  invoice.run("INV-3202", "2026-07-01", "2026-07-31", 2750000, 2750000);
  const fx = db.prepare("INSERT INTO invoice_fx (invoice_id, currency, foreign_total_cents, booked_rate_ppm) VALUES (?, 'EUR', ?, 1100000)");
  fx.run("INV-3201", 10000000);
  fx.run("INV-3202", 2500000);
  db.exec(`UPDATE gl_line SET debit_cents = debit_cents + 13750000 WHERE entry_id = 'je_open' AND line_no = 1;
           UPDATE gl_line SET credit_cents = credit_cents + 13750000 WHERE entry_id = 'je_open' AND line_no = 2;`);
  for (const d of DOCS) {
    const payload = JSON.stringify(d.payload);
    db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, '2026-09-19T20:00:00Z', 'vossberg', ?, ?)")
      .run(d.id, d.source, d.kind, d.id, d.at, d.at, createHash("sha256").update(payload).digest("hex"), payload);
  }
  const bank = db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES (?, ?, ?, ?, 'wire', 'vossberg', ?)");
  bank.run("BTX-320", "2026-07-15", 10580000, DOCS[0]!.payload.descriptor, "tr_bank_BTX-320");
  bank.run("BTX-321", "2026-07-22", 2668000, DOCS[1]!.payload.descriptor, "tr_bank_BTX-321");
  const bankFx = db.prepare("INSERT INTO bank_txn_fx (bank_txn_id, currency, foreign_amount_cents, rate_ppm, fee_cents, advice_trace_id) VALUES (?, 'EUR', ?, ?, ?, ?)");
  bankFx.run("BTX-320", 9800000, 1080000, 4000, "tr_advice_BTX-320");
  bankFx.run("BTX-321", 2450000, 1090000, 2500, "tr_advice_BTX-321");
  seedFeeHistory(db);
  for (const c of MAIN_CASES) {
    db.prepare("INSERT INTO intent (id, function, question, owner, status, end_condition_json, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?, ?)")
      .run(c.intent_id, `Resolve the ${c.shortfall_cents} cent difference on ${c.doc_ids[0]}`, JSON.stringify({ bank_txn_applied: c.bank_txn_id, docs_settled: c.doc_ids }), JSON.stringify(c), `${c.entry_date}T09:00:00Z`);
  }
}

/** Q2: the team wrote off this customer's incoming-wire fees three times, so the learned rule is allowed to cover it. */
function seedFeeHistory(db: Db): void {
  const points = [["dp_q2_v1", 4000, "2026-04-16"], ["dp_q2_v2", 4000, "2026-05-18"], ["dp_q2_v3", 3500, "2026-06-17"]] as const;
  for (const [id, cents, day] of points) {
    const payload = JSON.stringify({ descriptor: `WIRE TYPE:INTL IN ORG:VOSSBERG LOGISTIK GMBH incoming wire fee USD ${(cents / 100).toFixed(2)}` });
    db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, 'bank', 'bank_line', ?, ?, ?, '2026-09-19T20:00:00Z', 'vossberg', ?, ?)")
      .run(`tr_${id}`, `tr_${id}`, `${day}T10:00:00Z`, `${day}T10:00:00Z`, createHash("sha256").update(payload).digest("hex"), payload);
    const doc = `Q2-${id}`;
    const c: CaseFile = { intent_id: `int_replay_${id}`, function: "ar", party_id: "vossberg", entry_date: day, doc_ids: [doc], expected_cents: 2000000, received_cents: 0,
      shortfall_cents: cents, method: "wire", trace_ids: [`tr_${id}`], docs_snapshot: [{ id: doc, kind: "invoice", party_id: "vossberg", total_cents: 2000000, open_cents: cents, date: `${day.slice(0, 8)}01` }] };
    db.prepare("INSERT INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json) VALUES (?, 'ar', ?, 'short_pay', ?, ?, ?, ?)")
      .run(id, day.slice(0, 7), JSON.stringify([`tr_${id}`]), `${day}T12:00:00Z`, JSON.stringify(c), JSON.stringify({ kind: "write_off", account: "6150", amount_cents: cents, doc_ids: [doc] }));
  }
}
