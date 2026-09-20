import { createHash } from "node:crypto";
import type { Evidence, Mark, MarkClass, Proposal } from "../contract/types.js";
import { MARK_CLASSES } from "../contract/types.js";
import type { Db } from "../ledger/db.js";

/**
 * Pure builders for what the mirror sends to QuickBooks. Nothing here touches the network, and only the two text
 * builders read the database. Shapes verified READ-ONLY against the sandbox on 2026-09-19: QuickBooks' own
 * credit-to-invoice link is a Payment with TotalAmt 0 and two lines of the same Amount, one LinkedTxn Invoice and one
 * LinkedTxn CreditMemo; a CreditMemo line is a SalesItemLineDetail with ItemRef, Qty, UnitPrice. No create was run.
 */

const DOC_NUMBER_MAX = 21; // QBO DocNumber and PaymentRefNum both stop at 21 characters
const PRIVATE_NOTE_MAX = 4000;

/** Integer cents → "1200.00" by string operations only: no division, so no float can touch the amount. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`amount must be integer cents, got ${cents}`);
  const digits = String(Math.abs(cents)).padStart(3, "0");
  return `${cents < 0 ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * The JSON number QuickBooks wants. Parsing a 2dp decimal string yields the nearest double, and JSON.stringify prints
 * that double back as the same decimal (12345.67 → 12345.67), so the wire text equals `centsToDecimal` minus trailing
 * zeros. No arithmetic is done on the result.
 */
export function centsToAmount(cents: number): number {
  return Number(centsToDecimal(cents));
}

/** The marker every mirrored object carries, so a human in QuickBooks (and a later run) can find the decision. */
export function marker(decisionId: string): string {
  return `fn:${decisionId}`;
}

/**
 * `CM-<invoice>` for the first credit memo against an invoice, `CM-<invoice>-2`, `-3`… for later ones. `seq` is the
 * memo's rank among the posted credit_memo decisions on that invoice, so the number is the same after a local reset
 * (QuickBooks keeps the object, the local decision ids do not survive). The suffix always survives the 21-char cut.
 */
export function creditMemoDocNumber(invoiceId: string, seq = 1): string {
  return adjustmentDocNumber("CM", invoiceId, seq);
}

/** The same numbering for any non-cash adjustment to an invoice: `FX-INV-3201`, `WO-INV-3201-2`. */
export function adjustmentDocNumber(prefix: string, invoiceId: string, seq = 1): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error(`adjustment sequence must be a positive integer, got ${seq}`);
  const suffix = seq > 1 ? `-${seq}` : "";
  return `${`${prefix}-${invoiceId}`.slice(0, DOC_NUMBER_MAX - suffix.length)}${suffix}`;
}

const REQUEST_ID_MAX = 50; // Intuit's limit on the `requestid` query parameter

/**
 * The idempotency key of one create: sha256 of the step kind and the object's NATURAL key, never of a decision id
 * (random per run). Same object after a reset → same key, so a replayed POST cannot make a second one.
 * UNVERIFIED against the sandbox: that Intuit answers a repeated `requestid` with the original response, and what it
 * does when the original object has since been deleted in QuickBooks (it may hand back the dead Id).
 */
export function mirrorRequestId(kind: string, naturalKey: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([kind, ...naturalKey])).digest("hex").slice(0, REQUEST_ID_MAX);
}

export function paymentRefNum(bankTxnId: string): string {
  return bankTxnId.slice(0, DOC_NUMBER_MAX);
}

/** One invoice a payment or a credit is applied to: the QuickBooks Invoice Id and the amount applied. */
export interface InvoiceApplication { qbo_invoice_id: string; amount_cents: number }

function positive(cents: number, what: string): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(`${what} must be a positive integer number of cents, got ${cents}`);
  return cents;
}

function sumCents(lines: InvoiceApplication[]): number {
  if (lines.length === 0) throw new Error("nothing to apply: no invoice lines");
  return lines.reduce((sum, l) => sum + positive(l.amount_cents, "applied amount"), 0);
}

function invoiceLine(l: InvoiceApplication): Record<string, unknown> {
  return { Amount: centsToAmount(l.amount_cents), LinkedTxn: [{ TxnId: l.qbo_invoice_id, TxnType: "Invoice" }] };
}

export interface PaymentInput {
  decision_id: string;
  customer_id: string;
  entry_date: string;
  bank_txn_id: string | null;
  lines: InvoiceApplication[];
}

