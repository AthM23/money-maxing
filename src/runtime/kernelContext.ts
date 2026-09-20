import { ACCOUNTS } from "../contract/accounts.js";
import type { AutonomyLevel, Proposal } from "../contract/types.js";
import type { ApprovalLite, ControlTotals, DocLite, ExtraCheck, KernelContext } from "../kernel/types.js";
import type { RuntimeConfig } from "./config.js";
import type { Db } from "./db.js";
import { getApprover, getBankTxn, getDoc, getFact, getPolicy, getTrace, safeJson } from "./lookups.js";

export interface ContextMeta {
  mode: "live" | "replay";
  as_of?: string;
  preparer: string;
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
    autonomy_level: meta.autonomy_level,
    approval: meta.approval ?? null,
    materiality_cents: config.materiality_cents,
    open_escalations: countOpenEscalations(db, meta.intent_id),
    // An empty snapshot carries no balances, so the control totals are read from the books, not taken as zero.
    control: meta.mode === "replay" && meta.replay_docs?.length ? replayControl(meta.replay_docs) : readControlTotals(db),
    standardAccounts: (kind) => config.standard_accounts[kind] ?? [],
    allowedAccounts: (kind) => config.allowed_accounts[kind] ?? [],
    features: { kind: proposal.kind, function: proposal.function, party_id: proposal.party_id, ...(meta.features ?? {}) },
    getTrace: (id) => getTrace(db, id),
    getDoc: (id) => (meta.mode === "replay" ? meta.replay_docs?.find((d) => d.id === id) : undefined) ?? getDoc(db, id),
    getBankTxn: (id) => visibleBankTxn(db, id, meta),
    bankTxnAppliedCents: (id) => bankTxnAppliedCents(db, id),
    getFact: (id) => getFact(db, id),
    getPolicy: (id) => getPolicy(db, id),
    getApprover: (id) => getApprover(db, id),
    findPaidDuplicate: (party, amount, exclude) => findPaidDuplicate(db, party, amount, exclude),
    remitChangedUnverified: (party) => remitChangedUnverified(db, party),
    extra_checks: [...(meta.extra_checks ?? []), ...packChecks(db, proposal, config)],
  };
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
function bankTxnAppliedCents(db: Db, bankTxnId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(a.value ->> '$.amount_cents'), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND json_extract(d.proposal_json, '$.bank_txn_id') = ?`,
    )
    .get(bankTxnId) as { n: number };
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

function findPaidDuplicate(db: Db, partyId: string, amountCents: number, exclude: string[]): { doc_id: string } | undefined {
  const rows = db
    .prepare("SELECT id FROM bill WHERE party_id = ? AND total_cents = ? AND status = 'paid'")
    .all(partyId, amountCents) as { id: string }[];
  const hit = rows.find((r) => !exclude.includes(r.id));
  return hit ? { doc_id: hit.id } : undefined;
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
