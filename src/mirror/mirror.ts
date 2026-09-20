import { poll, type BusEvent } from "../bus/bus.js";
import { qboEscape } from "../connectors/qboClient.js";
import { ACCOUNTS } from "../contract/accounts.js";
import type { Topic } from "../contract/topics.js";
import type { Proposal } from "../contract/types.js";
import { recordRipple } from "../engines/ripple.js";
import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { QBO_ACCOUNTS, QBO_ITEM_NAME, QBO_ITEM_WORLD_ID, QBO_SYSTEM, qboAccountFindSql, qboAccountWorldId } from "../seed/quickbooks.js";
import {
  adjustmentDocNumber, applyCreditBody, applyJournalBody, arJournalBody, centsToAmount, centsToDecimal, creditMemoBody, creditMemoDocNumber,
  marker, mirrorRequestId, paymentBody, paymentRefNum, readProposal, sourceEmailText, workpaperText, type InvoiceApplication, type JournalDebit,
} from "./payloads.js";
import { attachableMetadata, type QboLike, type QboObject, type QboUpload } from "./types.js";

/**
 * One-way mirror: the local ledger is the system of record, QuickBooks shows what was accepted. Every object is one
 * `mirror_log` row keyed (decision, 'quickbooks', kind); a 'mirrored' row is final, anything else is tried again by
 * the next LIVE pass, which is what lets a dry run (it consumes the bus events) be followed by a live one.
 *
 * Identity IN QuickBooks is the object's NATURAL key, not the `fn:<decision_id>` marker: decision ids are random per
 * run and the local database is reset between demo runs while QuickBooks keeps everything. Cash Payment:
 * PaymentRefNum (the bank txn id) + customer. CreditMemo: DocNumber + customer. Credit application: the zero Payment
 * linking this CreditMemo and this Invoice. A non-cash AR adjustment (realised FX, a written-off bank fee, tax withheld)
 * is a JournalEntry, DocNumber `FX-<invoice>` / `WO-<invoice>` / `WHT-<invoice>`, applied by a zero Payment the same way.
 * Key and amount agree → adopt, whatever the marker. Key matches but the amount or customer does not → create nothing
 * and fail the step, for a human to look at.
 */

export const MIRROR_SUBSCRIBER = "qbo-mirror";
export const MIRROR_TOPICS: readonly Topic[] = ["ar.payment.applied", "ar.credit_memo.posted", "entry.posted"];
export const JOURNAL_ENTRY_NOT_BUILT = "JournalEntry mirror covers non-cash AR adjustments only (fx_realized, write_off, tax_withholding)";
/** Kinds that take an amount off an invoice without cash, and the DocNumber prefix their JournalEntry carries. */
const AR_ADJUSTMENT_PREFIX: Readonly<Record<string, string>> = { fx_realized: "FX", write_off: "WO", tax_withholding: "WHT" };
/** Prefix of the 'skipped' detail that IS worth retrying: the mapping appears once QuickBooks has been seeded. */
export const NO_MAPPING = "no QuickBooks mapping";

export type MirrorStatus = "mirrored" | "dry_run" | "skipped" | "failed";
export interface MirrorStep {
  decision_id: string; kind: string; status: MirrorStatus; external_id: string | null; detail: string | null;
  /** False when the step only repeated its previous outcome (a retry that failed or was skipped again): a caller looping until nothing moves must not count it. */
  fresh: boolean;
}
export interface MirrorOpts { client?: QboLike; dry_run?: boolean }
export interface MirrorResult { events: number; retried: number; steps: MirrorStep[] }

interface Pass { db: Db; clock: Clock; client: QboLike | null; steps: MirrorStep[]; done: Set<string> }
interface Target { decision_id: string; intent_id: string; event_id: number | null; kind: string; proposal: Proposal | null }
interface LogRow { status: MirrorStatus; external_id: string | null; detail: string | null }

/** What `find` saw in QuickBooks: the object to adopt, or one that holds the natural key but disagrees (never created over). */
type Found = { adopt: QboObject } | { conflict: QboObject; detail?: string } | undefined;

