import { createHash } from "node:crypto";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile } from "../../contract/types.js";
import type { Db } from "../../runtime/db.js";
import { DOCUMENTS, Q2_WIRE_FEES, type SeedDoc } from "./documents.js";
import { BANK_ACCOUNTS, BANK_LINES, CASES, CUSTOMERS, ENTITIES, INVOICES } from "./plants.js";

const INGESTED = "2026-09-19T20:00:00Z";

/** The global July, seeded into an empty database: books that tie, every document findable, one open case per receipt. */
export function seedGlobalJuly(db: Db): void {
  db.exec(`
    INSERT INTO period (id, status, locked_at) VALUES ('2026-04','locked','2026-05-06T00:00:00Z'), ('2026-05','locked','2026-06-05T00:00:00Z'),
      ('2026-06','locked','2026-07-07T00:00:00Z'), ('2026-07','open',NULL);
    INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES
      ('U_CFO','Avery (CFO)','cfo','U_CFO',100000000), ('U_CTRL','Priya (controller)','controller','U_CTRL',10000000),
      ('U_SAM','Sam (account owner, EMEA and APAC)','account_owner','U_SAM',500000), ('U_DANA','Dana (account owner, Americas)','account_owner','U_DANA',500000),
      ('controller:claude','Controller agent','controller_agent',NULL,49999), ('controller:gpt','Controller agent','controller_agent',NULL,49999);
  `);
  for (const c of CUSTOMERS) {
    db.prepare("INSERT INTO party (id, kind, name, parent_id, owner_user) VALUES (?, 'customer', ?, ?, ?)").run(c.id, c.name, c.parent_id ?? null, c.owner);
  }
  for (const i of INVOICES) {
    db.prepare("INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(i.id, i.party_id, i.issue_date, `${i.issue_date.slice(0, 8)}28`, i.total_cents, i.open_cents, i.open_cents === 0 ? "paid" : "open");
  }
  for (const b of BANK_LINES) {
    const acct = BANK_ACCOUNTS[b.account];
    insertTrace(db, { id: `tr_bank_${b.id}`, source: "file", kind: "bank_line", party_id: b.party_id, at: `${b.posted_date}T10:00:00Z`,
      payload: { descriptor: b.descriptor, amount: (b.amount_cents / 100).toFixed(2), account: acct.label, entity: ENTITIES[acct.entity].name, currency: "USD" } }, "bank");
    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(b.id, b.posted_date, b.amount_cents, b.descriptor, b.method, b.party_id, `tr_bank_${b.id}`);
  }
  for (const d of DOCUMENTS) insertTrace(db, d);
  openingBalances(db);
  seedQ2(db);
  for (const c of CASES) openCase(db, c);
}

function insertTrace(db: Db, d: SeedDoc, source: string = d.source): void {
  const payload = JSON.stringify(d.payload);
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(d.id, source, d.kind, d.id, d.at, d.at, INGESTED, d.party_id, createHash("sha256").update(payload).digest("hex"), payload);
}

/** The seeder's obligation: the AR control account equals the open invoices before any agent runs. */
function openingBalances(db: Db): void {
  const ar = INVOICES.reduce((n, i) => n + i.open_cents, 0);
  db.exec(`INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, posted_at, created_at) VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-07','2026-07-01','dec_open','Open invoices at 1 July','2026-07-01T00:00:00Z');`);
  db.prepare("INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES ('je_open',1,?,?,0), ('je_open',2,?,0,?)")
    .run(ACCOUNTS.ar, ar, ACCOUNTS.deferred_revenue, ar);
}

/** Closed-period history for replay: the case as the team saw it, and what they booked. No agent tool can reach the outcome. */
function seedQ2(db: Db): void {
  for (const p of Q2_WIRE_FEES) {
    const doc = `Q2-${p.id}`;
    insertTrace(db, { id: `tr_${p.id}`, source: "file", kind: "bank_line", party_id: p.party_id, at: `${p.day}T10:00:00Z`,
      payload: { descriptor: `WIRE TYPE:INTL IN ORG:${p.party_id.toUpperCase()} CHGS:SHA INTERMEDIARY DED USD ${(p.cents / 100).toFixed(2)}` } }, "bank");
    const caseFile: CaseFile = { intent_id: `int_replay_${p.id}`, function: "ar", party_id: p.party_id, entry_date: p.day, doc_ids: [doc],
      expected_cents: 2000000, received_cents: 0, shortfall_cents: p.cents, method: "wire", trace_ids: [`tr_${p.id}`],
      docs_snapshot: [{ id: doc, kind: "invoice", party_id: p.party_id, total_cents: 2000000, open_cents: p.cents, date: `${p.day.slice(0, 8)}01` }] };
    db.prepare("INSERT INTO decision_point (id, function, period, kind, trace_ids_json, decided_at, case_json, human_outcome_json) VALUES (?, 'ar', ?, 'short_pay', ?, ?, ?, ?)")
      .run(p.id, p.day.slice(0, 7), JSON.stringify([`tr_${p.id}`]), `${p.day}T12:00:00Z`, JSON.stringify(caseFile),
        JSON.stringify({ kind: "write_off", account: p.account, amount_cents: p.cents, doc_ids: [doc] }));
  }
}

function openCase(db: Db, c: CaseFile): void {
  db.prepare("INSERT INTO intent (id, function, question, owner, status, end_condition_json, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?, ?)")
    .run(c.intent_id, c.shortfall_cents > 0 ? `Resolve the ${c.shortfall_cents} cent shortfall for ${c.party_id}` : `Apply ${c.received_cents} cents from ${c.party_id}`,
      JSON.stringify({ bank_txn_applied: c.bank_txn_id, docs_settled: c.doc_ids }), JSON.stringify(c), `${c.entry_date}T09:00:00Z`);
}
