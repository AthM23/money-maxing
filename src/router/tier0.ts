import { ACCOUNTS } from "../contract/accounts.js";
import type { CaseFile, Proposal } from "../contract/types.js";
import { evaluateCondition } from "../kernel/index.js";
import type { Condition } from "../kernel/types.js";
import { applicableFacts } from "../memory/applicability.js";
import type { Db } from "../runtime/db.js";
import { bankTxnAppliedCents } from "../runtime/kernelContext.js";
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
  if (c.matching_issue) return { proposals, unexplained_cents: Math.max(1, c.received_cents), notes: [c.matching_issue] };
  const replaying = asOf !== undefined;
  const cashToApply = replaying ? c.received_cents : cashStillToApply(db, c, notes);
  if (cashToApply > 0 && c.bank_txn_id) proposals.push(cashApplication(db, c, replaying));
  if (c.shortfall_cents <= 0) return { proposals, unexplained_cents: 0, notes };

  const stillOpen = replaying ? c.shortfall_cents : shortfallStillOpen(db, c, cashToApply);
  if (stillOpen <= 0) return { proposals, unexplained_cents: 0, notes };
  if (c.remittance && c.remittance.applications.filter(a => (replaying ? snapshotBalance(db, c, a.doc_id) : liveOpenBalance(db, a.doc_id)) > a.amount_cents).length > 1) {
    return { proposals, unexplained_cents: stillOpen, notes: ["Multiple remittance lines are short; investigate each allocation before adjusting."] };
  }
  if (stillOpen !== c.shortfall_cents) {
    notes.push(`${stillOpen} cents are still open on ${c.doc_ids.join(", ")}, the case file says ${c.shortfall_cents}: something else has adjusted these documents`);
    return { proposals, unexplained_cents: stillOpen, notes };
  }
  const adjustment = fromFact(db, c, notes, asOf) ?? fromPolicy(db, c, notes);
  if (adjustment) proposals.push(adjustment);
  return { proposals, unexplained_cents: adjustment ? 0 : c.shortfall_cents, notes };
}

/**
 * A case can come round again: after a person's answer, after a rule is approved, after a failed pass. The plan is
 * made from the ledger as it stands, so money that has already been applied is never applied twice.
 */
function cashStillToApply(db: Db, c: CaseFile, notes: string[]): number {
  if (!c.bank_txn_id || c.received_cents <= 0) return 0;
  const applied = bankTxnAppliedCents(db, c.bank_txn_id);
  if (applied === 0) return c.received_cents;
  if (applied < c.received_cents) notes.push(`bank line ${c.bank_txn_id}: ${applied} of ${c.received_cents} cents already applied by another entry; the rest is left for a person`);
  return 0;
}

/** What the documents will still owe once the cash in hand has landed. */
function shortfallStillOpen(db: Db, c: CaseFile, cashToApply: number): number {
  const open = c.doc_ids.reduce((n, id) => n + liveOpenBalance(db, id), 0);
  return open - Math.min(cashToApply, open);
}

/** Apply what arrived, oldest document first. Arithmetic in code; the kernel re-checks it anyway. */
function cashApplication(db: Db, c: CaseFile, replaying: boolean): Proposal {
  let left = c.received_cents;
  const applications: Proposal["applications"] = [];
  for (const docId of c.doc_ids) {
    if (left <= 0) break;
    const amount = c.remittance?.applications.find(a => a.doc_id === docId)?.amount_cents
      ?? Math.min(left, replaying ? snapshotBalance(db, c, docId) : liveOpenBalance(db, docId));
    if (amount > 0) applications.push({ doc_id: docId, amount_cents: amount });
    left -= amount;
  }
  const applied = applications.reduce((n, a) => n + a.amount_cents, 0);
  const memo = `Cash application ${c.bank_txn_id}`;
  const p = base(c, "apply_payment", applications, [
    { account: ACCOUNTS.cash, debit_cents: c.received_cents, credit_cents: 0, memo },
    ...(applied > 0 ? [{ account: ACCOUNTS.ar, debit_cents: 0, credit_cents: applied, memo }] : []),
    ...(c.received_cents > applied ? [{ account: ACCOUNTS.customer_credits, debit_cents: 0, credit_cents: c.received_cents - applied, memo: `${memo}: unapplied` }] : []),
  ]);
  if (c.received_cents > applied) p.evidence = unappliedCashEvidence(db, c);
  if (!replaying) citePayerFact(db, c, p);
  if (c.remittance) {
    p.remittance_trace_id = c.remittance.trace_id;
    p.evidence.push({ claim: "Customer's per-invoice remittance instructions", trace_id: c.remittance.trace_id });
  }
  return p;
}

