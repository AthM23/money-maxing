import { ACCOUNTS } from "../contract/accounts.js";
import type { AutonomyLevel, Proposal } from "../contract/types.js";
import type { ApprovalLite, ControlTotals, ExtraCheck, KernelContext } from "../kernel/types.js";
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
    control: readControlTotals(db),
    standardAccounts: (kind) => config.standard_accounts[kind] ?? [],
    features: { kind: proposal.kind, function: proposal.function, party_id: proposal.party_id, ...(meta.features ?? {}) },
    getTrace: (id) => getTrace(db, id),
    getDoc: (id) => getDoc(db, id),
    getBankTxn: (id) => getBankTxn(db, id),
    getFact: (id) => getFact(db, id),
    getPolicy: (id) => getPolicy(db, id),
    getApprover: (id) => getApprover(db, id),
    findPaidDuplicate: (party, amount, exclude) => findPaidDuplicate(db, party, amount, exclude),
    remitChangedUnverified: (party) => remitChangedUnverified(db, party),
    extra_checks: meta.extra_checks,
  };
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
