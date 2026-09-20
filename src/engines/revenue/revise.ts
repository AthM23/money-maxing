import { emit, poll, type BusEvent } from "../../bus/bus.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Db } from "../../ledger/db.js";
import { systemClock, type Clock } from "../../runtime/config.js";
import { approveDecision } from "../../runtime/approve.js";
import { newId } from "../../runtime/ids.js";
import { periodOf } from "../asOf.js";
import { recordRipple } from "../ripple.js";
import { reduceOne, revisePct, sumLines, usd, type ScheduleLine } from "./schedule.js";
import { activeSchedule, ensureSchedules, getContract, insertSchedule, recognisedPeriods, recognisedStatus, scheduleVersions, type ContractRow, type RevSchedule } from "./store.js";

export type Treatment = "prospective" | "memo_only" | "contra_revenue_no_schedule_change";

export interface ReviseResult {
  event_id: number;
  decision_id: string;
  /** revised: a new version exists. unchanged: a modification is on record and the schedule was left alone. */
  status: "revised" | "unchanged" | "already_done" | "skipped";
  treatment?: Treatment;
  modification_id?: string;
  contract_id?: string;
  from_version?: number | null;
  to_version?: number | null;
  delta_total_cents?: number;
  reason?: string;
}

interface Memo {
  decision_id: string; entry_id: string; intent_id: string; party_id: string; contract: ContractRow;
  memo_cents: number; memo_account: string; effective_period: string;
  pct_off: number | undefined; until: string | undefined; fact_id: string | null;
}

interface Plan { treatment: Treatment; lines: ScheduleLine[] | null; bps: number | null; until: string | null; notes: string[] }

const REVENUE_ACCOUNTS: ReadonlySet<string> = new Set([ACCOUNTS.subscription_revenue, ACCOUNTS.concessions]);

/** One pass of the revenue engine's seat on the bus. At-least-once delivery: `reviseForCreditMemo` is idempotent. */
export async function revenueOnce(db: Db, clock: Clock = systemClock): Promise<ReviseResult[]> {
  const results: ReviseResult[] = [];
  await poll(db, "revenue", ["ar.credit_memo.posted"], (e) => { results.push(reviseForCreditMemo(db, e, clock)); });
  return results;
}

/** Everything one credit memo does to a schedule, in ONE transaction: the modification, the version, the event, the ripple. */
export function reviseForCreditMemo(db: Db, event: BusEvent, clock: Clock = systemClock): ReviseResult {
  const decisionId = String(event.payload.decision_id ?? "");
  return db.transaction((): ReviseResult => {
    const base = { event_id: event.id, decision_id: decisionId };
    const done = db.prepare("SELECT id, contract_id, treatment, from_version, to_version, delta_total_cents FROM contract_modification WHERE cause_decision_id = ?")
      .get(decisionId) as { id: string; contract_id: string; treatment: Treatment; from_version: number | null; to_version: number | null; delta_total_cents: number } | undefined;
    if (done) return { ...base, status: "already_done", modification_id: done.id, contract_id: done.contract_id, treatment: done.treatment, from_version: done.from_version, to_version: done.to_version, delta_total_cents: done.delta_total_cents };
    const memo = loadMemo(db, event, decisionId);
    if (typeof memo === "string") return { ...base, status: "skipped", reason: memo };
    ensureSchedules(db, clock);
    const old = activeSchedule(db, memo.contract.id);
    if (!old) return { ...base, status: "skipped", reason: `contract ${memo.contract.id} has no active schedule` };
    const v1 = scheduleVersions(db, memo.contract.id)[0] ?? old;
    return apply(db, clock, event, memo, old, planRevision(memo, old, recognisedPeriods(db, memo.contract.id), v1.lines));
  })();
}

