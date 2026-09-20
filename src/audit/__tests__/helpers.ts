import { createHash } from "node:crypto";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal, ProposalKind } from "../../contract/types.js";
import { approveDecision } from "../../runtime/approve.js";
import { openDb, type Db } from "../../runtime/db.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { applyPayment, creditMemo, fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";

export const deps = { clock: fixedClock };
export const agent = { actor: "agent:ar", mode: "live" as const, autonomy_level: "auto" as const, tier: 2 };
export const WAYNE_NOTE = "Wayne Enterprises agreed a goodwill credit on the July platform fee.";

/**
 * seed.ts stores a placeholder content_hash ("h1"); the auditor re-computes the real sha256, so every
 * trace is re-hashed here. Editing the shared seeder is not this pack's business.
 */
export function seedAudit(): Db {
  const db = seedInitech();
  db.prepare(
    `INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json)
     VALUES (?,'slack','note',?,?,?,?,'wayne','',?)`,
  ).run("tr_wayne_1", "msg-w1", "2026-07-02T10:00:00Z", "2026-07-02T10:00:00Z", "2026-09-19T20:00:00Z", JSON.stringify({ note: WAYNE_NOTE }));
  rehashTraces(db);
  return db;
}

export function rehashTraces(db: Db): void {
  const rows = db.prepare("SELECT id, payload_json FROM trace").all() as { id: string; payload_json: string }[];
  const update = db.prepare("UPDATE trace SET content_hash = ? WHERE id = ?");
  for (const row of rows) update.run(createHash("sha256").update(row.payload_json).digest("hex"), row.id);
}

function postedId(result: ReturnType<typeof proposeEntry>): string {
  if (result.status !== "posted") throw new Error(`expected a posted decision, got ${result.status}`);
  return result.decision_id;
}

export function postApplyPayment(db: Db): string {
  return postedId(proposeEntry(db, applyPayment(), agent, deps));
}

/** The $1,200 concession: parked for a person, then approved by the controller. */
export function postCreditMemo(db: Db, approverId = "U_CTRL"): string {
  const parked = proposeEntry(db, creditMemo(), agent, deps);
  if (parked.status !== "pending_approval") throw new Error(`expected pending_approval, got ${parked.status}`);
  const done = approveDecision(db, parked.decision_id, { approver_id: approverId, approver_kind: "human", outcome: "approved" }, deps);
  if (done.status !== "posted") throw new Error(`expected posted, got ${done.status}`);
  return parked.decision_id;
}

/** A sub-materiality goodwill credit on Wayne, posted on auto by tier 0 so it is not a must-test item. */
export function smallMemo(index: number): Proposal {
  const amount = 40_000 + index * 1_000;
  const memo = "Goodwill credit per July note";
  return {
    intent_id: "int_1", function: "ar", kind: "credit_memo", party_id: "wayne", entry_date: `2026-07-2${index}`,
    applications: [{ doc_id: "INV-1050", amount_cents: amount }],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: amount, credit_cents: 0, memo },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: amount, memo },
    ],
    evidence: [{ claim: "agreed goodwill credit", trace_id: "tr_wayne_1", quote: WAYNE_NOTE }],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}

export function postSmallMemos(db: Db, count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(postedId(proposeEntry(db, smallMemo(i), { ...agent, tier: 0 }, deps)));
  }
  return ids;
}

/**
 * A concession posted under a policy whose condition is tested against the CASE features, not against
 * anything on the proposal. Re-performance has to read those features back off the workpaper.
 */
export function postPolicyCreditMemo(db: Db): string {
  db.prepare(
    `INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, status, approved_by, approved_at)
     VALUES ('pol_short','ar','Small shortfalls take a concession', ?, '{}', 'Concede small shortfalls', 'company', 'approved', 'U_CTRL', '2026-07-01T00:00:00Z')`,
  ).run(JSON.stringify({ all: [{ field: "shortfall_cents", op: "<=", value: 200_000 }] }));
  const proposal = { ...creditMemo(), policy_refs: ["pol_short"] };
  const parked = proposeEntry(db, proposal, { ...agent, features: { shortfall_cents: 120_000 } }, deps);
  if (parked.status !== "pending_approval") throw new Error(`expected pending_approval, got ${parked.status}`);
  const done = approveDecision(db, parked.decision_id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps);
  if (done.status !== "posted") throw new Error(`expected posted, got ${done.status}`);
  return parked.decision_id;
}

export interface DecisionSpec {
  id: string;
  amount_cents: number;
  party_id?: string;
  entry_date?: string;
  actor?: string;
  autonomy_level?: "auto" | "review" | "shadow";
  tier?: number | null;
  kind?: ProposalKind;
}

/** A bare database with one open period and one intent, for control tests that need no kernel. */
export function bareDb(): Db {
  const db = openDb();
  db.exec(`
    INSERT INTO period (id, status) VALUES ('2026-07','open');
    INSERT INTO intent (id, function, question, owner, status, created_at)
      VALUES ('int_c','audit','fixture','audit','open','2026-07-01T00:00:00Z');
  `);
  return db;
}

/** A posted decision written straight to the row, for sampling and control fixtures. No kernel involved. */
export function insertPostedDecision(db: Db, spec: DecisionSpec): string {
  const entryDate = spec.entry_date ?? "2026-07-15";
  const partyId = spec.party_id ?? "party_1";
  const proposal = {
    intent_id: "int_c", function: "ar", kind: spec.kind ?? "credit_memo", party_id: partyId, entry_date: entryDate,
    applications: [], policy_refs: [], fact_refs: [], judgment: [], evidence: [],
    entries: [
      { account: ACCOUNTS.deferred_revenue, debit_cents: spec.amount_cents, credit_cents: 0, memo: "fixture" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: spec.amount_cents, memo: "fixture" },
    ],
  };
  db.prepare(
    `INSERT INTO decision (id, intent_id, function, mode, kind, proposal_json, actor, autonomy_level, tier, route, posted_at, created_at)
     VALUES (?, 'int_c', 'ar', 'live', ?, ?, ?, ?, ?, 'AUTO', ?, ?)`,
  ).run(spec.id, proposal.kind, JSON.stringify(proposal), spec.actor ?? "agent:ar", spec.autonomy_level ?? "review",
    spec.tier ?? 0, "2026-07-16T12:00:00Z", "2026-07-15T12:00:00Z");
  return spec.id;
}