interface StepSpec {
  kind: string;
  /** The QuickBooks entity the step makes: named in the 'adopted existing ...' detail. */
  entity: string;
  ripple_kind: string;
  /** What a dry run records in `detail`: exactly what a live run would send. */
  preview: unknown;
  summary: string;
  delta_cents?: number;
  /** Look for an object an earlier, interrupted run (or QuickBooks itself) already made. Adopted instead of duplicated. */
  find: (c: QboLike) => Promise<Found>;
  /**
   * `salt` is empty on the first try. It goes into the create's `requestid`, and carries the dead Ids of earlier
   * replays: see `createForReal`. An upload has no `requestid` and ignores it.
   */
  act: (c: QboLike, salt: readonly string[]) => Promise<QboObject>;
}

/** How many dead objects one natural key may have behind it: one per `pnpm mirror --reset` since the key was first used. */
const MAX_REPLAYS = 25;

/**
 * Seen live on 2026-09-20: after an object is deleted in QuickBooks, a create under the same `requestid` makes nothing
 * and answers with the ORIGINAL response, dead Id and all. So every create is checked by Id, and a replay is sent again
 * under a `requestid` salted with the dead Ids so far: still a pure function of the natural key and of what QuickBooks
 * itself said, so a retried POST stays idempotent and no local state has to survive a reset.
 */
async function createForReal(c: QboLike, spec: StepSpec): Promise<QboObject> {
  const dead: string[] = [];
  for (;;) {
    const obj = await spec.act(c, dead);
    if (spec.entity === "Attachable" || typeof obj.Id !== "string" || obj.Id === "") return obj;
    if ((await c.query(`select * from ${spec.entity} where Id = '${qboEscape(obj.Id)}'`)).length > 0) return obj;
    if (dead.includes(obj.Id) || dead.length >= MAX_REPLAYS) throw new Error(`QuickBooks keeps answering the ${spec.kind} create with deleted object ${obj.Id}`);
    dead.push(obj.Id);
  }
}

const SPECIFIC_KINDS: ReadonlySet<string> = new Set(["apply_payment", "credit_memo"]);

/** New events first, then (live only) every decision whose earlier attempt was a dry run, a failure or a missing mapping. */
export async function mirrorOnce(db: Db, opts: MirrorOpts = {}, clock: Clock = systemClock): Promise<MirrorResult> {
  const pass: Pass = { db, clock, client: opts.dry_run || !opts.client ? null : opts.client, steps: [], done: new Set() };
  const events = await poll(db, MIRROR_SUBSCRIBER, MIRROR_TOPICS, async (e: BusEvent) => {
    const decisionId = typeof e.payload.decision_id === "string" ? e.payload.decision_id : "";
    // apply_payment and credit_memo arrive twice (their own topic and entry.posted): the specific topic owns them
    if (decisionId === "" || (e.topic === "entry.posted" && SPECIFIC_KINDS.has(String(e.payload.kind)))) return;
    await mirrorDecision(pass, decisionId, e.intent_id, e.id);
  });
  let retried = 0;
  if (pass.client) {
    const rows = db.prepare(
      // rowid order = the order the decisions first reached the mirror (an upsert keeps its rowid)
      `SELECT decision_id FROM mirror_log WHERE system = ? AND (status IN ('failed','dry_run') OR (status = 'skipped' AND detail LIKE ?)) GROUP BY decision_id ORDER BY MIN(rowid)`,
    ).all(QBO_SYSTEM, `${NO_MAPPING}%`) as { decision_id: string }[];
    for (const r of rows) {
      if (pass.done.has(r.decision_id)) continue;
      retried++;
      await mirrorDecision(pass, r.decision_id, null, null);
    }
  }
  return { events, retried, steps: pass.steps };
}