/** Read the memo from the ledger, not from the event: the posted lines are the truth about what moved. */
function loadMemo(db: Db, event: BusEvent, decisionId: string): Memo | string {
  const decision = db.prepare("SELECT intent_id, proposal_json FROM decision WHERE id = ?").get(decisionId) as { intent_id: string; proposal_json: string | null } | undefined;
  if (!decision?.proposal_json) return `decision ${decisionId} not found or carries no proposal`;
  const proposal = JSON.parse(decision.proposal_json) as { party_id: string; applications?: { doc_id: string }[]; terms_change?: { pct_off?: number; until?: string }; fact_refs?: string[] };
  const entry = db.prepare("SELECT id FROM gl_entry WHERE source_decision_id = ?").get(decisionId) as { id: string } | undefined;
  if (!entry) return `decision ${decisionId} posted no ledger entry`;
  const lines = db.prepare("SELECT account, debit_cents, credit_cents FROM gl_line WHERE entry_id = ? ORDER BY line_no").all(entry.id) as { account: string; debit_cents: number; credit_cents: number }[];
  const debits = lines.filter((l) => l.debit_cents > 0);
  const debitAccounts = [...new Set(debits.map((l) => l.account))];
  if (debitAccounts.length === 0) return `entry ${entry.id} debits nothing`;
  // One memo, one treatment. A memo split across deferred revenue and a revenue account would need two, so a person sizes it.
  if (debitAccounts.length > 1) return `memo debits ${debitAccounts.join(" and ")}: split memos are not scheduled automatically`;
  const memoAccount = debitAccounts[0]!;
  if (memoAccount !== ACCOUNTS.deferred_revenue && !REVENUE_ACCOUNTS.has(memoAccount)) return `memo debits ${memoAccount}, which is neither deferred revenue nor a revenue account: no revenue effect to schedule`;
  const memoCents = debits.reduce((n, l) => n + l.debit_cents, 0);
  const invoice = singleInvoiceMonth(db, (proposal.applications ?? []).map((a) => a.doc_id));
  if (typeof invoice === "string") return invoice;
  const contract = getContract(db, invoice.contract_id);
  if (!contract) return `contract ${invoice.contract_id} not found`;
  return {
    decision_id: decisionId, entry_id: entry.id, intent_id: event.intent_id ?? decision.intent_id, party_id: proposal.party_id, contract,
    memo_cents: memoCents, memo_account: memoAccount, effective_period: periodOf(invoice.issue_date),
    pct_off: proposal.terms_change?.pct_off, until: proposal.terms_change?.until, fact_id: findFact(db, proposal.fact_refs, proposal.party_id),
  };
}

/** The memo must relate to one contract and one service month, or the revision would land on the wrong line. */
function singleInvoiceMonth(db: Db, docIds: string[]): { contract_id: string; issue_date: string } | string {
  if (docIds.length === 0) return "credit memo is not applied to an invoice under a contract (no application)";
  const found: { contract_id: string; issue_date: string }[] = [];
  for (const id of docIds) {
    const inv = db.prepare("SELECT contract_id, issue_date FROM invoice WHERE id = ?").get(id) as { contract_id: string | null; issue_date: string } | undefined;
    if (!inv?.contract_id) return `credit memo is not applied to an invoice under a contract (${id})`;
    found.push({ contract_id: inv.contract_id, issue_date: inv.issue_date });
  }
  const first = found[0]!;
  const sameMonth = found.every((f) => f.contract_id === first.contract_id && periodOf(f.issue_date) === periodOf(first.issue_date));
  return sameMonth ? first : `credit memo spans several contracts or service months (${docIds.join(", ")}): not scheduled automatically`;
}

