import { ACCOUNTS } from "../contract/accounts.js";
import { getBill } from "../agents/ap/match.js";
import { normalizeInvoiceNo, sameObligation } from "../agents/ap/obligation.js";
import type { AutonomyLevel, Proposal } from "../contract/types.js";
import type { ApprovalLite, ControlTotals, DocLite, ExtraCheck, KernelContext } from "../kernel/types.js";
import type { RuntimeConfig } from "./config.js";
import type { Db } from "./db.js";
import { getApprover, getBankTxn, getDoc, getFact, getPolicy, getTrace, safeJson, fxRealizedCents, getBankFx, getDocFx } from "./lookups.js";

export interface ContextMeta {
  mode: "live" | "replay";
  as_of?: string;
  preparer: string;
  /** Router tier that prepared the entry (0 is code). */
  preparer_tier?: number;
  autonomy_level: AutonomyLevel;
  approval?: ApprovalLite | null;
  intent_id: string;
  features?: Record<string, string | number | boolean>;
  extra_checks?: ExtraCheck[];
  /** Replay only: documents as they stood at the decision. Today's ledger already shows them settled. */
  replay_docs?: DocLite[];
}

/** Assemble everything the kernel may look at from the database. The kernel itself never touches SQLite. */
export function buildKernelContext(db: Db, proposal: Proposal, meta: ContextMeta, config: RuntimeConfig): KernelContext {
  return {
    mode: meta.mode,
    as_of: meta.as_of,
    period: readPeriod(db, proposal.entry_date),
    fiscal_window: config.fiscal_window,
    preparer: meta.preparer,
    preparer_tier: meta.preparer_tier,
    autonomy_level: meta.autonomy_level,
    approval: meta.approval ?? null,
    materiality_cents: config.materiality_cents,
    open_escalations: countOpenEscalations(db, meta.intent_id),
    // An empty snapshot carries no balances, so the control totals are read from the books, not taken as zero.
    control: meta.mode === "replay" && meta.replay_docs?.length ? replayControl(meta.replay_docs) : readControlTotals(db),
    standardAccounts: (kind) => config.standard_accounts[kind] ?? [],
    allowedAccounts: (kind) => config.allowed_accounts[kind] ?? [],
    features: { kind: proposal.kind, function: proposal.function, party_id: proposal.party_id, ...(meta.features ?? {}) },
    getTrace: (id) => getTrace(db, id, meta.mode === "replay" ? meta.as_of : undefined),
    getDoc: (id) => (meta.mode === "replay" ? meta.replay_docs?.find((d) => d.id === id) : undefined) ?? getDoc(db, id),
    getBankTxn: (id) => visibleBankTxn(db, id, meta),
    bankTxnAppliedCents: (id) => meta.mode === "replay" ? 0 : bankTxnAppliedCents(db, id),
    getFact: (id) => getFact(db, id),
    getDocFx: (id) => getDocFx(db, id),
    getBankFx: (id) => getBankFx(db, id),
    fxRealizedCents: (id) => fxRealizedCents(db, id),
    getPolicy: (id) => getPolicy(db, id),
    getApprover: (id) => getApprover(db, id),
    findPaidDuplicate: (party, _amount, exclude) => findPaidDuplicate(db, party, proposal.applications.map(a => a.doc_id), exclude),
    remitChangedUnverified: (party) => remitChangedUnverified(db, party),
    extra_checks: [...(meta.extra_checks ?? []), ...packChecks(db, proposal, config), ...legacyPolicyChecks(db, proposal, meta)],
  };
}

/** Older compiled rules generalized across every customer. Keep the record, but require a scoped replacement. */
function legacyPolicyChecks(db: Db, proposal: Proposal, meta: ContextMeta): ExtraCheck[] {
  if (meta.mode !== "live") return [];
  const stale = proposal.policy_refs.filter(id => {
    const row = db.prepare("SELECT code, condition_json FROM policy WHERE id = ?").get(id) as { code: string | null; condition_json: string } | undefined;
    if (!row?.code) return false; // manually authored company policies retain their explicitly approved scope
    const condition = safeJson(row.condition_json) as { all?: Array<{ field?: string; op?: string; value?: unknown }> } | null;
    return !condition?.all?.some(c => c.field === "party_id" && c.op === "in" && Array.isArray(c.value) && c.value.length > 0);
  });
  return stale.length ? [() => [{ cls: "J", check: "J_SCOPE", status: "fail", refs: stale,
    detail: "legacy compiled policy has no customer scope; compile and approve a scoped replacement before reuse" }]] : [];
}

/** Functions whose entries may not pass the kernel on its generic checks alone. */
const NEEDS_PACK_CHECKS: readonly string[] = ["ap"];

/**
 * A pack's checks come from the configuration, so every gate runs them, including a person's approval. For a
 * function that needs them, their absence fails the entry: a forgotten configuration must never read as a pass.
 */