/** Never throws: a handler that throws would hold the bus cursor on this event for ever. */
async function mirrorDecision(pass: Pass, decisionId: string, intentId: string | null, eventId: number | null): Promise<void> {
  if (pass.done.has(decisionId)) return;
  pass.done.add(decisionId);
  const d = pass.db.prepare("SELECT intent_id, kind, proposal_json FROM decision WHERE id = ?").get(decisionId) as { intent_id: string; kind: string; proposal_json: string | null } | undefined;
  const kind = d?.kind ?? "";
  const primary = kind === "apply_payment" ? "Payment" : kind === "credit_memo" ? "CreditMemo" : "JournalEntry";
  if (!d) return logStep(pass, decisionId, primary, "skipped", null, "decision not found in the local ledger");
  const t: Target = { decision_id: decisionId, intent_id: intentId ?? d.intent_id, event_id: eventId, kind, proposal: readProposal(d.proposal_json) };
  try {
    if (kind === "apply_payment") await mirrorPayment(pass, t);
    else if (kind === "credit_memo") await mirrorCreditMemo(pass, t);
    else if (AR_ADJUSTMENT_PREFIX[kind] !== undefined) await mirrorArAdjustment(pass, t, AR_ADJUSTMENT_PREFIX[kind]);
    else if (!logRow(pass.db, decisionId, primary)) logStep(pass, decisionId, primary, "skipped", null, JOURNAL_ENTRY_NOT_BUILT);
  } catch (err) {
    logStep(pass, decisionId, primary, "failed", null, message(err));
  }
}

async function mirrorPayment(pass: Pass, t: Target): Promise<void> {
  if (logRow(pass.db, t.decision_id, "Payment")?.status === "mirrored") return;
  const ids = await resolveIds(pass, t, "Payment", false);
  if (!ids || !t.proposal) return;
  const p = t.proposal;
  const body = paymentBody({ decision_id: t.decision_id, customer_id: ids.customer_id, entry_date: p.entry_date, bank_txn_id: p.bank_txn_id ?? null, lines: ids.lines });
  const cents = total(ids.lines);
  const invoiceIds = ids.lines.map((l) => l.qbo_invoice_id);
  const refNum = p.bank_txn_id ? paymentRefNum(p.bank_txn_id) : null;
  // No bank txn id: the nearest thing to a natural key is customer + date + amount + the invoices it pays.
  const naturalKey = refNum !== null ? [refNum, ids.customer_id] : [ids.customer_id, p.entry_date, centsToDecimal(cents), ...invoiceIds];
  await runStep(pass, t, {
    kind: "Payment", entity: "Payment", ripple_kind: "qbo_payment", preview: body,
    summary: `QuickBooks Payment of $${centsToDecimal(cents)} applied to ${docIds(p)}`,
    find: async (c) => {
      if (refNum !== null) return byNaturalKey(await c.query(`select * from Payment where PaymentRefNum = '${qboEscape(refNum)}'`), ids.customer_id, cents, t.decision_id);
      const sameDay = await c.query(`select * from Payment where CustomerRef = '${qboEscape(ids.customer_id)}' and TxnDate = '${qboEscape(p.entry_date)}'`);
      const same = sameDay.filter((o) => amountIs(o, cents) && sameSet(linkedIds(o, "Invoice"), invoiceIds));
      const adopt = same.find((o) => hasMarker(o, t.decision_id)) ?? same[0];
      return adopt ? { adopt } : undefined;
    },
    act: (c, salt) => c.create("Payment", body, { requestId: mirrorRequestId("Payment", [...naturalKey, ...salt]) }),
  });
}