/** `apply_payment` → Payment. No DepositToAccountRef: QuickBooks then parks the cash in Undeposited Funds (its default). */
export function paymentBody(p: PaymentInput): Record<string, unknown> {
  return {
    CustomerRef: { value: p.customer_id },
    TotalAmt: centsToAmount(sumCents(p.lines)),
    TxnDate: p.entry_date,
    ...(p.bank_txn_id ? { PaymentRefNum: paymentRefNum(p.bank_txn_id) } : {}),
    PrivateNote: marker(p.decision_id),
    Line: p.lines.map(invoiceLine),
  };
}

export interface CreditMemoInput {
  decision_id: string;
  customer_id: string;
  entry_date: string;
  /** Local invoice id (INV-1042): it names the memo. */
  invoice_id: string;
  /** Rank among the posted credit memos on that invoice (default 1): see `creditMemoDocNumber`. */
  seq?: number;
  item_id: string;
  memo_cents: number;
  /** First evidence claim, so the reason is readable inside QuickBooks. */
  claim: string | null;
}

export function creditMemoBody(c: CreditMemoInput): Record<string, unknown> {
  const amount = centsToAmount(positive(c.memo_cents, "credit memo amount"));
  return {
    CustomerRef: { value: c.customer_id },
    TxnDate: c.entry_date,
    DocNumber: creditMemoDocNumber(c.invoice_id, c.seq),
    PrivateNote: `${marker(c.decision_id)}${c.claim ? ` ${c.claim}` : ""}`.slice(0, PRIVATE_NOTE_MAX),
    Line: [{
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      Description: `Credit against ${c.invoice_id}`,
      SalesItemLineDetail: { ItemRef: { value: c.item_id }, Qty: 1, UnitPrice: amount },
    }],
  };
}

export interface ApplyCreditInput {
  decision_id: string;
  customer_id: string;
  entry_date: string;
  /** Local invoice id, for the reference number only. */
  invoice_id: string;
  /** The memo's sequence (default 1), so the reference number repeats the memo's DocNumber. */
  seq?: number;
  credit_memo_id: string;
  lines: InvoiceApplication[];
}

/**
 * The API has no "apply credit" call: a Payment of zero whose lines link the invoice(s) and the credit memo for the
 * same total is what applies it. PaymentRefNum repeats the memo's DocNumber so a later run can find it by query.
 */
export function applyCreditBody(a: ApplyCreditInput): Record<string, unknown> {
  return {
    CustomerRef: { value: a.customer_id },
    TotalAmt: 0,
    TxnDate: a.entry_date,
    PaymentRefNum: creditMemoDocNumber(a.invoice_id, a.seq),
    PrivateNote: `${marker(a.decision_id)} credit memo applied`,
    Line: [
      ...a.lines.map(invoiceLine),
      { Amount: centsToAmount(sumCents(a.lines)), LinkedTxn: [{ TxnId: a.credit_memo_id, TxnType: "CreditMemo" }] },
    ],
  };
}

export interface JournalDebit { qbo_account_id: string; amount_cents: number; memo: string }

export interface ArJournalInput {
  decision_id: string;
  customer_id: string;
  entry_date: string;
  doc_number: string;
  /** The company's A/R account. */
  ar_account_id: string;
  /** What the local entry debited (realised FX, bank charges, ...), account by account. */
  debits: JournalDebit[];
  claim: string | null;
}

/**
 * A non-cash AR adjustment (`fx_realized`, `write_off`, `tax_withholding`) → JournalEntry: the local entry's debits,
 * and one credit to A/R carrying the customer, which QuickBooks requires on an A/R line and which makes the credit
 * appliable to that customer's invoice. Verified against the sandbox on 2026-09-20 with a create-and-delete probe; the
 * JournalEntry QuickBooks hands back carries TotalAmt 0, so an existing one is recognised by its A/R line, never by TotalAmt.
 */
