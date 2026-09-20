import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";

/**
 * What every agent did this month, for someone who is not going to open a case: one row per kind of worker (code, the
 * document reader, each model tier, the controller agent, people) with what it decided, what the kernel refused, what
 * it cost, and a feed of the notable moments in order. Read-only.
 */
export interface WorkerRow {
  worker: string;
  lane: "code" | "reader" | "model" | "controller" | "person";
  turns: number;
  posted_alone: number;
  parked: number;
  asked: number;
  kernel_refusals: number;
  tool_calls: number;
  model_calls: number;
  cost_micros: number;
  busy_ms: number;
}

export interface FeedItem {
  at: string;
  intent_id: string;
  party: string | null;
  worker: string;
  what: string;
  amount_cents: number | null;
  tone: "ok" | "refused" | "waiting" | "person";
}

export interface FleetView { workers: WorkerRow[]; feed: FeedItem[]; totals: { cost_micros: number; model_calls: number; tool_calls: number; kernel_refusals: number } }

interface DecisionRow {
  id: string; intent_id: string; actor: string; tier: number | null; kind: string | null; route: string | null; model_calls: number | null;
  cost_micros: number | null; latency_ms: number | null; posted_at: string | null; created_at: string; proposal_json: string | null; party: string | null;
}

const MODEL_NAMES: Record<number, string> = { 1: "Haiku · tier 1", 2: "Sonnet · tier 2", 3: "Opus · tier 3" };

export function buildFleet(db: Db, feedLimit = 60): FleetView {
  const decisions = db
    .prepare(
      `SELECT d.id, d.intent_id, d.actor, d.tier, d.kind, d.route, d.model_calls, d.cost_micros, d.latency_ms, d.posted_at, d.created_at, d.proposal_json,
              json_extract(i.case_json, '$.party_id') AS party
       FROM decision d JOIN intent i ON i.id = d.intent_id WHERE d.mode = 'live' AND d.actor != 'seed' ORDER BY d.rowid`,
    )
    .all() as DecisionRow[];
  const workers = new Map<string, WorkerRow>();
  const feed: FeedItem[] = [];
  for (const d of decisions) {
    const row = workerRow(workers, d);
    const steps = stepCounts(db, d.id);
    const approved = humanApproval(db, d.id);
    row.turns += 1;
    row.tool_calls += steps.tools;
    row.kernel_refusals += steps.refusals;
    row.model_calls += d.model_calls ?? 0;
    row.cost_micros += d.cost_micros ?? 0;
    row.busy_ms += d.latency_ms ?? 0;
    if (d.posted_at && !approved) row.posted_alone += 1;
    if (d.route === "PROPOSE" && !d.posted_at) row.parked += 1;
    if (d.route === "ESCALATE") row.asked += 1;
    feed.push(...feedOf(d, row.worker, steps.refusals, approved));
  }
  feed.push(...peopleFeed(db), ...answersFeed(db));
  addPeople(db, workers);
  feed.sort((a, b) => b.at.localeCompare(a.at));
  const rows = [...workers.values()];
  return { workers: rows, feed: feed.slice(0, feedLimit), totals: {
    cost_micros: sum(rows, "cost_micros"), model_calls: sum(rows, "model_calls"), tool_calls: sum(rows, "tool_calls"), kernel_refusals: sum(rows, "kernel_refusals") } };
}

function workerRow(workers: Map<string, WorkerRow>, d: DecisionRow): WorkerRow {
  const lane: WorkerRow["lane"] = d.actor.startsWith("reader:") ? "reader" : d.actor.startsWith("controller") ? "controller" : (d.tier ?? 0) >= 1 ? "model" : "code";
  const worker = lane === "model" ? MODEL_NAMES[d.tier ?? 0] ?? `Model · tier ${d.tier}` : lane === "reader" ? `Document reader (${d.actor.slice(7)})` : lane === "controller" ? "Controller agent" : "Code tier";
  const existing = workers.get(worker);
  if (existing) return existing;
  const fresh: WorkerRow = { worker, lane, turns: 0, posted_alone: 0, parked: 0, asked: 0, kernel_refusals: 0, tool_calls: 0, model_calls: 0, cost_micros: 0, busy_ms: 0 };
  workers.set(worker, fresh);
  return fresh;
}