async function mirrorCreditMemo(pass: Pass, t: Target): Promise<void> {
  const ids = await resolveIds(pass, t, "CreditMemo", true);
  if (!ids || !t.proposal || ids.item_id === undefined) return;
  const p = t.proposal;
  const invoiceId = p.applications[0]!.doc_id; // resolveIds refused an empty list
  const memoCents = total(ids.lines);
  const seq = adjustmentSeq(pass.db, t.decision_id, "credit_memo", invoiceId);
  const docNumber = creditMemoDocNumber(invoiceId, seq);
  const body = creditMemoBody({ decision_id: t.decision_id, customer_id: ids.customer_id, entry_date: p.entry_date, invoice_id: invoiceId, seq, item_id: ids.item_id, memo_cents: memoCents, claim: p.evidence[0]?.claim ?? null });
  const memoId = await runStep(pass, t, {
    kind: "CreditMemo", entity: "CreditMemo", ripple_kind: "qbo_credit_memo", preview: body, delta_cents: -memoCents,
    summary: `QuickBooks CreditMemo ${docNumber} for $${centsToDecimal(memoCents)}`,
    find: async (c) => byNaturalKey(await c.query(`select * from CreditMemo where DocNumber = '${qboEscape(docNumber)}'`), ids.customer_id, memoCents, t.decision_id),
    act: (c, salt) => c.create("CreditMemo", body, { requestId: mirrorRequestId("CreditMemo", [docNumber, ids.customer_id, ...salt]) }),
  });
  if (memoId === null) return; // the failed CreditMemo row brings the whole decision back on the next live pass
  const apply = applyCreditBody({ decision_id: t.decision_id, customer_id: ids.customer_id, entry_date: p.entry_date, invoice_id: invoiceId, seq, credit_memo_id: memoId, lines: ids.lines });
  const invoiceIds = ids.lines.map((l) => l.qbo_invoice_id);
  await runStep(pass, t, {
    kind: "CreditApplication", entity: "Payment", ripple_kind: "qbo_credit_applied", preview: apply,
    summary: `QuickBooks zero-amount Payment applying credit memo ${docNumber} to ${docIds(p)}`,
    // Also catches QuickBooks' own link: this sandbox has AutoApplyCredit on, which makes the same zero Payment itself.
    // Only a zero Payment linking THIS memo and exactly THIS invoice is the application. One that spends the memo on
    // another invoice is never adopted, and nothing is created over it: the credit is no longer there to apply.
    find: async (c) => {
      const zero = (await c.query(`select * from Payment where CustomerRef = '${qboEscape(ids.customer_id)}' maxresults 1000`))
        .filter((o) => amountIs(o, 0) && linkedIds(o, "CreditMemo").includes(memoId));
      const adopt = zero.find((o) => sameSet(linkedIds(o, "Invoice"), invoiceIds));
      if (adopt) return { adopt };
      return zero[0] ? { conflict: zero[0], detail: `credit memo ${memoId} is already applied to a different invoice by Payment ${String(zero[0].Id)}` } : undefined;
    },
    act: (c, salt) => c.create("Payment", apply, { requestId: mirrorRequestId("CreditApplication", [docNumber, ids.customer_id, memoId, ...invoiceIds, ...salt]) }),
  });
  await attachAll(pass, t, memoId, docNumber);
}

interface GlLine { account: string; debit_cents: number; credit_cents: number; memo: string }

/** Why the posted entry is not "Dr accounts QuickBooks has a counterpart for, Cr A/R for what the proposal applies", or null when it is. */
function notPlainArAdjustment(lines: GlLine[], appliedCents: number): string | null {
  if (lines.length === 0) return "it has no ledger entry";
  const odd = lines.find((l) => (l.credit_cents > 0 ? l.account !== ACCOUNTS.ar : l.account === ACCOUNTS.ar || QBO_ACCOUNTS[l.account] === undefined));
  if (odd) return `it ${odd.credit_cents > 0 ? "credits" : "debits"} account ${odd.account}`;
  const arCredit = lines.reduce((sum, l) => sum + l.credit_cents, 0);
  return arCredit === appliedCents ? null : `it credits A/R ${centsToDecimal(arCredit)} but applies ${centsToDecimal(appliedCents)} to invoices`;
}

/**
 * Dr what the local entry debited, Cr A/R for the customer, then the zero Payment that takes it off the invoice. The
 * lines come from the posted ledger entry, not the proposal, so QuickBooks gets what the books got. An entry of any
 * other shape is skipped and says why.
 */
