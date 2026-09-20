import { existsSync } from "node:fs";
import type { Investigator } from "../agents/investigator.js";
import { parseArgs, flagString } from "../cli/flags.js";
import { closeOnce, ensureChecklist, getChecklist } from "../close/index.js";
import { liveFromArgv, type LiveSource } from "../connectors/index.js";
import { driftC1Once } from "../drift/monitor.js";
import { arRippleOnce } from "../engines/arRipple.js";
import { periodOf, worldToday } from "../engines/asOf.js";
import { ensureBaseline, forecastOnce } from "../engines/forecast/index.js";
import { deferredTieOut, ensureSchedules, recogniseMonth, revenueOnce } from "../engines/revenue/index.js";
import { dbPath, openWorldDb, type Db } from "../ledger/db.js";
import { approveFact } from "../memory/facts.js";
import { mirrorOnce, type QboLike } from "../mirror/index.js";
import { APP_CONFIG } from "../packs/index.js";
import { approveDecision } from "../runtime/approve.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { WORLD_PATH } from "../seed/paths.js";
import { runSkeleton } from "../skeleton/run.js";
import { scriptedInitech } from "./scripted.js";

export interface SpineOptions {
  stores_dir?: string;
  live?: ReadonlySet<LiveSource>;
  /** Model tiers. Empty means the scripted stand-in is NOT used either: judgment waits on a person. */
  investigators?: Investigator[];
  /** World person id who plays the human: approves parked entries and fact candidates. Absent: nothing is approved. */
  approve_as?: string;
  /** Propose the period's revenue recognition after the ripple (a month-end step). */
  recognise?: boolean;
  /**
   * Who approves the recognition entries; defaults to approve_as. Measured: the controller's $10,000 limit does not
   * cover Initech's $10,800, and an over-limit approval is a terminal BLOCK, so this is usually the CFO.
   */
  recognise_as?: string;
  qbo?: { client?: QboLike; dry_run: boolean };
  clock?: Clock;
}

export interface RippleRow { function: string; kind: string; ref: string; summary: string; before_cents: number | null; after_cents: number | null; delta_cents: number | null }

export interface SpineReport {
  period: string;
  cases: number;
  approved_decisions: string[];
  activated_facts: string[];
  engine_passes: number;
  /** Ripple rows per intent that has any, keyed by intent id. */
  ripples: Record<string, { question: string; rows: RippleRow[] }>;
  pending_approvals: { decision_id: string; kind: string; party_id: string; intent_id: string }[];
  checklist: { name: string; status: string; reason: string | null }[];
  ar_tied: boolean;
  deferred_tied: boolean | null;
}

/**
 * Phase 2 spine, one pass, no long-running process: the walking skeleton (sources → drift → router → kernel →
 * ledger), then every downstream function reacts through the bus until nothing moves: revenue revises the
 * schedule, the forecast is rebuilt, drift re-compares CRM with the schedule, close re-evaluates its checklist and
 * the mirror writes to QuickBooks. Each stage is idempotent, so running this again continues where a person's
 * approval left off; nothing here posts to the ledger except through propose_entry and approveDecision.
 */
export async function runSpine(db: Db, opts: SpineOptions = {}): Promise<SpineReport> {
  const clock = opts.clock ?? systemClock;
  ensureSchedules(db, clock);
  const cases = await runSkeleton(db, { stores_dir: opts.stores_dir, live: opts.live, investigators: opts.investigators ?? [] });
  const period = periodOf(worldToday(db));
  ensureChecklist(db, period);
  ensureBaseline(db, undefined, clock);

  let passes = await settle(db, opts, clock);
  const approved = opts.approve_as ? approveParked(db, opts.approve_as, clock, ["credit_memo"]) : [];
  passes += await settle(db, opts, clock);
  // The concession is booked, so CRM and the schedule now disagree in the open. Only then is the fact approved,
  // which is what turns that difference from an open question into an explained one.
  const facts = opts.approve_as ? approveFactsBehind(db, approved, opts.approve_as, clock) : [];
  passes += await settle(db, opts, clock);

  if (opts.recognise) {
    recogniseMonth(db, period, { clock });
    const revApprover = opts.recognise_as ?? opts.approve_as;
    if (revApprover) approved.push(...approveParked(db, revApprover, clock, ["rev_recognition"]));
    passes += await settle(db, opts, clock);
  }
  return report(db, period, cases.length, approved, facts, passes, opts.recognise === true);
}

