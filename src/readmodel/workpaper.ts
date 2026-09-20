import type { Mark } from "../contract/types.js";
import { Proposal } from "../contract/types.js";
import { realizedFxCents } from "../kernel/fx.js";
import type { Db } from "../runtime/db.js";
import { getBankFx, getBankTxn, getDoc, getDocFx, getTrace, safeJson } from "../runtime/lookups.js";
import type { EvidenceOffset, ForeignSplit, WorkpaperEvidence, WorkpaperView } from "./types.js";

interface DecisionRow { id: string; intent_id: string; kind: string; route: string | null; posted_at: string | null; proposal_json: string | null }

/**
 * The workpaper behind one decision: its tick marks grouped by class, each evidence quote located inside its
 * source trace so the UI can highlight it, and (for a foreign receipt) the cash / fee / realized FX / held-back
 * split with both rates. Returns null when the decision does not exist.
 */
export function buildWorkpaper(db: Db, decisionId: string): WorkpaperView | null {
  const decision = db.prepare("SELECT id, intent_id, kind, route, posted_at, proposal_json FROM decision WHERE id = ?").get(decisionId) as DecisionRow | undefined;
  if (!decision) return null;
  const parsed = decision.proposal_json ? Proposal.safeParse(safeJson(decision.proposal_json)) : null;
  const proposal = parsed?.success ? parsed.data : null;
  return {
    decision_id: decision.id, intent_id: decision.intent_id, kind: decision.kind, route: decision.route, posted_at: decision.posted_at,
    marks_by_class: byClass(latestMarks(db, decisionId)),
    evidence: proposal ? evidenceViews(db, proposal.evidence) : [],
    foreign_split: proposal ? foreignSplit(db, proposal) : null,
  };
}

function latestMarks(db: Db, decisionId: string): Mark[] {
  const row = db.prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1").get(decisionId) as { marks_json: string } | undefined;
  return (row ? (safeJson(row.marks_json) as { marks?: Mark[] } | null)?.marks : undefined) ?? [];
}

function byClass(marks: Mark[]): WorkpaperView["marks_by_class"] {
  const grouped: WorkpaperView["marks_by_class"] = { F: [], E: [], P: [], J: [] };
  for (const m of marks) grouped[m.cls].push({ check: m.check, status: m.status, detail: m.detail, refs: m.refs });
  return grouped;
}

function evidenceViews(db: Db, evidence: { claim: string; trace_id: string; quote?: string }[]): WorkpaperEvidence[] {
  return evidence.map((e) => {
    const trace = e.quote ? getTrace(db, e.trace_id) : undefined;
    return { claim: e.claim, trace_id: e.trace_id, quote: e.quote ?? null, offset: trace && e.quote ? findQuoteOffset(trace.payload_text, e.quote) : null };
  });
}

/** A quote is checked whitespace-normalised (kernel checkE2); locate it the same way so a stray newline never hides a real offset. */
export function findQuoteOffset(text: string, quote: string): EvidenceOffset | null {
  const direct = text.indexOf(quote);
  if (direct >= 0) return { start: direct, end: direct + quote.length };
  const words = quote.trim().split(/\s+/).filter((w) => w.length > 0).map(escapeRegExp);
  if (words.length === 0) return null;
  const match = new RegExp(words.join("\\s+")).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Only when this receipt's bank line carries a foreign-currency record: the split the SCENARIO doc describes. */
function foreignSplit(db: Db, proposal: Proposal): ForeignSplit | null {
  if (!proposal.bank_txn_id) return null;
  const bankFx = getBankFx(db, proposal.bank_txn_id);
  const docId = proposal.applications[0]?.doc_id;
  const docFx = docId ? getDocFx(db, docId) : undefined;
  if (!bankFx || !docFx) return null;
  const bank = getBankTxn(db, proposal.bank_txn_id);
  const doc = docId ? getDoc(db, docId) : undefined;
  return {
    currency: bankFx.currency, cash_cents: bank?.amount_cents ?? 0, fee_cents: bankFx.fee_cents,
    realized_fx_cents: realizedFxCents(bankFx.foreign_amount_cents, docFx.booked_rate_ppm, bankFx.rate_ppm),
    held_back_cents: doc?.open_cents ?? 0, booked_rate_ppm: docFx.booked_rate_ppm, settled_rate_ppm: bankFx.rate_ppm,
  };
}