export function arJournalBody(j: ArJournalInput): Record<string, unknown> {
  if (j.debits.length === 0) throw new Error("nothing to journal: no debit lines");
  const total = j.debits.reduce((sum, d) => sum + positive(d.amount_cents, "journal debit"), 0);
  const line = (cents: number, memo: string, detail: Record<string, unknown>): Record<string, unknown> =>
    ({ DetailType: "JournalEntryLineDetail", Amount: centsToAmount(cents), Description: memo, JournalEntryLineDetail: detail });
  return {
    TxnDate: j.entry_date,
    DocNumber: j.doc_number,
    PrivateNote: `${marker(j.decision_id)}${j.claim ? ` ${j.claim}` : ""}`.slice(0, PRIVATE_NOTE_MAX),
    Line: [
      ...j.debits.map((d) => line(d.amount_cents, d.memo, { PostingType: "Debit", AccountRef: { value: d.qbo_account_id } })),
      line(total, j.debits[0]!.memo, { PostingType: "Credit", AccountRef: { value: j.ar_account_id }, Entity: { Type: "Customer", EntityRef: { value: j.customer_id } } }),
    ],
  };
}

export interface ApplyJournalInput {
  decision_id: string;
  customer_id: string;
  entry_date: string;
  doc_number: string;
  journal_entry_id: string;
  lines: InvoiceApplication[];
}

/**
 * The zero Payment that takes the JournalEntry's A/R credit off the invoice(s): the same shape as `applyCreditBody`.
 * Without it QuickBooks shows the customer's total right and the invoice still fully open.
 * Verified against the sandbox on 2026-09-20: INV-3201 went from 110,000.00 to 108,040.00 open, and back on delete.
 */
export function applyJournalBody(a: ApplyJournalInput): Record<string, unknown> {
  return {
    CustomerRef: { value: a.customer_id },
    TotalAmt: 0,
    TxnDate: a.entry_date,
    PaymentRefNum: a.doc_number,
    PrivateNote: `${marker(a.decision_id)} journal entry applied`,
    Line: [
      ...a.lines.map(invoiceLine),
      { Amount: centsToAmount(sumCents(a.lines)), LinkedTxn: [{ TxnId: a.journal_entry_id, TxnType: "JournalEntry" }] },
    ],
  };
}

// ───────────── the two attachments

interface DecisionRow {
  id: string; intent_id: string; function: string; kind: string; route: string | null; actor: string;
  autonomy_level: string; tier: number | null; proposal_json: string | null; posted_at: string | null; created_at: string;
}
interface ApprovalRow { approver_id: string; approver_kind: string; outcome: string; note: string | null; approved_at: string }
interface WorkpaperRow { id: string; marks_json: string; kernel_verdict: string; checkable_num: number; checkable_den: number; created_at: string }
interface EntryRow { id: string; date: string; memo: string }
interface LineRow { line_no: number; account: string; debit_cents: number; credit_cents: number }

const MARK_TITLES: Record<MarkClass, string> = { F: "F  footed / recomputed", E: "E  agreed to source", P: "P  approved by", J: "J  per policy / judgment" };

export function readProposal(proposalJson: string | null): Proposal | null {
  if (!proposalJson) return null;
  try { return JSON.parse(proposalJson) as Proposal; } catch { return null; }
}

/** The decision's workpaper as plain text: what an auditor opening the credit memo in QuickBooks needs to see. */
export function workpaperText(db: Db, decisionId: string): string {
  const d = db.prepare("SELECT * FROM decision WHERE id = ?").get(decisionId) as DecisionRow | undefined;
  if (!d) throw new Error(`decision ${decisionId} not found`);
  const proposal = readProposal(d.proposal_json);
  return [
    ...headerSection(db, d, proposal),
    "",
    ...entrySection(db, decisionId),
    "",
    ...marksSection(db, decisionId),
    "",
    ...evidenceSection(proposal?.evidence ?? []),
    "",
  ].join("\n");
}

function headerSection(db: Db, d: DecisionRow, proposal: Proposal | null): string[] {
  const approvals = db.prepare("SELECT approver_id, approver_kind, outcome, note, approved_at FROM approval WHERE decision_id = ? ORDER BY approved_at, rowid").all(d.id) as ApprovalRow[];
  const lines = [
    `WORKPAPER ${d.id}`,
    `Kind:       ${d.kind}`,
    `Function:   ${d.function}`,
    `Intent:     ${d.intent_id}`,
    `Route:      ${d.route ?? "(none)"}`,
    `Actor:      ${d.actor} (autonomy ${d.autonomy_level}${d.tier !== null ? `, tier ${d.tier}` : ""})`,
    `Party:      ${proposal?.party_id ?? "(unknown)"}`,
    `Entry date: ${proposal?.entry_date ?? "(unknown)"}`,
    `Posted at:  ${d.posted_at ?? "(not posted)"}`,
  ];
  if (approvals.length === 0) lines.push("Approval:   none recorded (posted on the agent's own authority)");
  for (const a of approvals) lines.push(`Approval:   ${a.outcome} by ${a.approver_id} (${a.approver_kind}) at ${a.approved_at}${a.note ? `: ${a.note}` : ""}`);
  return lines;
}

