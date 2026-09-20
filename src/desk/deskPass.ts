import { Proposal } from "../contract/types.js";
import { summarise } from "../learn/compare.js";
import { factCandidates } from "../memory/facts.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";

/** Whatever carries a question or an approval request to a person: Slack in the demo, a recorder in tests. */
export interface Poster {
  postEscalation(escalationId: string): Promise<string | undefined>;
  postApproval(decisionId: string, approverSlackUser: string, controllerNote?: string): Promise<string | undefined>;
  /** Something an agent proposes to remember. Optional, so a poster that cannot show it simply leaves it in the inbox. */
  postFact?(factId: string, approverSlackUser: string): Promise<string | undefined>;
  /** A bill uploaded on the pipeline page, waiting for accept or reject. Optional for the same reason. */
  postBill?(billId: string, approverSlackUser: string): Promise<string | undefined>;
}

export interface DeskReport {
  facts_posted: { fact_id: string; approver_id: string }[];
  escalations_posted: string[];
  approvals_posted: { decision_id: string; approver_id: string }[];
  bills_posted: { bill_id: string; approver_id: string }[];
  /** Parked entries nobody on the approval matrix can be reached for. They stay in the terminal inbox. */
  unroutable: { decision_id: string; reason: string }[];
}

const REQUEST_STEP = "desk:approval_request";

/**
 * One pass of the human desk: every open question goes to the person it was addressed to, once; every parked entry
 * goes to one approver with the authority to sign it, once. Nothing is decided here; answers and approvals come
 * back through recordHumanAnswer and approveDecision, where identity, authority and the kernel's post gate apply.
 */
export async function deskPass(db: Db, poster: Poster, clock: Clock, alreadyAsked: Set<string> = new Set()): Promise<DeskReport> {
  const report: DeskReport = { facts_posted: [], escalations_posted: [], approvals_posted: [], bills_posted: [], unroutable: [] };
  await postFactCandidates(db, poster, alreadyAsked, report);
  const questions = db.prepare("SELECT id FROM escalation WHERE answered_at IS NULL AND slack_ts IS NULL ORDER BY asked_at").all() as { id: string }[];
  for (const q of questions) {
    if (await poster.postEscalation(q.id)) report.escalations_posted.push(q.id);
  }
  for (const parked of parkedAndUnasked(db)) {
    const approver = chooseApprover(db, parked);
    if (!approver) {
      report.unroutable.push({ decision_id: parked.id, reason: `no reachable approver with authority over ${parked.amount_cents} cents` });
      continue;
    }
    const ts = await poster.postApproval(parked.id, approver.slack_user, controllerNote(db, parked.id));
    if (!ts) continue;
    recordRequest(db, clock, parked.id, approver.id, ts);
    report.approvals_posted.push({ decision_id: parked.id, approver_id: approver.id });
  }
  if (poster.postBill) {
    const bills = db.prepare("SELECT id, total_cents FROM bill WHERE status = 'open' AND id LIKE 'BILL-UP-%' AND NOT EXISTS (SELECT 1 FROM bill_review r WHERE r.bill_id = bill.id) ORDER BY bill_date").all() as { id: string; total_cents: number }[];
    for (const b of bills) {
      if (alreadyAsked.has(`bill:${b.id}`)) continue;
      const approver = chooseApprover(db, { id: b.id, actor: "upload", amount_cents: b.total_cents, answered_by: null });
      if (!approver) { report.unroutable.push({ decision_id: b.id, reason: "no reachable approver for an uploaded bill" }); continue; }
      if (!(await poster.postBill(b.id, approver.slack_user))) continue;
      alreadyAsked.add(`bill:${b.id}`);
      report.bills_posted.push({ bill_id: b.id, approver_id: approver.id });
    }
  }
  return report;
}

/**
 * What an agent wants to remember goes to a person once. A fact has no row to mark as asked, so the desk keeps the
 * ids it has posted for as long as it runs; after a restart a still-open candidate is asked about again.
 */
async function postFactCandidates(db: Db, poster: Poster, alreadyAsked: Set<string>, report: DeskReport): Promise<void> {
  if (!poster.postFact) return;
  for (const f of factCandidates(db)) {
    if (alreadyAsked.has(f.id)) continue;
    const approver = chooseApprover(db, { id: f.id, actor: f.stated_by, amount_cents: factExposureCents(db, f), answered_by: null });
    if (!approver) { report.unroutable.push({ decision_id: f.id, reason: "no reachable approver for a proposed fact" }); continue; }
    if (!(await poster.postFact(f.id, approver.slack_user))) continue;
    alreadyAsked.add(f.id);
    report.facts_posted.push({ fact_id: f.id, approver_id: approver.id });
  }
}