async function mirrorArAdjustment(pass: Pass, t: Target, prefix: string): Promise<void> {
  if (logRow(pass.db, t.decision_id, "JournalApplication")?.status === "mirrored") return;
  const glLines = pass.db.prepare(
    "SELECT l.account, l.debit_cents, l.credit_cents, e.memo FROM gl_entry e JOIN gl_line l ON l.entry_id = e.id WHERE e.source_decision_id = ? ORDER BY e.posted_at, e.id, l.line_no",
  ).all(t.decision_id) as GlLine[];
  const applied = (t.proposal?.applications ?? []).reduce((sum, a) => sum + a.amount_cents, 0);
  const why = notPlainArAdjustment(glLines, applied);
  if (why !== null) return logStep(pass, t.decision_id, "JournalEntry", "skipped", null, `not a plain AR adjustment: ${why}`);
  const ids = await resolveIds(pass, t, "JournalEntry", false);
  if (!ids || !t.proposal) return;
  const p = t.proposal;
  const debitLines = glLines.filter((l) => l.debit_cents > 0);
  const accountIds = new Map<string, string>();
  for (const code of new Set([ACCOUNTS.ar, ...debitLines.map((l) => l.account)])) {
    const id = await externalId(pass, qboAccountWorldId(code), "account", qboAccountFindSql(code));
    if (id === undefined) return logStep(pass, t.decision_id, "JournalEntry", "skipped", null, `${NO_MAPPING} for account ${code} ${QBO_ACCOUNTS[code]!.name}: seed_manifest has no '${QBO_SYSTEM}' row (run pnpm seed --target=quickbooks)`);
    accountIds.set(code, id);
  }
  const invoiceId = p.applications[0]!.doc_id; // resolveIds refused an empty list
  const docNumber = adjustmentDocNumber(prefix, invoiceId, adjustmentSeq(pass.db, t.decision_id, t.kind, invoiceId));
  const arAccountId = accountIds.get(ACCOUNTS.ar)!;
  const debits: JournalDebit[] = debitLines.map((l) => ({ qbo_account_id: accountIds.get(l.account)!, amount_cents: l.debit_cents, memo: l.memo }));
  const body = arJournalBody({ decision_id: t.decision_id, customer_id: ids.customer_id, entry_date: p.entry_date, doc_number: docNumber, ar_account_id: arAccountId, debits, claim: p.evidence[0]?.claim ?? null });
  const journalId = await runStep(pass, t, {
    kind: "JournalEntry", entity: "JournalEntry", ripple_kind: "qbo_journal_entry", preview: body, delta_cents: -applied,
    summary: `QuickBooks JournalEntry ${docNumber} for $${centsToDecimal(applied)} to ${[...new Set(debitLines.map((l) => QBO_ACCOUNTS[l.account]!.name))].join(", ")}`,
    find: async (c) => {
      const found = await c.query(`select * from JournalEntry where DocNumber = '${qboEscape(docNumber)}'`);
      if (found.length === 0) return undefined;
      const agreeing = found.filter((o) => arCreditCents(o, arAccountId, ids.customer_id) === applied);
      return agreeing.length > 0 ? { adopt: agreeing.find((o) => hasMarker(o, t.decision_id)) ?? agreeing[0]! } : { conflict: found[0]! };
    },
    act: (c, salt) => c.create("JournalEntry", body, { requestId: mirrorRequestId("JournalEntry", [docNumber, ids.customer_id, ...salt]) }),
  });
  if (journalId === null) return; // the failed JournalEntry row brings the whole decision back on the next live pass
  const apply = applyJournalBody({ decision_id: t.decision_id, customer_id: ids.customer_id, entry_date: p.entry_date, doc_number: docNumber, journal_entry_id: journalId, lines: ids.lines });
  const invoiceIds = ids.lines.map((l) => l.qbo_invoice_id);
  await runStep(pass, t, {
    kind: "JournalApplication", entity: "Payment", ripple_kind: "qbo_journal_applied", preview: apply,
    summary: `QuickBooks zero-amount Payment applying journal entry ${docNumber} to ${docIds(p)}`,
    find: async (c) => {
      const zero = (await c.query(`select * from Payment where CustomerRef = '${qboEscape(ids.customer_id)}' maxresults 1000`))
        .filter((o) => amountIs(o, 0) && linkedIds(o, "JournalEntry").includes(journalId));
      const adopt = zero.find((o) => sameSet(linkedIds(o, "Invoice"), invoiceIds));
      if (adopt) return { adopt };
      return zero[0] ? { conflict: zero[0], detail: `journal entry ${journalId} is already applied to a different invoice by Payment ${String(zero[0].Id)}` } : undefined;
    },
    act: (c, salt) => c.create("Payment", apply, { requestId: mirrorRequestId("JournalApplication", [docNumber, ids.customer_id, journalId, ...invoiceIds, ...salt]) }),
  });
}