function findFact(db: Db, factRefs: string[] | undefined, partyId: string): string | null {
  if (factRefs?.[0]) return factRefs[0];
  const row = db.prepare("SELECT id FROM fact WHERE party_id = ? AND predicate = 'concession_pct' AND status IN ('candidate','approved','active') ORDER BY learned_at DESC, rowid DESC LIMIT 1")
    .get(partyId) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Decide the treatment. Pure. The double-hit guard lives here, ahead of any arithmetic: a memo that debited a revenue
 * account has already cut THAT month's revenue in the ledger, so that month's line never moves as well. Later months
 * were not touched by the memo, so a standing concession still lowers them.
 */
export function planRevision(
  memo: Pick<Memo, "memo_cents" | "memo_account" | "effective_period" | "pct_off" | "until" | "contract">, old: RevSchedule, recognised: ReadonlySet<string>,
  v1Lines: readonly ScheduleLine[] = old.lines,
): Plan {
  const contra = REVENUE_ACCOUNTS.has(memo.memo_account);
  const standing = memo.pct_off !== undefined && memo.pct_off > 0;
  const guardNote = `the memo debited revenue account ${memo.memo_account}, so ${memo.effective_period} revenue is already down ${usd(memo.memo_cents)} in the ledger; cutting that month's schedule line too would cut it twice`;
  if (contra && !standing) return { treatment: "contra_revenue_no_schedule_change", lines: null, bps: null, until: null, notes: [guardNote] };
  const eff = old.lines.find((l) => l.period === memo.effective_period);
  const effOpen = eff !== undefined && !recognised.has(eff.period);
  if (standing) {
    const plan = planProspective(memo, old, recognised, v1Lines, contra ? undefined : effOpen ? eff : undefined);
    if (contra) plan.notes.unshift(guardNote);
    else if (!effOpen) plan.notes.push(`${memo.effective_period} is already recognised or not on the schedule, so only later open months were revised`);
    return plan;
  }
  if (!effOpen || memo.memo_cents > eff.amount_cents) {
    return { treatment: "memo_only", lines: null, bps: null, until: null, notes: [`${memo.effective_period} is ${eff ? "already recognised or smaller than the memo" : "not on the schedule"}; schedule left alone, needs a person`] };
  }
  return { treatment: "memo_only", lines: reduceOne(old.lines, memo.effective_period, memo.memo_cents), bps: null, until: null, notes: [] };
}

/**
 * A standing concession is a fact about the PRICE, so it is applied to the version-1 (list price) line, never to a
 * line an earlier memo already discounted: the same concession arriving again, one memo per short-paid invoice,
 * changes nothing, and a later, deeper one replaces it instead of compounding. `eff` is the invoiced month when the
 * memo took it out of deferred revenue; there the ledger is the truth and the memo amount is what comes off.
 */
function planProspective(
  memo: Pick<Memo, "memo_cents" | "effective_period" | "pct_off" | "until" | "contract">, old: RevSchedule, recognised: ReadonlySet<string>,
  v1Lines: readonly ScheduleLine[], eff: ScheduleLine | undefined,
): Plan {
  const bps = Math.round((memo.pct_off ?? 0) * 100);
  const until = memo.until && memo.until < memo.contract.end_date ? memo.until : memo.contract.end_date;
  const target = new Map(revisePct(v1Lines, memo.effective_period, periodOf(until), bps, recognised).map((l) => [l.period, l.amount_cents]));
  const notes: string[] = [];
  const lines = old.lines.map((l) => {
    if (l.period === memo.effective_period) return { period: l.period, amount_cents: eff ? Math.max(0, l.amount_cents - memo.memo_cents) : l.amount_cents };
    return { period: l.period, amount_cents: Math.min(l.amount_cents, target.get(l.period) ?? l.amount_cents) };
  });
  const effAfter = lines.find((l) => l.period === memo.effective_period)?.amount_cents;
  const effTarget = target.get(memo.effective_period);
  if (eff && effAfter !== undefined && effTarget !== undefined && effAfter !== effTarget) {
    notes.push(`${memo.pct_off}% off list leaves ${usd(effTarget)} for ${memo.effective_period}; the posted memo(s) leave ${usd(effAfter)}, and the ledger is the truth for the month already invoiced`);
  }
  return { treatment: "prospective", lines, bps, until, notes };
}

function apply(db: Db, clock: Clock, event: BusEvent, memo: Memo, old: RevSchedule, plan: Plan): ReviseResult {
  const changed = (plan.lines ?? []).flatMap((l, i) => (l.amount_cents === old.lines[i]!.amount_cents ? [] : [{ period: l.period, before_cents: old.lines[i]!.amount_cents, after_cents: l.amount_cents }]));
  const revised = plan.lines !== null && changed.length > 0;
  const modId = newId("cm");
  const afterTotal = revised ? sumLines(plan.lines!) : old.total_cents;
  const toVersion = revised ? old.version + 1 : null;
  let newScheduleId: string | null = null;
  if (revised) {
    db.prepare("UPDATE rev_schedule SET status = 'superseded' WHERE id = ?").run(old.id);
    newScheduleId = insertSchedule(db, clock, { contract_id: old.contract_id, party_id: old.party_id, version: old.version + 1, modification_id: modId, lines: plan.lines! });
  }
  db.prepare(
    `INSERT INTO contract_modification (id, contract_id, cause_decision_id, cause_intent_id, cause_entry_id, treatment, pct_off_bps, effective_period, until,
       memo_cents, memo_account, delta_total_cents, from_version, to_version, fact_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(modId, old.contract_id, memo.decision_id, memo.intent_id, memo.entry_id, plan.treatment, plan.bps, memo.effective_period, plan.until,
    memo.memo_cents, memo.memo_account, afterTotal - old.total_cents, old.version, toVersion, memo.fact_id, clock.now());

  const effLine = changed.find((c) => c.period === memo.effective_period) ?? changed[0];
  if (revised) {
    emit(db, {
      topic: "rev.schedule.revised", from_function: "revenue", intent_id: memo.intent_id,
      payload: {
        modification_id: modId, contract_id: old.contract_id, party_id: old.party_id, cause_decision_id: memo.decision_id, treatment: plan.treatment,
        from_version: old.version, to_version: toVersion, effective_period: memo.effective_period, until: plan.until,
        before_total_cents: old.total_cents, after_total_cents: afterTotal, delta_total_cents: afterTotal - old.total_cents,
        monthly_delta_cents: effLine ? effLine.after_cents - effLine.before_cents : 0, lines: changed, fact_id: memo.fact_id,
      },
    }, clock);
  }
  if (revised) plan.notes.push(...withdrawStaleRecognitions(db, clock, old.contract_id, changed, toVersion!));
  const trueUp = openTrueUpIfRecognised(db, clock, memo, plan);
  if (trueUp) plan.notes.push(trueUp);
  const before = effLine?.before_cents ?? old.lines.find((l) => l.period === memo.effective_period)?.amount_cents ?? null;
  const after = effLine?.after_cents ?? before;
  recordRipple(db, {
    intent_id: memo.intent_id, function: "revenue", kind: revised ? "rev_schedule_revision" : "rev_schedule_unchanged", ref: newScheduleId ?? modId,
    summary: summarise(old, plan, changed, afterTotal), before_cents: before, after_cents: after, delta_cents: before === null || after === null ? null : after - before,
    event_id: event.id, artifact: { decision_id: memo.decision_id, system: "schedule" },
  }, clock);
  return {
    event_id: event.id, decision_id: memo.decision_id, status: revised ? "revised" : "unchanged", treatment: plan.treatment, modification_id: modId,
    contract_id: old.contract_id, from_version: old.version, to_version: toVersion, delta_total_cents: afterTotal - old.total_cents,
    reason: plan.notes.length > 0 ? plan.notes.join("; ") : undefined,
  };
}

/**
 * A recognition parked for approval BEFORE this revision carries the old amount. Left alone, a person approving it
 * would book revenue the schedule no longer supports and drive deferred revenue negative (review finding). It is
 * declined here, on the record and through the runtime's own approval path, as the engine withdrawing its own
 * proposal; the next recogniseMonth proposes the revised amount. The approval row says 'controller_agent' only
 * because the contract has no third kind: the note names the engine, and the learning layer ignores non-human rows.
 */
function withdrawStaleRecognitions(db: Db, clock: Clock, contractId: string, changed: { period: string; after_cents: number }[], toVersion: number): string[] {
  const notes: string[] = [];
  for (const c of changed) {
    if (recognisedStatus(db, contractId, c.period) !== "pending") continue;
    const row = db.prepare("SELECT amount_cents, decision_id FROM rev_recognition WHERE contract_id = ? AND period = ?").get(contractId, c.period) as { amount_cents: number; decision_id: string };
    if (row.amount_cents === c.after_cents) continue;
    const r = approveDecision(db, row.decision_id, {
      approver_id: "engine:revenue", approver_kind: "controller_agent", outcome: "rejected",
      note: `withdrawn by the revenue engine: parked at ${usd(row.amount_cents)}, schedule v${toVersion} now says ${usd(c.after_cents)} for ${c.period}`,
    }, { clock });
    notes.push(`the recognition of ${usd(row.amount_cents)} parked for ${c.period} was ${r.status === "declined" ? "withdrawn" : `NOT withdrawn (${r.status})`}; re-run recognition for ${usd(c.after_cents)}`);
  }
  return notes;
}

/**
 * The memo arrived after its month's revenue had already posted at the old amount. The schedule can only fix later
 * months; the recognised month is now over-recognised by the memo and deferred revenue is short by the same. That
 * needs an entry a person decides on (reverse and re-recognise, or a contra), so it becomes an intent, never a guess.
 */
function openTrueUpIfRecognised(db: Db, clock: Clock, memo: Memo, plan: Plan): string | undefined {
  if (plan.treatment === "contra_revenue_no_schedule_change" || REVENUE_ACCOUNTS.has(memo.memo_account)) return undefined;
  if (recognisedStatus(db, memo.contract.id, memo.effective_period) !== "posted") return undefined;
  const rec = db.prepare("SELECT amount_cents FROM rev_recognition WHERE contract_id = ? AND period = ?").get(memo.contract.id, memo.effective_period) as { amount_cents: number };
  const id = `int_rev_trueup_${memo.contract.id}_${memo.effective_period}`;
  const question = `${memo.contract.id}: ${memo.effective_period} revenue was recognised at ${usd(rec.amount_cents)} before a ${usd(memo.memo_cents)} credit memo took that amount out of deferred revenue. ` +
    `Book a true-up of ${usd(memo.memo_cents)} (Dr ${ACCOUNTS.subscription_revenue} / Cr ${ACCOUNTS.deferred_revenue})?`;
  db.prepare("INSERT OR IGNORE INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'revenue', ?, 'revenue', 'open', ?)").run(id, question, clock.now());
  recordRipple(db, {
    intent_id: memo.intent_id, function: "revenue", kind: "rev_trueup_needed", ref: `${id}:${memo.decision_id}`, delta_cents: -memo.memo_cents,
    summary: `${memo.effective_period} was already recognised at ${usd(rec.amount_cents)}: true-up of ${usd(memo.memo_cents)} needs a person (${id})`,
  }, clock);
  return `${memo.effective_period} was already recognised; true-up intent ${id} opened`;
}

function summarise(old: RevSchedule, plan: Plan, changed: { period: string; before_cents: number; after_cents: number }[], afterTotal: number): string {
  const notes = plan.notes.length > 0 ? `; ${plan.notes.join("; ")}` : "";
  const first = changed[0];
  const last = changed[changed.length - 1];
  if (!first || !last) return `${old.contract_id} schedule v${old.version} unchanged (${plan.treatment})${notes}`;
  const next = changed[1];
  // the invoiced month can differ from the run rate (the memo wins there), so it is then named on its own
  const split = next !== undefined && (next.before_cents !== first.before_cents || next.after_cents !== first.after_cents);
  const span = first.period === last.period ? `for ${first.period} only`
    : split ? `for ${first.period}, then ${usd(next.before_cents)} → ${usd(next.after_cents)} a month for ${next.period}..${last.period}`
    : `a month for ${first.period}..${last.period}`;
  return `${old.contract_id} schedule v${old.version} → v${old.version + 1}: ${usd(first.before_cents)} → ${usd(first.after_cents)} ${span}; ` +
    `contract value ${usd(old.total_cents)} → ${usd(afterTotal)}${notes}`;
}
