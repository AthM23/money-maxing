import { emit } from "../bus/bus.js";
import { worldToday } from "../engines/asOf.js";
import { recordRipple } from "../engines/ripple.js";
import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { newId } from "../runtime/ids.js";

export const C1_COMPARATOR = "C1_crm_vs_schedule";
const PREDICATE = "concession_pct";

/**
 * open: the two systems differ and nothing active explains it. explained: an active fact accounts for exactly the
 * difference. agrees: they differed once and are equal again. dismissed: a person closed the intent while the same
 * difference stands, so it is not asked again.
 */
export type C1Status = "open" | "explained" | "agrees" | "dismissed";

export interface C1Finding {
  contract_id: string;
  party_id: string;
  deal_id: string;
  crm_cents: number;
  schedule_cents: number;
  /** CRM minus schedule: positive when the CRM still shows the price before a concession. */
  delta_cents: number;
  status: C1Status;
  intent_id: string;
  /** This run created the intent (open, or already resolved when the difference was explained on first sight). */
  opened: boolean;
  /** This run closed an intent that was open or waiting on a person. */
  resolved: boolean;
  /** This run put `drift.explained` or `drift.updated` on the bus. */
  emitted: boolean;
  /** This run did something (opened, resolved or emitted). False on a quiet re-run: a settle loop can stop on it. */
  changed: boolean;
  explained_by_fact_id?: string;
  candidate_fact_id?: string;
  /** An active fact whose contract modifications account for only part of the difference: it does not explain it. */
  partly_explained_by_fact_id?: string;
  /** The part of `delta_cents` that fact's modifications account for. The rest is `delta_cents - explained_cents`. */
  explained_cents?: number;
  /** An active fact that would explain the difference, but whose window ended before the world's today. */
  lapsed_fact_id?: string;
  /** Set when the latest CRM version of the deal is not closed-won: the stage as the CRM spells it. */
  crm_stage?: string;
}

type Seen = Omit<C1Finding, "changed">;
interface Pair { deal_id: string; contract_id: string; party_id: string; start_date: string; end_date: string; crm_cents: number; schedule_id: string; schedule_cents: number; modification_id: string | null; crm_stage: string | null }
interface KnownCase { intent_id: string; delta_cents: number; status: string }
interface FactRow { id: string; value_json: string; status: string; valid_from: string; valid_to: string }
interface FactMatch { explains?: string; partial?: { fact_id: string; explained_cents: number } }
interface Notes { candidate?: string; partial?: { fact_id: string; explained_cents: number }; lapsed?: string }