/** What a JournalEntry credits to A/R for this customer, in cents: the amount it can take off their invoices. */
function arCreditCents(o: QboObject, arAccountId: string, customerId: string): number {
  type Detail = { PostingType?: unknown; AccountRef?: { value?: unknown }; Entity?: { EntityRef?: { value?: unknown } } };
  const lines = Array.isArray(o.Line) ? (o.Line as Array<{ Amount?: unknown; JournalEntryLineDetail?: Detail }>) : [];
  return lines
    .filter((l) => l.JournalEntryLineDetail?.PostingType === "Credit" && String(l.JournalEntryLineDetail.AccountRef?.value) === arAccountId && String(l.JournalEntryLineDetail.Entity?.EntityRef?.value) === customerId)
    .reduce((sum, l) => sum + Math.round(Number(l.Amount) * 100), 0);
}

/**
 * 1 for the first posted decision of this kind on this invoice, 2 for the next… by posted_at then rowid. A rerun of the
 * same scenario after a reset posts the same entries in the same order, so each gets the DocNumber QuickBooks already holds.
 */
function adjustmentSeq(db: Db, decisionId: string, kind: string, invoiceId: string): number {
  const rows = db.prepare("SELECT id, proposal_json FROM decision WHERE kind = ? AND posted_at IS NOT NULL ORDER BY posted_at, rowid").all(kind) as Array<{ id: string; proposal_json: string | null }>;
  const onInvoice = rows.filter((r) => readProposal(r.proposal_json)?.applications[0]?.doc_id === invoiceId).map((r) => r.id);
  const at = onInvoice.indexOf(decisionId);
  return at >= 0 ? at + 1 : onInvoice.length + 1;
}

/** Workpaper, then one text file per gmail trace the proposal cites. Each is its own step, so one failure costs one file. */
async function attachAll(pass: Pass, t: Target, memoId: string, docNumber: string): Promise<void> {
  // Named after the memo, not the decision: a file name carrying a per-run decision id would be attached again after every reset.
  const files: Array<{ kind: string; name: string; text: () => string }> = [
    { kind: "Attachable:workpaper", name: `workpaper-${docNumber}.txt`, text: () => workpaperText(pass.db, t.decision_id) },
  ];
  const traceIds = [...new Set((t.proposal?.evidence ?? []).map((e) => e.trace_id))];
  for (const id of traceIds) {
    const row = pass.db.prepare("SELECT source FROM trace WHERE id = ?").get(id) as { source: string } | undefined;
    if (row?.source === "gmail") files.push({ kind: `Attachable:email:${id}`, name: `email-${id}.txt`, text: () => sourceEmailText(pass.db, id) });
  }
  for (const f of files) {
    try {
      const file: QboUpload = { entity_type: "CreditMemo", entity_id: memoId, file_name: f.name, content_type: "text/plain", content: f.text() };
      await runStep(pass, t, {
        kind: f.kind, entity: "Attachable", ripple_kind: "qbo_attachment", summary: `${f.name} attached to the QuickBooks credit memo`,
        preview: { file_metadata_01: attachableMetadata(file), file_content_01: file.content },
        find: async (c) => {
          const adopt = (await c.query(`select * from Attachable where AttachableRef.EntityRef.Type = 'CreditMemo' and AttachableRef.EntityRef.value = '${qboEscape(memoId)}'`)).find((o) => o.FileName === f.name);
          return adopt ? { adopt } : undefined;
        },
        act: (c) => c.upload(file),
      });
    } catch (err) {
      logStep(pass, t.decision_id, f.kind, "failed", null, message(err));
    }
  }
}

/** mirrored → nothing. dry → record the body. live → adopt or create, and a failure is this step's alone. */
async function runStep(pass: Pass, t: Target, spec: StepSpec): Promise<string | null> {
  const prior = logRow(pass.db, t.decision_id, spec.kind);
  if (prior?.status === "mirrored") return prior.external_id;
  if (!pass.client) {
    const ref = `dry:${t.decision_id}:${spec.kind}`;
    logStep(pass, t.decision_id, spec.kind, "dry_run", null, JSON.stringify(spec.preview));
    ripple(pass, t, spec, ref, false);
    return ref;
  }
  try {
    const found = await spec.find(pass.client);
    if (found && "conflict" in found) { // the natural key is taken by something else: never create a second object under it
      logStep(pass, t.decision_id, spec.kind, "failed", null, found.detail ?? `exists with different amount/customer: ${String(found.conflict.Id)}`);
      return null;
    }
    const obj = found ? found.adopt : await createForReal(pass.client, spec);
    if (typeof obj.Id !== "string" || obj.Id === "") throw new Error(`QuickBooks returned no Id for the ${spec.kind}`);
    logStep(pass, t.decision_id, spec.kind, "mirrored", obj.Id, found ? `adopted existing ${spec.entity} ${obj.Id}` : "created");
    ripple(pass, t, spec, obj.Id, true);
    return obj.Id;
  } catch (err) {
    logStep(pass, t.decision_id, spec.kind, "failed", null, message(err));
    return null;
  }
}