function stepCounts(db: Db, decisionId: string): { tools: number; refusals: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'tool_call' AND tool NOT IN ('propose_entry','escalate') THEN 1 ELSE 0 END), 0) AS tools,
              COALESCE(SUM(CASE WHEN tool = 'propose_entry' AND json_extract(output_json, '$.status') IN ('rejected','blocked') THEN 1 ELSE 0 END), 0) AS refusals
       FROM decision_step WHERE decision_id = ?`,
    )
    .get(decisionId) as { tools: number; refusals: number };
  return row;
}

function humanApproval(db: Db, decisionId: string): boolean {
  return db.prepare("SELECT 1 FROM approval WHERE decision_id = ? AND approver_kind = 'human' AND outcome = 'approved'").get(decisionId) !== undefined;
}

function feedOf(d: DecisionRow, worker: string, refusals: number, approved: boolean): FeedItem[] {
  const amount = amountOf(d.proposal_json);
  const base = { intent_id: d.intent_id, party: d.party, worker, amount_cents: amount };
  const items: FeedItem[] = [];
  if (refusals > 0) items.push({ ...base, at: d.created_at, what: `the kernel refused ${refusals} draft entr${refusals === 1 ? "y" : "ies"}`, tone: "refused" });
  if (d.posted_at && !approved) items.push({ ...base, at: d.posted_at, what: `posted ${words(d.kind)} with no person involved`, tone: "ok" });
  if (d.route === "PROPOSE" && !d.posted_at) items.push({ ...base, at: d.created_at, what: `prepared ${words(d.kind)} and parked it for a person`, tone: "waiting" });
  if (d.route === "ESCALATE") items.push({ ...base, at: d.created_at, what: "asked a person one question", tone: "waiting" });
  return items;
}

function peopleFeed(db: Db): FeedItem[] {
  const rows = db
    .prepare(
      `SELECT a.approved_at AS at, a.approver_id, a.outcome, d.intent_id, d.kind, d.proposal_json, json_extract(i.case_json, '$.party_id') AS party
       FROM approval a JOIN decision d ON d.id = a.decision_id JOIN intent i ON i.id = d.intent_id WHERE a.approver_kind = 'human' AND d.mode = 'live'`,
    )
    .all() as { at: string; approver_id: string; outcome: string; intent_id: string; kind: string | null; proposal_json: string | null; party: string | null }[];
  return rows.map((r) => ({ at: r.at, intent_id: r.intent_id, party: r.party, worker: r.approver_id, what: `${r.outcome === "approved" ? "approved" : "declined"} ${words(r.kind)}`,
    amount_cents: amountOf(r.proposal_json), tone: r.outcome === "approved" ? "person" as const : "refused" as const }));
}

function answersFeed(db: Db): FeedItem[] {
  const rows = db
    .prepare(
      `SELECT e.answered_at AS at, json_extract(e.answer_json, '$.answered_by') AS who, json_extract(e.answer_json, '$.uses') AS uses, d.intent_id,
              json_extract(i.case_json, '$.party_id') AS party
       FROM escalation e JOIN decision d ON d.id = e.decision_id JOIN intent i ON i.id = d.intent_id WHERE e.answered_at IS NOT NULL`,
    )
    .all() as { at: string; who: string | null; uses: string | null; intent_id: string; party: string | null }[];
  return rows.map((r) => ({ at: r.at, intent_id: r.intent_id, party: r.party, worker: r.who ?? "a person", what: `answered the question${r.uses === "standing" ? ", as a standing answer" : ""}`, amount_cents: null, tone: "person" as const }));
}

function addPeople(db: Db, workers: Map<string, WorkerRow>): void {
  const row = db.prepare("SELECT COUNT(*) AS n FROM approval a JOIN decision d ON d.id = a.decision_id WHERE a.approver_kind = 'human' AND d.mode = 'live'").get() as { n: number };
  const answers = db.prepare("SELECT COUNT(*) AS n FROM escalation WHERE answered_at IS NOT NULL").get() as { n: number };
  if (row.n + answers.n === 0) return;
  workers.set("People", { worker: "People", lane: "person", turns: row.n + answers.n, posted_alone: 0, parked: 0, asked: 0, kernel_refusals: 0, tool_calls: 0, model_calls: 0, cost_micros: 0, busy_ms: 0 });
}

function amountOf(proposalJson: string | null): number | null {
  const apps = (safeJson(proposalJson ?? "null") as { applications?: { amount_cents?: number }[] } | null)?.applications;
  return Array.isArray(apps) && apps.length > 0 ? apps.reduce((n, a) => n + (a.amount_cents ?? 0), 0) : null;
}

const words = (kind: string | null): string => (kind ? kind.replaceAll("_", " ") : "an entry");
const sum = (rows: WorkerRow[], key: "cost_micros" | "model_calls" | "tool_calls" | "kernel_refusals"): number => rows.reduce((n, r) => n + r[key], 0);