const usd = (cents: number): string => `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const keyOf = (contractId: string): string => `${C1_COMPARATOR}|${contractId}`;

/**
 * Comparator C1 (sheet 03): what the CRM says a closed-won deal is worth vs what the revenue schedule will recognise.
 * Pure code, one transaction, idempotent. A difference is drift between two systems of record: it stays visible as
 * one open intent until either the systems agree again or an ACTIVE fact accounts for exactly that amount. A
 * candidate fact explains nothing (nobody with authority has said so yet), it is only named in the question.
 * This comparator posts nothing, so its intent carries no CaseFile: it is for the board and for a person.
 */
export function runCrmVsSchedule(db: Db, clock: Clock = systemClock): C1Finding[] {
  const findings: C1Finding[] = [];
  const run = db.transaction(() => {
    // The world's today is read once per run, and only when a pair needs it (an empty ledger has no today).
    let day: string | undefined;
    const today = (): string => (day ??= worldToday(db));
    for (const pair of pairs(db)) {
      const finding = compareOne(db, clock, pair, today);
      if (finding) findings.push({ ...finding, changed: finding.opened || finding.resolved || finding.emitted });
    }
  });
  run();
  return findings;
}

/**
 * Latest version of every CRM deal whose contract has an active schedule. Tables only: the revenue engine owns
 * `rev_schedule`, and while it has written nothing this returns nothing. A deal that is no longer closed-won is
 * kept (`crm_stage` set, worth $0 of booked revenue): an active schedule for a deal the CRM does not call won is
 * itself a difference, and dropping the pair would leave an open intent open forever.
 */
function pairs(db: Db): Pair[] {
  const rows = db.prepare(
    `SELECT t.external_id AS deal_id, t.payload_json, c.id AS contract_id, c.party_id, c.start_date, c.end_date,
            s.id AS schedule_id, s.total_cents AS schedule_cents, s.modification_id
       FROM trace t
       JOIN contract c ON 'DEAL-' || c.id = t.external_id
       JOIN rev_schedule s ON s.contract_id = c.id AND s.status = 'active'
      WHERE t.source = 'crm' AND t.kind = 'deal'
        AND t.version = (SELECT MAX(version) FROM trace x WHERE x.source = 'crm' AND x.external_id = t.external_id)
      ORDER BY c.id`,
  ).all() as (Omit<Pair, "crm_cents" | "crm_stage"> & { payload_json: string })[];
  const out: Pair[] = [];
  for (const { payload_json, ...rest } of rows) {
    const deal = JSON.parse(payload_json) as { amount_cents?: unknown; stage?: unknown };
    const stage = typeof deal.stage === "string" ? deal.stage.toLowerCase().replace(/[^a-z]/g, "") : "";
    if (stage !== "closedwon") {
      out.push({ ...rest, crm_cents: 0, crm_stage: typeof deal.stage === "string" && deal.stage.trim() ? deal.stage.trim() : "unknown" });
      continue;
    }
    if (typeof deal.amount_cents !== "number" || !Number.isSafeInteger(deal.amount_cents)) continue;
    out.push({ ...rest, crm_cents: deal.amount_cents, crm_stage: null });
  }
  return out;
}

function compareOne(db: Db, clock: Clock, p: Pair, today: () => string): Seen | null {
  const delta = p.crm_cents - p.schedule_cents;
  const known = db.prepare("SELECT d.intent_id, d.delta_cents, i.status FROM drift_case d JOIN intent i ON i.id = d.intent_id WHERE d.dedupe_key = ?")
    .get(keyOf(p.contract_id)) as KnownCase | undefined;
  if (delta === 0 && !known) return null;
  if (known) db.prepare("UPDATE drift_case SET last_seen = ?, delta_cents = ? WHERE dedupe_key = ?").run(clock.now(), delta, keyOf(p.contract_id));

  const base: Base = { contract_id: p.contract_id, party_id: p.party_id, deal_id: p.deal_id, crm_cents: p.crm_cents, schedule_cents: p.schedule_cents, delta_cents: delta };
  if (p.crm_stage) base.crm_stage = p.crm_stage;
  if (delta === 0) return { ...base, status: "agrees", intent_id: known!.intent_id, opened: false, resolved: resolveIntent(db, clock, known!), emitted: false };

  // A concession does not explain a deal the CRM no longer calls won: no fact is consulted for it.
  if (p.crm_stage) return unexplained(db, clock, p, base, known, {});

  const active = matchFacts(db, p, delta, ["active"], today(), "in_force");
  if (active.explains) return explained(db, clock, p, base, known, active.explains);
  const notes: Notes = { candidate: matchFacts(db, p, delta, ["candidate", "approved"], today(), "in_force").explains, partial: active.partial };
  if (!notes.candidate && !notes.partial) notes.lapsed = matchFacts(db, p, delta, ["active", "expired"], today(), "lapsed").explains;
  return unexplained(db, clock, p, base, known, notes);
}

/**
 * Applicability is decided here and not through `applicableFacts` (src/memory/applicability.ts), because that
 * function answers "may this fact be cited for an entry": it needs a ProposalKind (a comparison posts nothing, and a
 * concession fact is scoped to kinds like credit_memo), one entry_date (a schedule spans the contract term), it
 * refuses a used one-time fact, and it holds the amount under the approver's per-entry ceiling. The difference here
 * is the concession over the whole term ($14,400), which is over an account owner's $5,000 entry limit although
 * every memo it explains ($1,200) is under it. So: same party, the predicate, the status, a window that overlaps
 * the contract term AND holds the world's today (`worldToday`, never the wall clock), and integer arithmetic that
 * lands on exactly the difference: either the fact's own contract modifications sum to it, or the whole-term
 * percentage does.
 */
function matchFacts(db: Db, p: Pair, delta: number, statuses: string[], today: string, when: "in_force" | "lapsed"): FactMatch {
  const rows = db.prepare(
    `SELECT id, value_json, status, valid_from, valid_to FROM fact WHERE party_id = ? AND predicate = ? AND valid_from <= ? AND valid_to >= ?
      ORDER BY learned_at DESC, id`,
  ).all(p.party_id, PREDICATE, p.end_date, p.start_date) as FactRow[];
  const covered = db.prepare("SELECT COALESCE(SUM(delta_total_cents), 0) AS cents FROM contract_modification WHERE contract_id = ? AND fact_id = ?");
  const out: FactMatch = {};
  for (const row of rows) {
    if (!statuses.includes(row.status)) continue;
    // In force on the world's today, not only somewhere in the contract term: a lapsed fact explains nothing now.
    const inForce = row.valid_from.slice(0, 10) <= today && today <= row.valid_to.slice(0, 10);
    if (when === "in_force" ? !inForce : !(row.valid_to.slice(0, 10) < today)) continue;

    // (a) What this fact actually did to the schedule: the modifications that cite it. Covers a concession that
    // starts mid-term (10% off 6 of 12 months), which no whole-term percentage lands on.
    const byMods = -(covered.get(p.contract_id, row.id) as { cents: number }).cents;
    if (byMods === delta) return { explains: row.id };

    // (b) Whole-term arithmetic: the percentage off the full CRM value is exactly the difference.
    const pct = (JSON.parse(row.value_json) as { pct_off?: unknown }).pct_off;
    if (delta > 0 && typeof pct === "number" && Number.isFinite(pct) && pct > 0) {
      const bps = Math.round(pct * 100);
      if (Math.floor((p.crm_cents * bps) / 10_000) === delta) return { explains: row.id };
    }

    // Its modifications cover part of the difference, in the same direction: not explained, but the question says so.
    if (!out.partial && byMods !== 0 && Math.sign(byMods) === Math.sign(delta) && Math.abs(byMods) < Math.abs(delta)) out.partial = { fact_id: row.id, explained_cents: byMods };
  }
  return out;
}

type Base = Pick<C1Finding, "contract_id" | "party_id" | "deal_id" | "crm_cents" | "schedule_cents" | "delta_cents" | "crm_stage">;

function explained(db: Db, clock: Clock, p: Pair, base: Base, known: KnownCase | undefined, factId: string): Seen {
  let intentId = known?.intent_id;
  let resolved = false;
  if (known) resolved = resolveIntent(db, clock, known);
  else intentId = openIntent(db, clock, p, base.delta_cents, explainedText(db, p, base.delta_cents, factId), "resolved", null);

  // Once per (difference, fact): the bus row is the marker, so a re-run or a redelivered trigger says nothing new.
  const emitted = !alreadySaid(db, "drift.explained", intentId!, base.delta_cents, factId);
  if (emitted) {
    const eventId = emit(db, { topic: "drift.explained", from_function: "drift", intent_id: intentId!, payload: { ...payloadOf(base), explained_by: factId } }, clock);
    ripple(db, clock, p, base, eventId, "drift_explained", `CRM ${usd(p.crm_cents)} vs schedule ${usd(p.schedule_cents)}: explained by fact ${factId}, nobody asked`);
  }
  return { ...base, status: "explained", intent_id: intentId!, opened: !known, resolved, emitted, explained_by_fact_id: factId };
}

function unexplained(db: Db, clock: Clock, p: Pair, base: Base, known: KnownCase | undefined, notes: Notes): Seen {
  const text = p.crm_stage ? stageText(db, p) : openText(db, p, base.delta_cents, notes);
  const extra: Partial<Seen> = {};
  if (notes.candidate) extra.candidate_fact_id = notes.candidate;
  if (notes.partial) { extra.partly_explained_by_fact_id = notes.partial.fact_id; extra.explained_cents = notes.partial.explained_cents; }
  if (notes.lapsed) extra.lapsed_fact_id = notes.lapsed;

  const live = known && (known.status === "open" || known.status === "waiting_on_human");
  // For a deal that left closed-won the amount alone does not name the state (every stage is worth $0 booked): the
  // bus row that announced this stage on this intent is the marker, as it is for `drift.explained`.
  const sameState = known !== undefined && known.delta_cents === base.delta_cents && (!p.crm_stage || stageSaid(db, known.intent_id, p.crm_stage));
  if (known && !live && sameState && !closedByUs(db, known.intent_id)) {
    // A person closed it and the same difference stands: their call, it is not asked again.
    return { ...base, ...extra, status: "dismissed", intent_id: known.intent_id, opened: false, resolved: false, emitted: false };
  }
  if (live) {
    db.prepare("UPDATE intent SET question = ? WHERE id = ? AND question <> ?").run(text, known.intent_id, text);
    if (!sameState) announce(db, clock, p, base, known.intent_id);
    return { ...base, ...extra, status: "open", intent_id: known.intent_id, opened: false, resolved: false, emitted: !sameState };
  }
  // First sight, or the difference is back after we closed it (the fact lapsed, or the amounts moved): a closed
  // intent is history and is not reopened. The new one points at it, and the dedupe row follows the newest.
  const intentId = openIntent(db, clock, p, base.delta_cents, text, "open", known?.intent_id ?? null);
  announce(db, clock, p, base, intentId);
  return { ...base, ...extra, status: "open", intent_id: intentId, opened: true, resolved: false, emitted: true };
}

function announce(db: Db, clock: Clock, p: Pair, base: Base, intentId: string): void {
  const eventId = emit(db, { topic: "drift.updated", from_function: "drift", intent_id: intentId, payload: payloadOf(base) }, clock);
  const summary = p.crm_stage
    ? `CRM shows ${p.deal_id} as '${p.crm_stage}' while a schedule of ${usd(p.schedule_cents)} is active, intent ${intentId} open`
    : `CRM ${usd(p.crm_cents)} vs schedule ${usd(p.schedule_cents)}: ${usd(base.delta_cents)} unexplained, intent ${intentId} opened`;
  ripple(db, clock, p, base, eventId, "drift_open", summary);
}

const payloadOf = (b: Base): Record<string, unknown> => ({
  comparator: C1_COMPARATOR, contract_id: b.contract_id, party_id: b.party_id, crm_cents: b.crm_cents, schedule_cents: b.schedule_cents, delta_cents: b.delta_cents,
  ...(b.crm_stage ? { crm_stage: b.crm_stage } : {}),
});

/** Writes the intent and points the dedupe row at it. `case_json` stays NULL: the AR worker only takes intents with a CaseFile. */
function openIntent(db: Db, clock: Clock, p: Pair, delta: number, text: string, status: "open" | "resolved", parentId: string | null): string {
  const id = newId("int");
  const now = clock.now();
  db.prepare("INSERT INTO intent (id, parent_id, function, question, owner, status, end_condition_json, case_json, created_at, closed_at) VALUES (?, ?, 'revenue', ?, 'revenue', ?, ?, NULL, ?, ?)")
    .run(id, parentId, text, status, JSON.stringify({ crm_equals_schedule_or_fact: p.contract_id }), now, status === "resolved" ? now : null);
  db.prepare(
    `INSERT INTO drift_case (dedupe_key, comparator, intent_id, delta_cents, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (dedupe_key) DO UPDATE SET intent_id = excluded.intent_id, delta_cents = excluded.delta_cents, last_seen = excluded.last_seen`,
  ).run(keyOf(p.contract_id), C1_COMPARATOR, id, delta, now, now);
  return id;
}

function resolveIntent(db: Db, clock: Clock, known: KnownCase): boolean {
  return db.prepare("UPDATE intent SET status = 'resolved', closed_at = ? WHERE id = ? AND status IN ('open','waiting_on_human')").run(clock.now(), known.intent_id).changes > 0;
}

function alreadySaid(db: Db, topic: string, intentId: string, delta: number, factId: string): boolean {
  const rows = db.prepare("SELECT payload_json FROM event WHERE topic = ? AND intent_id = ?").all(topic, intentId) as { payload_json: string }[];
  return rows.some((r) => {
    const e = JSON.parse(r.payload_json) as { comparator?: string; delta_cents?: number; explained_by?: string };
    return e.comparator === C1_COMPARATOR && e.delta_cents === delta && e.explained_by === factId;
  });
}

/** This intent has already put this CRM stage on the bus: a re-run says nothing new. */
function stageSaid(db: Db, intentId: string, stage: string): boolean {
  const rows = db.prepare("SELECT payload_json FROM event WHERE topic = 'drift.updated' AND intent_id = ?").all(intentId) as { payload_json: string }[];
  return rows.some((r) => {
    const e = JSON.parse(r.payload_json) as { comparator?: string; crm_stage?: string };
    return e.comparator === C1_COMPARATOR && e.crm_stage === stage;
  });
}

/** We only ever close a C1 intent for a reason we put on the bus (explained) or because the amounts agreed. */
function closedByUs(db: Db, intentId: string): boolean {
  return db.prepare("SELECT 1 FROM event WHERE topic = 'drift.explained' AND intent_id = ? LIMIT 1").get(intentId) !== undefined;
}

/**
 * The ripple view follows one intent across functions. When the active schedule came from a modification, that
 * modification names the AR intent that caused it, and this comparison is the last thing that intent touched.
 */
function ripple(db: Db, clock: Clock, p: Pair, base: Base, eventId: number, kind: string, summary: string): void {
  if (!p.modification_id) return;
  const cause = db.prepare("SELECT cause_intent_id FROM contract_modification WHERE id = ?").get(p.modification_id) as { cause_intent_id: string | null } | undefined;
  if (!cause?.cause_intent_id) return;
  recordRipple(db, { intent_id: cause.cause_intent_id, function: "drift", kind, ref: p.contract_id, summary, before_cents: p.crm_cents, after_cents: p.schedule_cents, delta_cents: -base.delta_cents, event_id: eventId }, clock);
}

function openText(db: Db, p: Pair, delta: number, notes: Notes): string {
  const head = `CRM says ${usd(p.crm_cents)} for ${partyName(db, p.party_id)} (${p.deal_id}); the revenue schedule says ${usd(p.schedule_cents)}. Explain the ${usd(delta)} difference`;
  if (notes.partial) {
    const rest = delta - notes.partial.explained_cents;
    return `${head}: active fact ${notes.partial.fact_id} explains ${usd(notes.partial.explained_cents)} of it through its contract modifications, ${usd(rest)} remains unexplained`;
  }
  if (notes.candidate) return `${head} (a candidate fact ${notes.candidate} would explain it once approved)`;
  if (notes.lapsed) return `${head} (fact ${notes.lapsed} explained it until its window ended; it is no longer in force)`;
  return head;
}

function stageText(db: Db, p: Pair): string {
  return `The deal for ${partyName(db, p.party_id)} (${p.deal_id}) is now '${p.crm_stage}' in the CRM while a revenue schedule of ${usd(p.schedule_cents)} is active. Confirm whether the contract has ended and the schedule should stop`;
}

function explainedText(db: Db, p: Pair, delta: number, factId: string): string {
  return `CRM says ${usd(p.crm_cents)} for ${partyName(db, p.party_id)} (${p.deal_id}); the revenue schedule says ${usd(p.schedule_cents)}. The ${usd(delta)} difference is explained by active fact ${factId}; nobody was asked`;
}

function partyName(db: Db, id: string): string {
  return (db.prepare("SELECT name FROM party WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;
}