function ripple(pass: Pass, t: Target, spec: StepSpec, ref: string, live: boolean): void {
  // the dry run's placeholder row gives way to the real one, so the ripple view never shows both
  const dryKey = [t.intent_id, spec.ripple_kind, `dry:${t.decision_id}:${spec.kind}`];
  const dry = pass.db.prepare("SELECT event_id FROM ripple WHERE intent_id = ? AND function = 'ar' AND kind = ? AND ref = ?").get(...dryKey) as { event_id: number | null } | undefined;
  if (live && dry) pass.db.prepare("DELETE FROM ripple WHERE intent_id = ? AND function = 'ar' AND kind = ? AND ref = ?").run(...dryKey);
  recordRipple(pass.db, {
    intent_id: t.intent_id, function: "ar", kind: spec.ripple_kind, ref, summary: live ? spec.summary : `(dry run) ${spec.summary}`,
    delta_cents: spec.delta_cents ?? null, event_id: t.event_id ?? dry?.event_id ?? null, // a retry has no event: keep the dry run's
    ...(live ? { artifact: { decision_id: t.decision_id, system: QBO_SYSTEM } } : {}),
  }, pass.clock);
}

// ───────────── world id → QuickBooks id

interface Ids { customer_id: string; item_id?: string; lines: InvoiceApplication[] }

/** Returns undefined after logging a 'skipped' row that names what is missing. */
async function resolveIds(pass: Pass, t: Target, primary: string, needItem: boolean): Promise<Ids | undefined> {
  const p = t.proposal;
  if (!p || p.applications.length === 0) {
    logStep(pass, t.decision_id, primary, "skipped", null, p ? "the proposal applies to no invoice" : "decision has no readable proposal");
    return undefined;
  }
  const missing: string[] = [];
  const party = pass.db.prepare("SELECT name FROM party WHERE id = ?").get(p.party_id) as { name: string } | undefined;
  const customer = await externalId(pass, p.party_id, "customer", party ? `select * from Customer where DisplayName = '${qboEscape(party.name)}'` : null);
  if (customer === undefined) missing.push(`customer ${p.party_id}`);
  const lines: InvoiceApplication[] = [];
  for (const app of p.applications) {
    const inv = await externalId(pass, app.doc_id, "invoice", `select * from Invoice where DocNumber = '${qboEscape(app.doc_id)}'`);
    if (inv === undefined) missing.push(`invoice ${app.doc_id}`);
    else lines.push({ qbo_invoice_id: inv, amount_cents: app.amount_cents });
  }
  const item = needItem ? await externalId(pass, QBO_ITEM_WORLD_ID, "item", `select * from Item where Name = '${qboEscape(QBO_ITEM_NAME)}'`) : undefined;
  if (needItem && item === undefined) missing.push(`item ${QBO_ITEM_NAME}`);
  if (missing.length > 0 || customer === undefined) {
    logStep(pass, t.decision_id, primary, "skipped", null, `${NO_MAPPING} for ${missing.join(", ")}: seed_manifest has no '${QBO_SYSTEM}' row (run pnpm seed --target=quickbooks)`);
    return undefined;
  }
  return { customer_id: customer, lines, ...(item !== undefined ? { item_id: item } : {}) };
}

/**
 * seed_manifest first. On a live run a miss falls back to the seeder's own natural-key lookup (DisplayName, DocNumber,
 * item Name) and records what it finds, because a reset local database forgets the manifest while QuickBooks keeps the
 * records. Read-only against QuickBooks.
 */
