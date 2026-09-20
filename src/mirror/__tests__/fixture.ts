import { readFileSync } from "node:fs";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { KernelResult, Mark, Proposal } from "../../contract/types.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import type { Clock } from "../../runtime/config.js";
import { insertDecision, insertWorkpaper } from "../../runtime/persist.js";
import { postEntry } from "../../runtime/post.js";
import { seedLocal } from "../../seed/local.js";
import { QBO_ITEM_WORLD_ID, qboAccountWorldId } from "../../seed/quickbooks.js";
import { World } from "../../seed/world.js";
import type { QboLike, QboObject, QboUpload } from "../types.js";

/**
 * How the tests get their events: the decision, workpaper, approval and trace rows are written with Person A's
 * persist helpers (or by hand where there is none), the kernel is NOT run, and then the real `postEntry` posts the
 * proposal, so the ledger rows and the bus events (`entry.posted` plus the kind's own topic) are the production ones.
 */

export const clock: Clock = { now: () => "2026-07-14T16:00:00.000Z" };
export const INTENT = "int_initech";
export const EMAIL_TRACE = "tr_gmail_m_initech_2";
export const CHAT_TRACE = "tr_slack_c_1";
export const QBO_IDS = { customer: "64", invoice: "150", item: "19" }; // the sandbox's real ids, read on 2026-09-19
export const QBO_ACCOUNT_IDS = { ar: "84", fx: "120", bank_charges: "8" }; // 84 is the sandbox's A/R; the other two are made up

export function openSeeded(): Db {
  const db = openWorldDb();
  seedLocal(db, World.parse(JSON.parse(readFileSync("world/northwind.json", "utf8"))));
  db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'ar', 'Resolve the $1,200 shortfall on INV-1042', 'ar', 'open', ?)").run(INTENT, clock.now());
  const trace = db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)");
  trace.run(EMAIL_TRACE, "gmail", "email", "m-initech-2", "2026-06-28T15:00:00Z", "2026-06-28T15:00:00Z", "2026-09-19T20:00:00Z", "initech", "h1", JSON.stringify({
    thread_id: "t-initech-pricing", from: "morgan.hale@northwind.test", to: ["pat.lindqvist@initech.test"], cc: ["dana.reyes@northwind.test"],
    subject: "Re: Renewal pricing", date: "2026-06-28T15:00:00Z", body: "Pat,\n\nConfirmed: Initech gets 10% off the platform fee through renewal on 2027-06-30.\n\nMorgan",
  }));
  trace.run(CHAT_TRACE, "slack", "chat_message", "c-1", "2026-07-13T10:00:00Z", "2026-07-13T10:00:00Z", "2026-09-19T20:00:00Z", "initech", "h2", JSON.stringify({ channel: "ar", user: "U_DANA", ts: "2026-07-13T10:00:00Z", text: "Initech short paid again" }));
  return db;
}

export function seedManifest(db: Db): void {
  const ins = db.prepare("INSERT INTO seed_manifest (world_id, system, kind, external_id, seeded_at) VALUES (?, 'quickbooks', ?, ?, ?)");
  ins.run("initech", "customer", QBO_IDS.customer, clock.now());
  ins.run("INV-1042", "invoice", QBO_IDS.invoice, clock.now());
  ins.run(QBO_ITEM_WORLD_ID, "item", QBO_IDS.item, clock.now());
  ins.run(qboAccountWorldId(ACCOUNTS.ar), "account", QBO_ACCOUNT_IDS.ar, clock.now());
  ins.run(qboAccountWorldId(ACCOUNTS.fx_gain_loss), "account", QBO_ACCOUNT_IDS.fx, clock.now());
}

const MARKS: Mark[] = [
  { cls: "F", check: "entry_balances", status: "pass", detail: "debits 1200.00 equal credits 1200.00", refs: [] },
  { cls: "E", check: "quote_in_source", status: "pass", detail: "quote found in the cited email", refs: [EMAIL_TRACE] },
  { cls: "P", check: "approver_within_limit", status: "pass", detail: "U_CTRL may approve up to 10000.00", refs: [] },
  { cls: "J", check: "materiality", status: "judgment", detail: "1200.00 is above the 500.00 threshold", refs: [] },
];

