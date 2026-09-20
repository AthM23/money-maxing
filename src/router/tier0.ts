import { ACCOUNTS } from "../contract/accounts.js";
import type { CaseFile, Proposal } from "../contract/types.js";
import { evaluateCondition } from "../kernel/index.js";
import type { Condition } from "../kernel/types.js";
import { applicableFacts } from "../memory/applicability.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";

/** Tier 0 builds proposals in code from an exact match, an active fact or an approved policy. No model call. */
export interface Tier0Plan {
  proposals: Proposal[];
  /** Cents of the shortfall that nothing on file explains. Above zero means an agent has to look. */
  unexplained_cents: number;
  notes: string[];
}

export function planTier0(db: Db, c: CaseFile, asOf?: string): Tier0Plan {
  const notes: string[] = [];
  const proposals: Proposal[] = [];
  if (c.received_cents > 0 && c.bank_txn_id) proposals.push(cashApplication(db, c));
  if (c.shortfall_cents <= 0) return { proposals, unexplained_cents: 0, notes };

  const adjustment = fromFact(db, c, notes, asOf) ?? fromPolicy(db, c, notes);
  if (adjustment) proposals.push(adjustment);
  return { proposals, unexplained_cents: adjustment ? 0 : c.shortfall_cents, notes };
}

/** Apply what arrived, oldest document first. Arithmetic in code; the kernel re-checks it anyway. */
function cashApplication(db: Db, c: CaseFile): Proposal {
  let left = c.received_cents;
  const applications: Proposal["applications"] = [];
  for (const docId of c.doc_ids) {
    if (left <= 0) break;
    const amount = Math.min(left, openBalance(db, c, docId));
    if (amount > 0) applications.push({ doc_id: docId, amount_cents: amount });
    left -= amount;
  }
  const applied = applications.reduce((n, a) => n + a.amount_cents, 0);
  const memo = `Cash application ${c.bank_txn_id}`;
  return base(c, "apply_payment", applications, [
    { account: ACCOUNTS.cash, debit_cents: c.received_cents, credit_cents: 0, memo },
    { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: applied, memo },
    ...(c.received_cents > applied ? [{ account: ACCOUNTS.customer_credits, debit_cents: 0, credit_cents: c.received_cents - applied, memo: `${memo}: unapplied` }] : []),
  ]);
}

/** In replay the balance comes from the case snapshot: today's ledger already shows the invoice settled. */
function openBalance(db: Db, c: CaseFile, docId: string): number {
  const snap = c.docs_snapshot?.find((d) => d.id === docId);
  if (snap) return snap.open_cents;
  const doc = db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(docId) as { open_cents: number } | undefined;
  return doc?.open_cents ?? 0;
}

function fromFact(db: Db, c: CaseFile, notes: string[], asOf?: string): Proposal | null {
  const { applicable, refused } = applicableFacts(db, {
    party_id: c.party_id, kind: "credit_memo", entry_date: c.entry_date, amount_cents: c.shortfall_cents, as_of: asOf,
  });
  for (const r of refused) notes.push(`fact ${r.fact_id} not used: ${r.failed_dimension} (${r.detail})`);
  for (const fact of applicable) {
    const pct = typeof fact.value.pct_off === "number" ? fact.value.pct_off : null;
    const cents = typeof fact.value.amount_cents === "number" ? fact.value.amount_cents : null;
    const explains = pct !== null ? Math.round((c.expected_cents * pct) / 100) : cents;
    if (explains !== c.shortfall_cents) {
      notes.push(`fact ${fact.fact_id} explains ${explains ?? "nothing"}, shortfall is ${c.shortfall_cents}: not used`);
      continue;
    }
    const memo = `Concession per fact ${fact.fact_id}, approved by ${fact.approved_by ?? "unknown"}`;
    const p = base(c, "credit_memo", lastDocApplication(c), [
      { account: ACCOUNTS.deferred_revenue, debit_cents: c.shortfall_cents, credit_cents: 0, memo },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo },
    ]);
    p.fact_refs = [fact.fact_id];
    p.evidence = factEvidence(db, fact.fact_id);
    return p;
  }
  return null;
}

interface PolicyRow { id: string; condition_json: string; action_json: string }

function fromPolicy(db: Db, c: CaseFile, notes: string[]): Proposal | null {
  const rows = db.prepare("SELECT id, condition_json, action_json FROM policy WHERE function = ? AND status = 'approved'")
    .all(c.function) as PolicyRow[];
  for (const row of rows) {
    const condition = safeJson(row.condition_json) as Condition | null;
    const action = safeJson(row.action_json) as { kind?: Proposal["kind"]; account?: string } | null;
    if (!condition || !action?.kind || !action.account) continue;
    if (!evaluateCondition(condition, caseFeatures(c))) {
      notes.push(`policy ${row.id}: condition does not match`);
      continue;
    }
    const memo = `Per policy ${row.id}`;
    const p = base(c, action.kind, lastDocApplication(c), [
      { account: action.account, debit_cents: c.shortfall_cents, credit_cents: 0, memo },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo },
    ]);
    p.policy_refs = [row.id];
    p.evidence = c.trace_ids.map((trace_id) => ({ claim: "bank line showing the shortfall", trace_id }));
    return p;
  }
  return null;
}

/** The features a compiled policy may test. Same names the kernel sees at J1. */
export function caseFeatures(c: CaseFile): Record<string, string | number | boolean> {
  return {
    function: c.function, party_id: c.party_id, shortfall_cents: c.shortfall_cents,
    expected_cents: c.expected_cents, received_cents: c.received_cents, method: c.method ?? "other",
  };
}

function lastDocApplication(c: CaseFile): Proposal["applications"] {
  const docId = c.doc_ids[c.doc_ids.length - 1];
  return docId ? [{ doc_id: docId, amount_cents: c.shortfall_cents }] : [];
}

function factEvidence(db: Db, factId: string): Proposal["evidence"] {
  const row = db.prepare("SELECT source_trace_ids_json FROM fact WHERE id = ?").get(factId) as { source_trace_ids_json: string } | undefined;
  const ids = (row ? (safeJson(row.source_trace_ids_json) as string[] | null) : null) ?? [];
  return ids.map((trace_id) => ({ claim: `source of fact ${factId}`, trace_id }));
}

function base(c: CaseFile, kind: Proposal["kind"], applications: Proposal["applications"], entries: Proposal["entries"]): Proposal {
  return {
    intent_id: c.intent_id, function: c.function, kind, party_id: c.party_id, entry_date: c.entry_date,
    bank_txn_id: kind === "apply_payment" ? c.bank_txn_id : undefined,
    applications, entries, evidence: [], policy_refs: [], fact_refs: [], judgment: [],
  };
}
