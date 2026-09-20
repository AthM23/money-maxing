import { emit } from "../bus/bus.js";
import { CaseFile } from "../contract/types.js";
import type { Db } from "../ledger/db.js";
import { bankUnmatched, openInvoices, type InvoiceRow, type UnmatchedBankTxn } from "../ledger/read.js";
import { applicableFacts } from "../memory/applicability.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { newId } from "../runtime/ids.js";
import { findRemittance } from "./remittance.js";

export const COMPARATOR = "C2_invoice_vs_cash";
const UNIDENTIFIED = "unidentified";

export type DriftKind = "exact" | "short_pay" | "over_pay" | "no_open_document";

export interface DriftFinding {
  bank_txn_id: string;
  kind: DriftKind;
  intent_id: string;
  /** False when this difference already had an intent: the monitor updates, it never opens a second one. */
  opened: boolean;
  case_file: CaseFile;
  explained_by_fact_id?: string;
}

const usd = (cents: number): string => `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Comparator C2 (sheet 03): cash received vs what the customer owes. Pure code. Each unmatched credit on the bank
 * becomes one intent carrying a CaseFile, the hand-off to the router; whether the difference is acceptable is not
 * decided here. Runs on every sync and is idempotent: one bank line, one intent, however often it runs.
 */
export function runInvoiceVsCash(db: Db, clock: Clock = systemClock): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const run = db.transaction(() => {
    for (const txn of bankUnmatched(db, { side: "credit" })) findings.push(compareOne(db, clock, txn));
  });
  run();
  return findings;
}

function compareOne(db: Db, clock: Clock, txn: UnmatchedBankTxn): DriftFinding {
  const { party_id, docs, remittance, matching_issue } = candidateDocs(db, txn);
  const expected = docs.reduce((n, d) => n + d.open_cents, 0);
  const received = txn.unapplied_cents;
  const shortfall = expected - received;
  const kind: DriftKind = docs.length === 0 ? "no_open_document" : shortfall === 0 ? "exact" : shortfall > 0 ? "short_pay" : "over_pay";
  const dedupeKey = `${COMPARATOR}|${txn.id}`;

  const known = db.prepare("SELECT intent_id, delta_cents FROM drift_case WHERE dedupe_key = ?").get(dedupeKey) as { intent_id: string; delta_cents: number } | undefined;
  if (known) {
    const caseFile = CaseFile.parse(JSON.parse((db.prepare("SELECT case_json FROM intent WHERE id = ?").get(known.intent_id) as { case_json: string }).case_json));
    db.prepare("UPDATE drift_case SET last_seen = ? WHERE dedupe_key = ?").run(clock.now(), dedupeKey);
    return { bank_txn_id: txn.id, kind, intent_id: known.intent_id, opened: false, case_file: caseFile };
  }

  const intentId = newId("int");
  const caseFile = CaseFile.parse({
    intent_id: intentId, function: "ar", party_id, entry_date: txn.posted_date, bank_txn_id: txn.id,
    doc_ids: docs.map((d) => d.id), expected_cents: expected, received_cents: received, shortfall_cents: shortfall,
    method: methodOf(txn.method), trace_ids: [...(txn.trace_id ? [txn.trace_id] : []), ...(remittance ? [remittance.trace_id] : [])], remittance, matching_issue,
  });
  db.prepare("INSERT INTO intent (id, function, question, owner, status, end_condition_json, case_json, created_at) VALUES (?, 'ar', ?, 'ar', 'open', ?, ?, ?)")
    .run(intentId, question(kind, txn, docs, shortfall, payerLabel(db, txn, party_id)), JSON.stringify({ bank_txn_applied: txn.id, docs_settled: docs.map((d) => d.id) }), JSON.stringify(caseFile), clock.now());
  db.prepare("INSERT INTO drift_case (dedupe_key, comparator, intent_id, delta_cents, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
    .run(dedupeKey, COMPARATOR, intentId, shortfall, clock.now(), clock.now());

  const factId = shortfall > 0 ? explainingFact(db, caseFile) : undefined;
  if (factId) {
    // A known fact explains the difference. The cash and the credit still have to be booked, so the intent stays;
    // what changes is that nobody is asked and no model is called (router tier 0 reads the same fact).
    emit(db, { topic: "drift.explained", from_function: "drift", intent_id: intentId, payload: { comparator: COMPARATOR, bank_txn_id: txn.id, party_id, delta_cents: shortfall, explained_by: factId } }, clock);
  }
  emit(db, {
    topic: "bankrec.unmatched", from_function: "drift", intent_id: intentId,
    payload: { side: "credit", comparator: COMPARATOR, kind, bank_txn_id: txn.id, party_id, doc_ids: caseFile.doc_ids, expected_cents: expected, received_cents: received, shortfall_cents: shortfall },
  }, clock);
  return { bank_txn_id: txn.id, kind, intent_id: intentId, opened: true, case_file: caseFile, explained_by_fact_id: factId };
}

/**
 * Which documents the money relates to. Join order (sheet 03, C2): invoice numbers in the remittance text, else
 * amount against the payer's open invoices. A payer with nothing open is checked against its subsidiaries for an
 * exact amount only; the case then names the subsidiary, and the kernel's party tie decides whether that stands.
 */
function candidateDocs(db: Db, txn: UnmatchedBankTxn): { party_id: string; docs: InvoiceRow[]; remittance?: CaseFile["remittance"]; matching_issue?: string } {
  const payer = txn.party_id ?? UNIDENTIFIED;
  const unresolved = (reason: string) => ({ party_id: payer, docs: [], matching_issue: reason });
  if (!txn.party_id) return unresolved("Payer is unidentified; invoice references alone do not establish the payer.");
  const remits = findRemittance(db, txn);
  if (remits.length > 1) return unresolved("Multiple remittances match this payment; resolve the conflicting instructions.");
  if (remits.length === 1) {
    const remit = remits[0]!;
    const open = openInvoices(db, payer);
    const named = remit.data.applications.map(a => open.find(d => d.id === a.doc_id));
    if (named.some((d, i) => !d || remit.data.applications[i]!.amount_cents > d.open_cents)) return unresolved("Remittance names a missing, foreign, settled or over-allocated invoice.");
    const docs = named as InvoiceRow[];
    // One short line follows the same investigation path as a single short-paid invoice.
    docs.sort((a, b) => Number(a.open_cents > remit.data.applications.find(x => x.doc_id === a.id)!.amount_cents)
      - Number(b.open_cents > remit.data.applications.find(x => x.doc_id === b.id)!.amount_cents));
    return { party_id: payer, docs, remittance: { trace_id: remit.trace_id, applications: remit.data.applications } };
  }
  const refs = [...new Set(txn.descriptor.match(/INV-\d+/g) ?? [])];
  if (refs.length > 0) {
    const all = openInvoices(db);
    const named = refs.map((r) => all.find((i) => i.id === r)).filter((i): i is InvoiceRow => i !== undefined);
    const owner = named[0]?.party_id;
    if (owner && named.length === refs.length && named.every((i) => i.party_id === owner) && txn.party_id === owner) return { party_id: owner, docs: named };
    return unresolved("Explicit invoice references do not all resolve to open invoices for this payer.");
  }
  const own = openInvoices(db, payer);
  if (own.length > 0) {
    const docs = covering(own, txn.unapplied_cents);
    return docs.length ? { party_id: payer, docs } : unresolved("No unique invoice allocation; obtain the customer's remittance.");
  }

  const subsidiaries = db.prepare("SELECT id FROM party WHERE parent_id = ?").all(payer) as { id: string }[];
  const exact = subsidiaries.flatMap(s => openInvoices(db, s.id).filter(i => i.open_cents === txn.unapplied_cents));
  if (exact.length === 1) return { party_id: exact[0]!.party_id, docs: exact };
  if (exact.length > 1) return unresolved("Multiple subsidiary invoices match the receipt.");
  return { party_id: payer, docs: [] };
}

/** A single invoice, or a unique exact subset. A search limit means unresolved, never first-match wins. */
function covering(open: InvoiceRow[], cents: number): InvoiceRow[] {
  if (open.length === 1) return open;
  if (open.length > 24) return [];
  const matches: InvoiceRow[][] = [];
  let visits = 0;
  function visit(i: number, sum: number, chosen: InvoiceRow[]): void {
    if (++visits > 20_000 || matches.length > 1 || sum > cents) return;
    if (sum === cents) { matches.push(chosen); return; }
    if (i === open.length) return;
    visit(i + 1, sum + open[i]!.open_cents, [...chosen, open[i]!]);
    visit(i + 1, sum, chosen);
  }
  visit(0, 0, []);
  return visits <= 20_000 && matches.length === 1 ? matches[0]! : [];
}

function explainingFact(db: Db, c: CaseFile): string | undefined {
  const { applicable } = applicableFacts(db, { party_id: c.party_id, kind: "credit_memo", entry_date: c.entry_date, amount_cents: c.shortfall_cents });
  for (const f of applicable) {
    const pct = typeof f.value.pct_off === "number" ? Math.round((c.expected_cents * f.value.pct_off) / 100) : null;
    const flat = typeof f.value.amount_cents === "number" ? f.value.amount_cents : null;
    if ((pct ?? flat) === c.shortfall_cents) return f.fact_id;
  }
  return undefined;
}

function question(kind: DriftKind, txn: UnmatchedBankTxn, docs: InvoiceRow[], shortfall: number, party: string): string {
  const ids = docs.map((d) => d.id).join(", ");
  switch (kind) {
    case "exact": return `Apply ${usd(txn.unapplied_cents)} from ${party} to ${ids}`;
    case "short_pay": return `Resolve the ${usd(shortfall)} shortfall on ${ids}`;
    case "over_pay": return `${party} paid ${usd(shortfall)} more than ${ids}: apply and explain the excess`;
    case "no_open_document": return `Identify the ${usd(txn.unapplied_cents)} deposit "${txn.descriptor}": no open invoice for ${party}`;
  }
}

/** Names the payer, and the customer too when they differ (a parent paying for a subsidiary). */
function payerLabel(db: Db, txn: UnmatchedBankTxn, casePartyId: string): string {
  if (!txn.party_id || txn.party_id === casePartyId) return partyName(db, casePartyId);
  return `${partyName(db, txn.party_id)} (for ${partyName(db, casePartyId)})`;
}

function partyName(db: Db, id: string): string {
  return (db.prepare("SELECT name FROM party WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;
}

function methodOf(m: string | null): CaseFile["method"] {
  return m === "ach" || m === "wire" || m === "check" || m === "card" ? m : "other";
}