function kernelResult(stage: KernelResult["stage"], marks: Mark[]): KernelResult {
  return { stage, verdict: "accept", requires_approval: false, marks, failed: [], checkable_num: 3, checkable_den: 4 };
}

/** Decision + two workpapers (proposal, then post gate: the later one must be the one printed) + approval, then post. */
function post(db: Db, proposal: Proposal, approved: boolean): string {
  const id = insertDecision(db, clock, proposal, { actor: "agent:ar", mode: "live", autonomy_level: "review", tier: 1 });
  db.prepare("UPDATE decision SET route = ? WHERE id = ?").run(approved ? "PROPOSE" : "AUTO", id);
  insertWorkpaper(db, { now: () => "2026-07-14T15:00:00.000Z" }, id, kernelResult("proposal", MARKS.slice(0, 2)));
  insertWorkpaper(db, clock, id, kernelResult("post_gate", MARKS));
  if (approved) {
    db.prepare("INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, note, approved_at) VALUES (?, ?, 'U_CTRL', 'human', 'approved', 'ok per CEO email', ?)").run(`apr_${id}`, id, clock.now());
  }
  postEntry(db, clock, { decision_id: id, intent_id: proposal.intent_id, proposal });
  return id;
}

export function postPayment(db: Db): string {
  return post(db, {
    intent_id: INTENT, function: "ar", kind: "apply_payment", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-0070",
    applications: [{ doc_id: "INV-1042", amount_cents: 1080000 }],
    entries: [
      { account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "ACH Initech INV-1042" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1080000, memo: "ACH Initech INV-1042" },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  }, false);
}

export function postCreditMemo(db: Db): string {
  return post(db, {
    intent_id: INTENT, function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-1042", amount_cents: 120000 }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: 120000, credit_cents: 0, memo: "Concession per CEO email 28 Jun" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "Concession per CEO email 28 Jun" },
    ],
    terms_change: { pct_off: 10, until: "2027-06-30" },
    evidence: [
      { claim: "CEO granted 10% off through renewal", trace_id: EMAIL_TRACE, quote: "Initech gets 10% off the platform fee through renewal on 2027-06-30" },
      { claim: "AR noticed the short pay", trace_id: CHAT_TRACE },
    ],
    policy_refs: [], fact_refs: [], judgment: [],
  }, true);
}

/** Realised FX on a converted receipt: no cash moves, the loss comes off the invoice. Reaches the mirror on entry.posted only. */
export function postFxLoss(db: Db): string {
  return post(db, {
    intent_id: INTENT, function: "ar", kind: "fx_realized", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-0070",
    applications: [{ doc_id: "INV-1042", amount_cents: 19600 }],
    entries: [
      { account: ACCOUNTS.fx_gain_loss, debit_cents: 19600, credit_cents: 0, memo: "Realized FX loss: settled at 1.0800, booked at 1.1000" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 19600, memo: "Realized FX loss: settled at 1.0800, booked at 1.1000" },
    ],
    evidence: [{ claim: "Bank advice states the rate", trace_id: EMAIL_TRACE }], policy_refs: [], fact_refs: [], judgment: [],
  }, false);
}

/** A write-off whose debit account has no manifest row: bank charges is not in `seedManifest`. */
export function postFeeWriteOff(db: Db): string {
  return post(db, {
    intent_id: INTENT, function: "ar", kind: "write_off", party_id: "initech", entry_date: "2026-07-12",
    applications: [{ doc_id: "INV-1042", amount_cents: 4000 }],
    entries: [
      { account: ACCOUNTS.bank_charges, debit_cents: 4000, credit_cents: 0, memo: "Wire fee kept by the bank" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 4000, memo: "Wire fee kept by the bank" },
    ],
    evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  }, false);
}

/** A kind the mirror does not build: it reaches the mirror on entry.posted only. */
export function postAccrual(db: Db): string {
  return post(db, {
    intent_id: INTENT, function: "close", kind: "accrual", party_id: "initech", entry_date: "2026-07-31", applications: [],
    entries: [
      { account: ACCOUNTS.misc_expense, debit_cents: 5000, credit_cents: 0, memo: "accrual" },
      { account: ACCOUNTS.accrued_liabilities, debit_cents: 0, credit_cents: 5000, memo: "accrual" },
    ],
    reversal_mode: "auto_next_period", evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  }, false);
}

