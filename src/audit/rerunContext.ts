import { REDUCES_INVOICE_KINDS, type ProposalKind } from "../contract/types.js";
import { ACCOUNTS } from "../contract/accounts.js";
import type { DocLite, KernelContext } from "../kernel/types.js";
import type { RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { buildKernelContext } from "../runtime/kernelContext.js";
import { getDoc, safeJson } from "../runtime/lookups.js";
import { storedFeatures } from "../runtime/persist.js";
import type { RerunSubject } from "./subject.js";

/** Kinds whose posting reduces a document's open balance, which is what has to be added back. */
/** The contract's own list of kinds that take an invoice down, plus the one that pays a bill. Never a private copy. */
const REDUCES_OPEN: readonly ProposalKind[] = [...REDUCES_INVOICE_KINDS, "schedule_payment"];

export interface RerunContext {
  ctx: KernelContext;
  /** Plain-English record of every as-of restoration, for the workpaper. */
  neutralised: string[];
}

/**
 * Re-perform against the world as it stood immediately before this entry posted.
 *
 * WHY: the kernel is deterministic, so running it on today's database is not a re-performance —
 * it is a test of what the entry itself did. Six things legitimately changed BECAUSE the entry
 * posted, and each would otherwise read as a finding against it:
 *   1. the documents it paid are now settled          → replay_docs, balances added back from the LEDGER
 *   2. the bank line it applied is now spent          → its own (and later) applications discounted
 *   3. the period was locked afterwards               → the lock is undone only if it demonstrably was
 *   4. the one-time facts it cited are now used up    → its own (and later) uses discounted
 *   5. escalations opened later on the same intent    → counted as at the posting instant
 *   6. vendor bank-detail events raised afterwards    → read only up to the posting instant
 * and a duplicate-payment probe would now find the bills a LATER payment settled.
 * Nothing else is relaxed: a defect that was already there stays a finding, and nothing the
 * preparer wrote about the world is taken as the world.
 *
 * The case features come from the workpaper, not from today's world, so a cited policy is re-tested on
 * the facts it was judged on — the post gate in `approve.ts` does the same. Without them J1 fails on
 * every policy-driven entry, because an unknown feature field evaluates false.
 */
export function buildRerunContext(db: Db, subject: RerunSubject, config: RuntimeConfig): RerunContext {
  const neutralised: string[] = [];
  const docs = asOfDocs(db, subject, neutralised);
  const features = storedFeatures(db, subject.decision_id);
  if (Object.keys(features).length > 0) {
    neutralised.push(`case features read from the workpaper: ${Object.keys(features).sort().join(", ")}`);
  }
  const base = buildKernelContext(db, subject.proposal, {
    mode: "replay",
    as_of: subject.posted_at,
    preparer: subject.actor,
    autonomy_level: subject.autonomy_level,
    approval: subject.approval,
    intent_id: subject.intent_id,
    features,
    replay_docs: docs.length > 0 ? docs : undefined,
  }, config);
  const ctx: KernelContext = {
    ...base,
    period: asOfPeriod(db, base.period, subject.posted_at, neutralised),
    open_escalations: asOfEscalations(db, subject, base.open_escalations, neutralised),
    bankTxnAppliedCents: (id) => appliedByOthers(db, subject, id, neutralised),
    getFact: (id) => asOfFact(db, subject, base, id, neutralised),
    getPolicy: (id) => asOfPolicy(db, subject, base, id, neutralised),
    findPaidDuplicate: (party, amount, exclude) =>
      base.findPaidDuplicate?.(party, amount, [...exclude, ...paidLater(db, subject)]),
    remitChangedUnverified: (party) => remitChangedAsOf(db, subject, party),
  };
  return { ctx, neutralised };
}

/**
 * Document balances as at posting, rebuilt from the ledger: today's balance plus everything this
 * entry and every later one took off it.
 *
 * WHY not the case file's `docs_snapshot`: it is the preparer's own account of the balances, written
 * by the same run that is under examination. Believing it means a second application to an invoice
 * that was already settled re-performs clean, because the snapshot still shows the invoice wide open.
 * The snapshot is used only for a document that has since gone from the ledger, where there is
 * nothing to rebuild from — and the workpaper says which source was used, either way.
 */
function asOfDocs(db: Db, subject: RerunSubject, neutralised: string[]): DocLite[] {
  const snapshot = new Map((subject.case_file?.docs_snapshot ?? []).map((doc) => [doc.id, doc]));
  const byId = new Map<string, DocLite>();
  for (const app of subject.proposal.applications) {
    const current = getDoc(db, app.doc_id);
    if (!current) {
      const kept = snapshot.get(app.doc_id);
      // F2 reports a document that has gone; the auditor does not invent one it has no record of.
      if (kept) byId.set(app.doc_id, kept);
      neutralised.push(`${app.doc_id} is no longer in the ledger: open balance ${kept ? "read from the case file snapshot" : "cannot be rebuilt"}`);
      continue;
    }
    const restored = restoredCents(db, subject, app.doc_id);
    byId.set(app.doc_id, { ...current, open_cents: current.open_cents + restored });
    neutralised.push(
      `${app.doc_id} open balance restored by ${restored} cents applied at or after this posting, ` +
      `read from the ledger and not from the case file`,
    );
  }
  return [...byId.values()];
}

/** Cents taken off a document by this decision, plus by any decision that posted at the same instant or later. */
function restoredCents(db: Db, subject: RerunSubject, docId: string): number {
  const kinds = REDUCES_OPEN.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(a.value ->> '$.amount_cents'), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND (d.id = ? OR d.posted_at >= ?)
         AND json_extract(d.proposal_json, '$.kind') IN (${kinds})
         AND a.value ->> '$.doc_id' = ?`,
    )
    .get(subject.decision_id, subject.posted_at, ...REDUCES_OPEN, docId) as { n: number };
  return row.n;
}

/**
 * A period locked after this entry posted was open when it posted, so the lock is undone. A lock that
 * predates it stays a finding — and so does a lock with no `locked_at` on file: without a lock time
 * there is nothing to show the lock came afterwards, and the benefit of that doubt belongs to the
 * control, not to the entry.
 */
function asOfPeriod(db: Db, period: KernelContext["period"], postedAt: string, neutralised: string[]): KernelContext["period"] {
  if (period.status !== "locked") return period;
  const row = db.prepare("SELECT locked_at FROM period WHERE id = ?").get(period.id) as { locked_at: string | null } | undefined;
  if (!row) return period; // no period row at all: nobody ever opened that month, which is a real defect.
  if (row.locked_at === null) {
    neutralised.push(`period ${period.id} is locked with no locked_at on file, so the lock could not be shown to fall after this entry posted at ${postedAt}: left locked`);
    return period;
  }
  if (row.locked_at <= postedAt) return period;
  neutralised.push(`period ${period.id} locked at ${row.locked_at}, after this entry posted at ${postedAt}`);
  return { ...period, status: "open" };
}

/** Escalations on this intent that were open at the posting instant, not the ones raised since. */
function asOfEscalations(db: Db, subject: RerunSubject, live: number, neutralised: string[]): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM escalation e JOIN decision d ON d.id = e.decision_id
       WHERE d.intent_id = ? AND e.asked_at <= ? AND (e.answered_at IS NULL OR e.answered_at > ?)`,
    )
    .get(subject.intent_id, subject.posted_at, subject.posted_at) as { n: number };
  if (row.n !== live) neutralised.push(`open escalations counted as at posting: ${row.n}, not the ${live} open on this intent today`);
  return row.n;
}