/** Let every subscriber drain the bus until a full round does nothing. Bounded: a loop here would be a bug. */
async function settle(db: Db, opts: SpineOptions, clock: Clock): Promise<number> {
  for (let pass = 1; pass <= 8; pass += 1) {
    let moved = await arRippleOnce(db, clock);
    moved += (await revenueOnce(db, clock)).length;
    moved += (await forecastOnce(db, clock)).length;
    moved += (await driftC1Once(db, clock)).filter((f) => f.changed).length;
    moved += (await closeOnce(db, clock)).transitions.length;
    moved += (await mirrorOnce(db, opts.qbo ?? { dry_run: true }, clock)).steps.filter((s) => s.fresh).length;
    if (moved === 0) return pass;
  }
  throw new Error("spine did not settle in 8 passes: a subscriber keeps producing work");
}

function approveParked(db: Db, approver: string, clock: Clock, kinds: string[]): string[] {
  const parked = db.prepare(
    `SELECT d.id, d.kind FROM decision d
     WHERE d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)
     ORDER BY d.created_at, d.rowid`,
  ).all() as { id: string; kind: string }[];
  const limit = (db.prepare("SELECT limit_cents FROM approver WHERE id = ?").get(approver) as { limit_cents: number } | undefined)?.limit_cents ?? 0;
  const done: string[] = [];
  for (const d of parked.filter((p) => kinds.includes(p.kind))) {
    // An approval above the approver's limit is a terminal BLOCK in the kernel. Leave those parked for someone senior.
    if (debitTotal(db, d.id) > limit) continue;
    if (d.kind === "rev_recognition" && !matchesActiveSchedule(db, d.id)) continue;
    const r = approveDecision(db, d.id, { approver_id: approver, approver_kind: "human", outcome: "approved" }, { clock, config: APP_CONFIG });
    if (r.status === "posted") done.push(d.id);
  }
  return done;
}

/**
 * A recognition parked before its schedule was revised carries the old amount. Approving it would book revenue
 * the schedule no longer supports (review finding: $12,000 posted against a $10,800 line), so it stays parked.
 */
function matchesActiveSchedule(db: Db, decisionId: string): boolean {
  const row = db.prepare(
    `SELECT r.amount_cents AS parked, l.amount_cents AS scheduled
     FROM rev_recognition r
     JOIN rev_schedule s ON s.contract_id = r.contract_id AND s.status = 'active'
     JOIN rev_schedule_line l ON l.schedule_id = s.id AND l.period = r.period
     WHERE r.decision_id = ?`,
  ).get(decisionId) as { parked: number; scheduled: number } | undefined;
  return row !== undefined && row.parked === row.scheduled && debitTotal(db, decisionId) === row.scheduled;
}

function debitTotal(db: Db, decisionId: string): number {
  const row = db.prepare("SELECT proposal_json FROM decision WHERE id = ?").get(decisionId) as { proposal_json: string | null };
  const entries = (JSON.parse(row.proposal_json ?? "{}") as { entries?: { debit_cents: number }[] }).entries ?? [];
  return entries.reduce((n, e) => n + e.debit_cents, 0);
}

/**
 * A person who approved a credit memo has read the evidence behind it. Only a candidate fact for the same party,
 * resting on a source that memo quoted, is approved with it; every other candidate waits for its own review.
 */
function approveFactsBehind(db: Db, approvedDecisions: readonly string[], approver: string, clock: Clock): string[] {
  const active: string[] = [];
  for (const decisionId of approvedDecisions) {
    const row = db.prepare("SELECT proposal_json FROM decision WHERE id = ? AND kind = 'credit_memo'").get(decisionId) as { proposal_json: string } | undefined;
    if (!row) continue;
    const memo = JSON.parse(row.proposal_json) as { party_id: string; evidence: { trace_id: string }[] };
    const cited = new Set(memo.evidence.map((e) => e.trace_id));
    const candidates = db.prepare("SELECT id, source_trace_ids_json FROM fact WHERE status = 'candidate' AND party_id = ? ORDER BY learned_at").all(memo.party_id) as { id: string; source_trace_ids_json: string }[];
    for (const f of candidates) {
      const sources = JSON.parse(f.source_trace_ids_json) as string[];
      if (!sources.some((t) => cited.has(t))) continue;
      if (approveFact(db, clock, f.id, approver).status === "active") active.push(f.id);
    }
  }
  return active;
}