async function externalId(pass: Pass, worldId: string, kind: string, findSql: string | null): Promise<string | undefined> {
  const row = pass.db.prepare("SELECT external_id FROM seed_manifest WHERE world_id = ? AND system = ?").get(worldId, QBO_SYSTEM) as { external_id: string } | undefined;
  if (row) return row.external_id;
  if (!pass.client || findSql === null) return undefined;
  const found = (await pass.client.query(findSql))[0];
  if (!found || typeof found.Id !== "string" || found.Id === "") return undefined;
  // origin stays NULL on purpose: a lookup that finds a record cannot tell one the seeder made on an earlier run from
  // one the company always had, and `seed --reset` removes only what it can prove it created.
  pass.db.prepare("INSERT OR IGNORE INTO seed_manifest (world_id, system, kind, external_id, seeded_at, origin) VALUES (?, ?, ?, ?, ?, NULL)").run(worldId, QBO_SYSTEM, kind, found.Id, pass.clock.now());
  return found.Id;
}

// ───────────── mirror_log and small helpers

function logRow(db: Db, decisionId: string, kind: string): LogRow | undefined {
  return db.prepare("SELECT status, external_id, detail FROM mirror_log WHERE decision_id = ? AND system = ? AND kind = ?").get(decisionId, QBO_SYSTEM, kind) as LogRow | undefined;
}

/** Upsert, except that a 'mirrored' row is never overwritten: that row is the promise not to create the object again. */
function logStep(pass: Pass, decisionId: string, kind: string, status: MirrorStatus, externalId: string | null, detail: string | null): void {
  const prior = logRow(pass.db, decisionId, kind);
  const info = pass.db.prepare(
    `INSERT INTO mirror_log (decision_id, system, kind, external_id, status, detail, mirrored_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (decision_id, system, kind) DO UPDATE SET external_id = excluded.external_id, status = excluded.status, detail = excluded.detail, mirrored_at = excluded.mirrored_at
     WHERE mirror_log.status != 'mirrored'`,
  ).run(decisionId, QBO_SYSTEM, kind, externalId, status, detail, pass.clock.now());
  if (info.changes === 0) return; // the row was already 'mirrored': nothing happened, so nothing is reported
  pass.steps.push({ decision_id: decisionId, kind, status, external_id: externalId, detail, fresh: prior?.status !== status });
}

function hasMarker(o: QboObject, decisionId: string): boolean {
  const note = typeof o.PrivateNote === "string" ? o.PrivateNote : "";
  return note === marker(decisionId) || note.startsWith(`${marker(decisionId)} `);
}

/**
 * Every object QuickBooks returned for the natural-key query. One that agrees on customer and amount is adopted
 * (ours by marker first, else the first). None agrees → conflict: the key is taken, so nothing may be created.
 */
function byNaturalKey(candidates: QboObject[], customerId: string, cents: number, decisionId: string): Found {
  if (candidates.length === 0) return undefined;
  const agreeing = candidates.filter((o) => customerOf(o) === customerId && amountIs(o, cents));
  if (agreeing.length === 0) return { conflict: candidates[0]! };
  return { adopt: agreeing.find((o) => hasMarker(o, decisionId)) ?? agreeing[0]! };
}

function customerOf(o: QboObject): string | undefined {
  const ref = o.CustomerRef as { value?: unknown } | null | undefined;
  return ref && ref.value !== undefined && ref.value !== null ? String(ref.value) : undefined;
}

/** TotalAmt against integer cents, compared as the same decimal QuickBooks was (or would be) sent: no arithmetic on the amount. */
function amountIs(o: QboObject, cents: number): boolean {
  const amt = o.TotalAmt;
  return (typeof amt === "number" || (typeof amt === "string" && amt.trim() !== "")) && Number(amt) === centsToAmount(cents);
}

function linkedIds(o: QboObject, txnType: string): string[] {
  const lines = Array.isArray(o.Line) ? (o.Line as Array<{ LinkedTxn?: Array<{ TxnId?: unknown; TxnType?: unknown }> }>) : [];
  return lines.flatMap((l) => (Array.isArray(l.LinkedTxn) ? l.LinkedTxn : []).filter((x) => x.TxnType === txnType).map((x) => String(x.TxnId)));
}

function sameSet(a: string[], b: string[]): boolean {
  const x = new Set(a), y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

function total(lines: InvoiceApplication[]): number {
  return lines.reduce((sum, l) => sum + l.amount_cents, 0);
}

function docIds(p: Proposal): string {
  return p.applications.map((a) => a.doc_id).join(", ");
}

function message(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}