/** Cents of a bank line spent by OTHER decisions that had already posted. Spending it here is not double-spending it. */
function appliedByOthers(db: Db, subject: RerunSubject, bankTxnId: string, neutralised: string[]): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ABS((l.value ->> '$.debit_cents') - (l.value ->> '$.credit_cents'))), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.entries')) l
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.id <> ? AND d.posted_at <= ?
         AND json_extract(d.proposal_json, '$.bank_txn_id') = ? AND l.value ->> '$.account' = ?`,
    )
    .get(subject.decision_id, subject.posted_at, bankTxnId, ACCOUNTS.cash) as { n: number };
  neutralised.push(`bank line ${bankTxnId} counted as ${row.n} cents applied, excluding this decision's own application`);
  return row.n;
}

/** A one-time fact this entry spent is not "already used" from the entry's own point of view. */
/**
 * A rule is never edited: a newer version retires the older one. An entry posted under v1 was right to cite v1, so
 * re-performance reads v1 as approved if it was approved before the posting and only retired afterwards, by a
 * successor whose approval time is on file. A rule retired with no successor carries no retirement time, so it is
 * left as retired: that stays a finding for a person to look at.
 */
function asOfPolicy(db: Db, subject: RerunSubject, base: KernelContext, id: string, neutralised: string[]): ReturnType<KernelContext["getPolicy"]> {
  const policy = base.getPolicy(id);
  if (!policy || policy.status !== "retired") return policy;
  const own = db.prepare("SELECT approved_at FROM policy WHERE id = ?").get(id) as { approved_at: string | null } | undefined;
  const successor = db.prepare("SELECT id, approved_at FROM policy WHERE supersedes = ? AND approved_at IS NOT NULL ORDER BY approved_at LIMIT 1")
    .get(id) as { id: string; approved_at: string } | undefined;
  if (!own?.approved_at || !successor || own.approved_at > subject.posted_at || successor.approved_at <= subject.posted_at) return policy;
  neutralised.push(`policy ${id} read as approved: it was retired at ${successor.approved_at} by ${successor.id}, after this entry posted at ${subject.posted_at}`);
  return { ...policy, status: "approved" };
}