export type FakeRequest =
  | { op: "query"; sql: string }
  | { op: "create"; entity: string; body: Record<string, unknown>; request_id: string | undefined }
  | { op: "upload"; file: QboUpload };

/**
 * Records every request in order. Ids count up from 900. `failWhen` throws before the request "reaches" QuickBooks.
 * `remember()` makes it answer the mirror's lookups from what was created through it: the QuickBooks company that
 * outlives a local database reset.
 */
export class FakeQbo implements QboLike {
  requests: FakeRequest[] = [];
  failWhen: (r: FakeRequest) => boolean = () => false;
  answer: (sql: string) => QboObject[] = () => [];
  /** Everything created or uploaded, by entity: what a real company would hand back to a later query. */
  stored: Array<{ entity: string; obj: QboObject }> = [];
  private next = 900;
  /** `requestid` → what the first create under it returned. Like Intuit, a repeat answers with that, even once the object is gone. */
  private replies = new Map<string, QboObject>();

  get writes(): FakeRequest[] { return this.requests.filter((r) => r.op !== "query"); }

  private record(r: FakeRequest): void {
    this.requests.push(r);
    if (this.failWhen(r)) throw new Error(`QBO POST failed (HTTP 400): ValidationFault: simulated for ${r.op}`);
  }

  async create(entity: string, body: Record<string, unknown>, opts?: { requestId?: string }): Promise<QboObject> {
    this.record({ op: "create", entity, body, request_id: opts?.requestId });
    const replay = opts?.requestId !== undefined ? this.replies.get(opts.requestId) : undefined;
    if (replay) return replay;
    const lines = Array.isArray(body.Line) ? (body.Line as Array<{ Amount?: number }>) : [];
    // QuickBooks computes a CreditMemo's TotalAmt from its lines; a Payment is sent with one
    const obj: QboObject = { TotalAmt: lines.reduce((sum, l) => sum + (l.Amount ?? 0), 0), ...body, Id: String(this.next++) };
    this.stored.push({ entity, obj });
    if (opts?.requestId !== undefined) this.replies.set(opts.requestId, obj);
    return obj;
  }

  /** The mirror's "does what I just created exist" check is answered from `stored` and kept out of `requests`: the tests' request lists are about what the mirror decides to send. */
  async query(sql: string): Promise<QboObject[]> {
    const byId = /^select \* from (\w+) where Id = '([^']*)'$/.exec(sql);
    if (byId) return this.stored.filter((s) => s.entity === byId[1] && s.obj.Id === byId[2]).map((s) => s.obj);
    this.record({ op: "query", sql });
    return this.answer(sql);
  }

  async upload(file: QboUpload): Promise<QboObject> {
    this.record({ op: "upload", file });
    const obj: QboObject = { Id: String(this.next++), FileName: file.file_name, AttachableRef: [{ EntityRef: { type: file.entity_type, value: file.entity_id } }] };
    this.stored.push({ entity: "Attachable", obj });
    return obj;
  }

  /** Answer `select * from <Entity> where <Field> = '<v>' [and ...]` from `stored`. Only the fields the mirror filters by. */
  remember(): this {
    this.answer = (sql) => {
      const entity = /from (\w+)/.exec(sql)?.[1];
      const conds = [...sql.matchAll(/([\w.]+) = '([^']*)'/g)].map((m) => [m[1]!, m[2]!] as const);
      const field = (o: QboObject, name: string): unknown => {
        if (name === "CustomerRef") return (o.CustomerRef as { value?: unknown } | undefined)?.value;
        const ref = (o.AttachableRef as Array<{ EntityRef: { type: string; value: string } }> | undefined)?.[0]?.EntityRef;
        if (name === "AttachableRef.EntityRef.Type") return ref?.type;
        if (name === "AttachableRef.EntityRef.value") return ref?.value;
        return o[name];
      };
      return this.stored.filter((s) => s.entity === entity && conds.every(([k, v]) => String(field(s.obj, k)) === v)).map((s) => s.obj);
    };
    return this;
  }
}

export function logRows(db: Db, decisionId: string): Array<{ kind: string; status: string; external_id: string | null; detail: string | null }> {
  return db.prepare("SELECT kind, status, external_id, detail FROM mirror_log WHERE decision_id = ? AND system = 'quickbooks' ORDER BY kind").all(decisionId) as Array<{ kind: string; status: string; external_id: string | null; detail: string | null }>;
}