function report(db: Db, period: string, cases: number, approved: string[], facts: string[], passes: number, recognised: boolean): SpineReport {
  const ripples: SpineReport["ripples"] = {};
  const rows = db.prepare("SELECT r.intent_id, i.question, r.function, r.kind, r.ref, r.summary, r.before_cents, r.after_cents, r.delta_cents FROM ripple r JOIN intent i ON i.id = r.intent_id ORDER BY r.id")
    .all() as Array<RippleRow & { intent_id: string; question: string }>;
  for (const { intent_id, question, ...row } of rows) (ripples[intent_id] ??= { question, rows: [] }).rows.push(row);
  const pending = db.prepare(
    `SELECT d.id AS decision_id, d.kind, d.intent_id, json_extract(d.proposal_json, '$.party_id') AS party_id FROM decision d
     WHERE d.mode = 'live' AND d.route = 'PROPOSE' AND d.posted_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)`,
  ).all() as SpineReport["pending_approvals"];
  const control = readControlTotals(db);
  return {
    period, cases, approved_decisions: approved, activated_facts: facts, engine_passes: passes, ripples, pending_approvals: pending,
    checklist: getChecklist(db, period).items.map((i) => ({ name: i.name, status: i.status, reason: i.blocked_reason })),
    ar_tied: control.ar_gl_cents === control.ar_subledger_cents,
    deferred_tied: recognised ? deferredTieOut(db, period).total.tied : null,
  };
}

const usd = (cents: number | null): string => cents === null ? "" : `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function print(r: SpineReport): void {
  const out = (s: string): void => { process.stdout.write(`${s}\n`); };
  out(`\nperiod ${r.period} · ${r.cases} cases this pass · approved ${r.approved_decisions.length} · facts activated ${r.activated_facts.length} · engine passes ${r.engine_passes}`);
  for (const [id, ripple] of Object.entries(r.ripples)) {
    out(`\nRIPPLE ${id}: ${ripple.question}`);
    for (const row of ripple.rows) out(`  ${row.function.padEnd(9)} ${row.kind.padEnd(24)} ${usd(row.delta_cents).padStart(11)}  ${row.summary}`);
  }
  out(`\nCLOSE ${r.period}`);
  for (const item of r.checklist) out(`  [${item.status === "done" ? "x" : " "}] ${item.status.padEnd(11)} ${item.name}${item.reason ? `: ${item.reason}` : ""}`);
  if (r.pending_approvals.length > 0) {
    out(`\nWAITING FOR A PERSON (${r.pending_approvals.length}): pnpm inbox ${dbPath()} approve <decision_id> --as U_CTRL, then pnpm spine again`);
    for (const p of r.pending_approvals) out(`  ${p.decision_id}  ${p.kind.padEnd(16)} ${p.party_id}`);
  }
  out(`\nAR ${r.ar_tied ? "tied" : "NOT TIED"}${r.deferred_tied === null ? "" : ` · deferred revenue ${r.deferred_tied ? "tied to schedule" : "NOT TIED to schedule"}`}`);
}

/**
 *   pnpm spine [--approve-as U_CTRL] [--recognise [--recognise-as U_CFO]] [--qbo-live] [--live=gmail,slack]
 * Without a model key the Initech investigation is done by a labelled stand-in (src/spine/scripted.ts).
 */
async function main(): Promise<number> {
  const db = openWorldDb(dbPath());
  const seeded = (db.prepare("SELECT COUNT(*) AS n FROM seed_manifest WHERE system = 'local'").get() as { n: number }).n;
  if (seeded === 0 || !existsSync(WORLD_PATH)) {
    process.stderr.write("database is not seeded. Run: pnpm seed --target=local --reset\n");
    return 1;
  }
  const args = parseArgs(process.argv.slice(2), ["recognise", "qbo-live"]);
  let investigators: Investigator[] = [scriptedInitech];
  if (process.env.ANTHROPIC_API_KEY) investigators = (await import("../agents/sdk.js")).defaultTiers();
  else process.stdout.write("ANTHROPIC_API_KEY not set: the model tier is replaced by a scripted stand-in that knows only the Initech case.\n");
  let qbo: SpineOptions["qbo"] = { dry_run: true };
  if (args.flags["qbo-live"] === true) qbo = { client: (await import("../mirror/index.js")).liveQboClient(), dry_run: false };
  print(await runSpine(db, { investigators, live: liveFromArgv(process.argv), approve_as: flagString(args, "approve-as"), recognise: args.flags.recognise === true, recognise_as: flagString(args, "recognise-as"), qbo }));
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("src/spine/run.ts")) {
  main().then((code) => process.exit(code), (err: unknown) => { console.error(err); process.exit(1); });
}