function asOfFact(db: Db, subject: RerunSubject, base: KernelContext, id: string, neutralised: string[]): ReturnType<KernelContext["getFact"]> {
  const fact = base.getFact(id);
  if (!fact) return undefined;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM decision d
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.id <> ? AND d.posted_at <= ?
         AND EXISTS (SELECT 1 FROM json_each(json_extract(d.proposal_json, '$.fact_refs')) j WHERE j.value = ?)`,
    )
    .get(subject.decision_id, subject.posted_at, id) as { n: number };
  if (row.n !== fact.used_count) neutralised.push(`fact ${id} counted as used ${row.n} time(s) before this posting, not ${fact.used_count}`);
  return { ...fact, used_count: row.n };
}

/**
 * Bills a LATER payment settled. The duplicate-payment probe looks only at bills standing as PAID
 * (`findPaidDuplicate`), and only `schedule_payment` can put a bill in that state (`runtime/post.ts`),
 * so a later payment is the only thing that can make a bill read as paid when it was not.
 *
 * WHY only that: excluding every document any later decision happened to name let a one-cent credit
 * memo booked a week afterwards erase a real DUPLICATE_PAYMENT block on re-performance.
 */
function paidLater(db: Db, subject: RerunSubject): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT a.value ->> '$.doc_id' AS doc_id
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.posted_at > ?
         AND json_extract(d.proposal_json, '$.kind') = 'schedule_payment'`,
    )
    .all(subject.posted_at) as { doc_id: string }[];
  return rows.map((row) => row.doc_id);
}

/** Vendor bank-detail changes as the record stood at posting. A change raised since is a later story. */
function remitChangedAsOf(db: Db, subject: RerunSubject, partyId: string): boolean {
  const rows = db
    .prepare("SELECT payload_json FROM event WHERE topic = 'ap.vendor.change_requested' AND ts <= ? ORDER BY id DESC")
    .all(subject.posted_at) as { payload_json: string }[];
  for (const row of rows) {
    const payload = safeJson(row.payload_json) as { party_id?: string; verified_by?: string | null } | null;
    if (payload?.party_id === partyId) return !payload.verified_by;
  }
  return false;
}