function entrySection(db: Db, decisionId: string): string[] {
  const entries = db.prepare("SELECT id, date, memo FROM gl_entry WHERE source_decision_id = ? ORDER BY posted_at, id").all(decisionId) as EntryRow[];
  if (entries.length === 0) return ["ENTRY", "  (no ledger entry)"];
  const out: string[] = [];
  for (const e of entries) {
    const rows = db.prepare("SELECT line_no, account, debit_cents, credit_cents FROM gl_line WHERE entry_id = ? ORDER BY line_no").all(e.id) as LineRow[];
    out.push(`ENTRY ${e.id}  ${e.date}  ${e.memo}`, `  ${"account".padEnd(10)}${"debit".padStart(14)}${"credit".padStart(14)}`);
    for (const r of rows) {
      const debit = r.debit_cents > 0 ? centsToDecimal(r.debit_cents) : "";
      const credit = r.credit_cents > 0 ? centsToDecimal(r.credit_cents) : "";
      out.push(`  ${r.account.padEnd(10)}${debit.padStart(14)}${credit.padStart(14)}`.trimEnd());
    }
  }
  return out;
}

/** The LATEST workpaper row: the post gate re-runs the kernel with the approver, and that is the one that let it post. */
function marksSection(db: Db, decisionId: string): string[] {
  const wp = db.prepare("SELECT * FROM workpaper WHERE decision_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(decisionId) as WorkpaperRow | undefined;
  if (!wp) return ["KERNEL MARKS", "  (no workpaper recorded)"];
  let parsed: { stage?: string; marks?: Mark[] } = {};
  try { parsed = JSON.parse(wp.marks_json) as typeof parsed; } catch { /* an unreadable workpaper prints as having no marks */ }
  const marks = Array.isArray(parsed.marks) ? parsed.marks : [];
  const out = [`KERNEL MARKS  workpaper ${wp.id}, stage ${parsed.stage ?? "?"}, verdict ${wp.kernel_verdict}, ${wp.checkable_num}/${wp.checkable_den} re-performed by the kernel`];
  for (const cls of MARK_CLASSES) {
    const group = marks.filter((m) => m.cls === cls);
    out.push(MARK_TITLES[cls]);
    if (group.length === 0) out.push("  (none)");
    for (const m of group) out.push(`  [${m.status}] ${m.check}: ${m.detail}${m.refs?.length ? ` (refs ${m.refs.join(", ")})` : ""}`);
  }
  return out;
}

function evidenceSection(evidence: Evidence[]): string[] {
  if (evidence.length === 0) return ["EVIDENCE", "  (none cited)"];
  const out = ["EVIDENCE"];
  evidence.forEach((ev, i) => {
    out.push(`  ${i + 1}. ${ev.claim}`, `     trace ${ev.trace_id}`);
    if (ev.quote) out.push(`     "${ev.quote}"`);
  });
  return out;
}

interface TraceRow { id: string; source: string; external_id: string; event_time: string; payload_json: string }

function headerValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return typeof v === "string" ? v : "";
}

/**
 * The source email as text: headers then body. A gmail trace payload is `{thread_id, from, to[], cc[], subject, date,
 * body}` (src/connectors/local.ts); older fixtures carry only from/subject/body, so every header is optional.
 */
export function sourceEmailText(db: Db, traceId: string): string {
  const t = db.prepare("SELECT id, source, external_id, event_time, payload_json FROM trace WHERE id = ?").get(traceId) as TraceRow | undefined;
  if (!t) throw new Error(`trace ${traceId} not found`);
  let p: Record<string, unknown> = {};
  try { p = JSON.parse(t.payload_json) as Record<string, unknown>; } catch { /* headers stay empty, the raw payload becomes the body */ }
  const headers: Array<[string, string]> = [
    ["From", headerValue(p.from)], ["To", headerValue(p.to)], ["Cc", headerValue(p.cc)], ["Subject", headerValue(p.subject)],
    ["Date", headerValue(p.date) || t.event_time], ["Thread", headerValue(p.thread_id)], ["Trace", `${t.id} (${t.source} ${t.external_id})`],
  ];
  const body = typeof p.body === "string" ? p.body : t.payload_json;
  return `${headers.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${body}\n`;
}