/**
 * Global customers often pay from another legal entity: a parent, a treasury centre, a payment agent. The kernel
 * ties a bank line to the customer on the entry unless an active fact, approved by a person, names that payer. When
 * such a fact exists the entry cites it; when none does, the entry goes as it is and the kernel's refusal is the
 * record of why someone has to confirm who pays for whom.
 */
function citePayerFact(db: Db, c: CaseFile, p: Proposal): void {
  const payer = c.bank_txn_id
    ? (db.prepare("SELECT party_id FROM bank_txn WHERE id = ?").get(c.bank_txn_id) as { party_id: string | null } | undefined)?.party_id
    : null;
  if (!payer || payer === c.party_id) return;
  for (const predicate of ["payer_alias", "parent_pays"]) {
    const { applicable } = applicableFacts(db, { party_id: c.party_id, kind: "apply_payment", entry_date: c.entry_date, amount_cents: 0, predicate });
    const fact = applicable.find((f) => f.value.payer_party_id === payer);
    if (!fact) continue;
    p.fact_refs = [...p.fact_refs, fact.fact_id];
    p.evidence = [...p.evidence, ...factEvidence(db, fact.fact_id)];
    return;
  }
}

/**
 * Money held as a customer credit is a judgment, so it needs a quoted source. The source is the bank line itself:
 * its descriptor is quoted, and the kernel agrees the quote against the stored bank record character by character.
 */
function unappliedCashEvidence(db: Db, c: CaseFile): Proposal["evidence"] {
  const txn = c.bank_txn_id
    ? (db.prepare("SELECT descriptor FROM bank_txn WHERE id = ?").get(c.bank_txn_id) as { descriptor: string } | undefined)
    : undefined;
  return c.trace_ids.map((trace_id) => ({
    claim: "bank line showing money received with no open document to apply it to", trace_id,
    ...(txn?.descriptor ? { quote: txn.descriptor } : {}),
  }));
}

/** In replay the balance comes from the case snapshot: today's ledger already shows the invoice settled. */
function snapshotBalance(db: Db, c: CaseFile, docId: string): number {
  return c.docs_snapshot?.find((d) => d.id === docId)?.open_cents ?? liveOpenBalance(db, docId);
}

function liveOpenBalance(db: Db, docId: string): number {
  const doc = db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(docId) as { open_cents: number } | undefined;
  return doc?.open_cents ?? 0;
}

/** What a remembered fact can settle, and how each is booked. The percentage lives in the fact; the account lives here. */
const FACT_TREATMENTS = [
  { kind: "credit_memo", account: ACCOUNTS.deferred_revenue, pct_key: "pct_off", label: "Concession" },
  { kind: "tax_withholding", account: ACCOUNTS.wht_receivable, pct_key: "pct_withheld", label: "Tax withheld at source" },
] as const;

function fromFact(db: Db, c: CaseFile, notes: string[], asOf?: string): Proposal | null {
  for (const treatment of FACT_TREATMENTS) {
    const { applicable, refused } = applicableFacts(db, {
      party_id: c.party_id, kind: treatment.kind, entry_date: c.entry_date, amount_cents: c.shortfall_cents, as_of: asOf,
    });
    for (const r of refused) notes.push(`fact ${r.fact_id} not used: ${r.failed_dimension} (${r.detail})`);
    for (const fact of applicable) {
      const pct = fact.value[treatment.pct_key];
      const cents = typeof fact.value.amount_cents === "number" ? fact.value.amount_cents : null;
      const explains = typeof pct === "number" ? Math.round((c.expected_cents * pct) / 100) : cents;
      if (explains !== c.shortfall_cents) {
        notes.push(`fact ${fact.fact_id} explains ${explains ?? "nothing"}, shortfall is ${c.shortfall_cents}: not used`);
        continue;
      }
      const memo = `${treatment.label} per fact ${fact.fact_id}, approved by ${fact.approved_by ?? "unknown"}`;
      const p = base(c, treatment.kind, lastDocApplication(c), [
        { account: treatment.account, debit_cents: c.shortfall_cents, credit_cents: 0, memo },
        { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo },
      ]);
      p.fact_refs = [fact.fact_id];
      p.evidence = factEvidence(db, fact.fact_id);
      return p;
    }
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