/**
 * What approving this fact would let code do with nobody watching. A fact that explains an amount is sized by it; one
 * that says who pays for whom lets that payer's cash through, so it is sized by what the customer owes. The approver's
 * limit becomes the fact's ceiling, so asking someone whose limit is too small would produce a fact that never applies.
 */
function factExposureCents(db: Db, f: { party_id: string; explained_amount_cents: number | null }): number {
  const owed = db.prepare("SELECT COALESCE(SUM(open_cents), 0) AS n FROM invoice WHERE party_id = ? AND open_cents > 0").get(f.party_id) as { n: number };
  return Math.max(f.explained_amount_cents ?? 0, f.explained_amount_cents === null ? owed.n : 0);
}

interface Parked { id: string; actor: string; amount_cents: number; answered_by: string | null }

function parkedAndUnasked(db: Db): Parked[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.actor, d.proposal_json, d.intent_id FROM decision d
       WHERE d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL AND d.proposal_json IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.approver_kind = 'human')
         AND NOT EXISTS (SELECT 1 FROM decision_step s WHERE s.decision_id = d.id AND s.tool = ?)
       ORDER BY d.rowid`,
    )
    .all(REQUEST_STEP) as { id: string; actor: string; proposal_json: string; intent_id: string }[];
  return rows.flatMap((row) => {
    const proposal = Proposal.safeParse(safeJson(row.proposal_json));
    if (!proposal.success) return [];
    const booked = summarise(proposal.data);
    const lines = proposal.data.entries.reduce((n, l) => Math.max(n, l.debit_cents, l.credit_cents), 0);
    return [{ id: row.id, actor: row.actor, amount_cents: Math.max(booked.amount_cents, lines), answered_by: whoAnswered(db, row.intent_id) }];
  });
}

/** The person who asked for a credit does not also sign it, if anyone else can. */
function whoAnswered(db: Db, intentId: string): string | null {
  const row = db
    .prepare(
      `SELECT json_extract(e.answer_json, '$.answered_by') AS who FROM escalation e JOIN decision d ON d.id = e.decision_id
       WHERE d.intent_id = ? AND e.answered_at IS NOT NULL ORDER BY e.answered_at DESC LIMIT 1`,
    )
    .get(intentId) as { who: string | null } | undefined;
  return row?.who ?? null;
}

/** The least senior person whose limit covers the entry: approvals should not all land on the controller. */
function chooseApprover(db: Db, parked: Parked): { id: string; slack_user: string } | undefined {
  const candidates = db
    .prepare(
      `SELECT id, slack_user FROM approver
       WHERE role != 'controller_agent' AND slack_user IS NOT NULL AND slack_user != '' AND limit_cents >= ? AND id != ?
       ORDER BY limit_cents, id`,
    )
    .all(parked.amount_cents, parked.actor) as { id: string; slack_user: string }[];
  return candidates.find((c) => c.id !== parked.answered_by) ?? candidates[0];
}

function controllerNote(db: Db, decisionId: string): string | undefined {
  const row = db
    .prepare("SELECT output_json FROM decision_step WHERE decision_id = ? AND tool LIKE 'controller:%' ORDER BY step_no DESC LIMIT 1")
    .get(decisionId) as { output_json: string | null } | undefined;
  const verdict = row?.output_json ? (safeJson(row.output_json) as { agrees?: boolean; note?: string } | null) : null;
  return verdict?.note ? `${verdict.agrees ? "Controller agrees" : "Controller disagrees"}: ${verdict.note}` : undefined;
}

/** On the decision's own timeline, so the console and the auditor see who was asked and when. */
function recordRequest(db: Db, clock: Clock, decisionId: string, approverId: string, ts: string): void {
  const next = db.prepare("SELECT COALESCE(MAX(step_no), 0) + 1 AS n FROM decision_step WHERE decision_id = ?").get(decisionId) as { n: number };
  db.prepare("INSERT INTO decision_step (decision_id, step_no, ts, kind, tool, output_json) VALUES (?, ?, ?, 'human_request', ?, ?)")
    .run(decisionId, next.n, clock.now(), REQUEST_STEP, JSON.stringify({ approver_id: approverId, slack_ts: ts }));
}