function packChecks(db: Db, proposal: Proposal, config: RuntimeConfig): ExtraCheck[] {
  const factory = config.pack_checks?.[proposal.function];
  if (factory) return factory(db);
  if (!NEEDS_PACK_CHECKS.includes(proposal.function)) return [];
  return [() => [{ cls: "P", check: "X2", status: "fail", refs: [proposal.intent_id],
    detail: `no pack checks are configured for function ${proposal.function}; the entry cannot be re-performed` }]];
}

/** In replay, a bank line posted after the as-of date does not exist yet. */
function visibleBankTxn(db: Db, id: string, meta: ContextMeta): ReturnType<typeof getBankTxn> {
  const txn = getBankTxn(db, id);
  if (txn && meta.mode === "replay" && meta.as_of && txn.posted_date > meta.as_of.slice(0, 10)) return undefined;
  return txn;
}

/** Cents of a bank line already applied by decisions that took effect. A bank line cannot be spent twice. */
export function bankTxnAppliedCents(db: Db, bankTxnId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ABS((l.value ->> '$.debit_cents') - (l.value ->> '$.credit_cents'))), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.entries')) l
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND json_extract(d.proposal_json, '$.bank_txn_id') = ?
         AND l.value ->> '$.account' = ?`,
    )
    .get(bankTxnId, ACCOUNTS.cash) as { n: number };
  return row.n;
}

/** A date with no period row is treated as locked: nothing posts to a month nobody opened. */
function readPeriod(db: Db, entryDate: string): KernelContext["period"] {
  const id = entryDate.slice(0, 7);
  const row = db.prepare("SELECT id, status FROM period WHERE id = ?").get(id) as KernelContext["period"] | undefined;
  return row ?? { id, status: "locked" };
}

function countOpenEscalations(db: Db, intentId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM escalation e JOIN decision d ON d.id = e.decision_id
       WHERE d.intent_id = ? AND e.answered_at IS NULL`,
    )
    .get(intentId) as { n: number };
  return row.n;
}

/** In replay the as-of ledger is not rebuilt, so the control accounts are taken as tied to the snapshot. */
function replayControl(docs: DocLite[]): ControlTotals {
  const sum = (kind: DocLite["kind"]): number => docs.filter((d) => d.kind === kind).reduce((n, d) => n + d.open_cents, 0);
  return {
    ar_account: ACCOUNTS.ar, ap_account: ACCOUNTS.ap, cash_account: ACCOUNTS.cash,
    ar_gl_cents: sum("invoice"), ar_subledger_cents: sum("invoice"), ap_gl_cents: sum("bill"), ap_subledger_cents: sum("bill"),
  };
}

export function readControlTotals(db: Db): ControlTotals {
  const gl = (account: string, sign: 1 | -1): number => {
    const row = db
      .prepare("SELECT COALESCE(SUM(debit_cents - credit_cents), 0) AS n FROM gl_line WHERE account = ?")
      .get(account) as { n: number };
    return sign * row.n;
  };
  const ar = db.prepare("SELECT COALESCE(SUM(open_cents), 0) AS n FROM invoice WHERE status IN ('open','disputed')").get() as { n: number };
  const ap = db.prepare("SELECT COALESCE(SUM(open_cents), 0) AS n FROM bill WHERE status IN ('approved','scheduled')").get() as { n: number };
  return {
    ar_account: ACCOUNTS.ar, ap_account: ACCOUNTS.ap, cash_account: ACCOUNTS.cash,
    ar_gl_cents: gl(ACCOUNTS.ar, 1), ar_subledger_cents: ar.n,
    ap_gl_cents: gl(ACCOUNTS.ap, -1), ap_subledger_cents: ap.n,
  };
}

function findPaidDuplicate(db: Db, partyId: string, proposed: string[], exclude: string[]): { doc_id: string } | undefined {
  const paid = (db.prepare("SELECT id FROM bill WHERE party_id = ? AND status = 'paid'").all(partyId) as { id: string }[])
    .filter(r => !exclude.includes(r.id)).map(r => getBill(db, r.id)!);
  for (const id of proposed) {
    const bill = getBill(db, id);
    if (!bill || bill.party_id !== partyId) continue;
    const hit = paid.find(other => sameObligation(bill, other) || normalizeInvoiceNo(bill.vendor_invoice_no) === normalizeInvoiceNo(other.vendor_invoice_no));
    if (hit) return { doc_id: hit.id };
  }
  return undefined;
}

/** True while a bank-detail change request for this vendor has no out-of-band verification recorded. */
function remitChangedUnverified(db: Db, partyId: string): boolean {
  const rows = db
    .prepare("SELECT payload_json FROM event WHERE topic = 'ap.vendor.change_requested' ORDER BY id DESC")
    .all() as { payload_json: string }[];
  for (const row of rows) {
    const payload = safeJson(row.payload_json) as { party_id?: string; verified_by?: string | null } | null;
    if (payload?.party_id === partyId) return !payload.verified_by;
  }
  return false;
}
