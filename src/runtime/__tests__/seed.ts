import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal } from "../../contract/types.js";
import type { Clock } from "../config.js";
import { openDb, type Db } from "../db.js";

export const fixedClock: Clock = { now: () => "2026-07-14T16:00:00.000Z" };

export const CEO_EMAIL =
  "Hi Dana, confirming what we discussed: Initech gets 10% off the platform fee through renewal on 2027-06-30. Thanks, Morgan (CEO)";

/** A tiny July: Initech owes $12,000, pays $10,800, and the reason sits in a CEO email. */
export function seedInitech(): Db {
  const db = openDb();
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-06','locked'), ('2026-07','open');
    INSERT INTO party (id, kind, name, owner_user) VALUES ('initech','customer','Initech','U_DANA'), ('wayne','customer','Wayne Enterprises','U_SAM');
    INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status)
      VALUES ('INV-1042','initech','2026-07-01','2026-07-31',1200000,1200000,'open'),
             ('INV-1050','wayne','2026-07-01','2026-07-31',3300000,3300000,'open');
    INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id)
      VALUES ('BTX-1','2026-07-12',1080000,'ACH INITECH INC INV 1042','ach','initech');
    INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES
      ('U_CTRL','Priya','controller','U_CTRL',1000000), ('U_AP','Lee','ap_clerk','U_AP',10000);
    INSERT INTO intent (id, function, question, owner, status, created_at)
      VALUES ('int_1','ar','Resolve the $1,200 shortfall on INV-1042','ar','open','2026-07-12T09:00:00Z');
  `);
  db.prepare(
    "INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run("tr_email_1", "gmail", "email", "msg-1", "2026-06-28T15:00:00Z", "2026-06-28T15:00:00Z", "2026-09-19T20:00:00Z", "initech", "h1",
    JSON.stringify({ from: "ceo@northwind.test", subject: "Initech pricing", body: CEO_EMAIL }));
  postOpeningBalances(db);
  return db;
}

/** The seeder's obligation: the AR control account ties to open invoices before any proposal runs. */
function postOpeningBalances(db: Db): void {
  db.exec(`
    INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_open','revenue','Opening balances','seed','resolved','2026-07-01T00:00:00Z');
    INSERT INTO decision (id, intent_id, function, mode, kind, actor, autonomy_level, created_at) VALUES ('dec_open','int_open','revenue','live','no_action','seed','auto','2026-07-01T00:00:00Z');
    INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_open','2026-07','2026-07-01','dec_open','July invoices','2026-07-01T00:00:00Z');
    INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES
      ('je_open',1,'${ACCOUNTS.ar}',4500000,0), ('je_open',2,'${ACCOUNTS.deferred_revenue}',0,4500000);
  `);
}

export function applyPayment(): Proposal {
  return {
    intent_id: "int_1", function: "ar", kind: "apply_payment", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1",
    applications: [{ doc_id: "INV-1042", amount_cents: 1080000 }],
    entries: [
      { account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "ACH Initech INV-1042" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1080000, memo: "ACH Initech INV-1042" },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  };
}

export function creditMemo(quote = "Initech gets 10% off the platform fee through renewal on 2027-06-30"): Proposal {
  return {
    intent_id: "int_1", function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-1042", amount_cents: 120000 }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: 120000, credit_cents: 0, memo: "Concession per CEO email 28 Jun" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "Concession per CEO email 28 Jun" },
    ],
    terms_change: { pct_off: 10, until: "2027-06-30" },
    evidence: [{ claim: "CEO granted 10% off through renewal", trace_id: "tr_email_1", quote }],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}
