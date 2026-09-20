import { Proposal } from "../src/contract/types.js";
import { isControlAccountCode } from "./accounts.js";
import { buildFleet } from "../src/readmodel/fleet.js";
import { buildReceipts } from "../src/readmodel/receipts.js";
import { buildConsoleState } from "../src/readmodel/state.js";
import { buildCaseTrace } from "../src/readmodel/trace.js";
import { buildWorkpaper } from "../src/readmodel/workpaper.js";
import type { Db } from "../src/runtime/db.js";
import { readControlTotals } from "../src/runtime/kernelContext.js";
import { getTrace, safeJson } from "../src/runtime/lookups.js";

/** Everything the first screen needs, in one read. */
export function overview(db: Db, brand: string): unknown {
  const state = buildConsoleState(db);
  const totals = readControlTotals(db);
  return {
    brand, ...state,
    books: { ar_gl_cents: totals.ar_gl_cents, ar_subledger_cents: totals.ar_subledger_cents, tied: totals.ar_gl_cents === totals.ar_subledger_cents },
    ladder: db.prepare("SELECT function, kind, agree, n, covered, level FROM autonomy ORDER BY function, kind").all(),
    people: db.prepare("SELECT id, name, role, limit_cents FROM approver WHERE role != 'controller_agent' ORDER BY limit_cents DESC").all(),
    viewer: viewerOf(db),
  };
}

/**
 * The workspace has one seat: the person the agents report to. It is whoever WORKSPACE_USER names, otherwise the
 * person with the most authority in the approval matrix. What that person may approve is still decided by the kernel.
 */
export function viewerOf(db: Db): { id: string; name: string; role: string; limit_cents: number } | null {
  const named = process.env.WORKSPACE_USER;
  const row = named
    ? db.prepare("SELECT id, name, role, limit_cents FROM approver WHERE id = ? AND role != 'controller_agent'").get(named)
    : db.prepare("SELECT id, name, role, limit_cents FROM approver WHERE role != 'controller_agent' ORDER BY limit_cents DESC, id LIMIT 1").get();
  return (row as { id: string; name: string; role: string; limit_cents: number } | undefined) ?? null;
}

export interface BookLine {
  decision_id: string | null;
  kind: string;
  label: string;
  account: string | null;
  amount_cents: number;
  fx_note: string | null;
  state: "posted" | "parked" | "open";
  settled_by: string;
}

/** One receipt the way a cash application reads: the bank line, and the book lines that explain it to the cent. */
export function caseView(db: Db, intentId: string): unknown {
  const receipt = buildReceipts(db).find((r) => r.intent_id === intentId);
  if (!receipt) return null;
  const fx = receipt.bank_line ? (db.prepare("SELECT currency, foreign_amount_cents, rate_ppm, fee_cents FROM bank_txn_fx WHERE bank_txn_id = ?").get(receipt.bank_line.id) as Fx | undefined) : undefined;
  const booked = receipt.doc_ids.map((id) => db.prepare("SELECT invoice_id, currency, foreign_total_cents, booked_rate_ppm FROM invoice_fx WHERE invoice_id = ?").get(id)).filter(Boolean);
  const lines: BookLine[] = [
    ...receipt.posted.map((p) => bookLine(db, p.decision_id, p.kind, p.amount_cents, "posted", p.settled_by.label, fx)),
    ...receipt.parked.map((p) => bookLine(db, p.decision_id, p.kind, p.amount_cents, "parked", p.prepared_by.label, fx)),
  ];
  const parked = receipt.parked.reduce((n, p) => n + p.amount_cents, 0);
  const unexplained = receipt.open_cents_now - parked;
  if (unexplained > 0) lines.push({ decision_id: null, kind: "open", label: receipt.open_questions.length > 0 ? "Not paid by the customer: a person has been asked" : "Not yet explained", account: null, amount_cents: unexplained, fx_note: null, state: "open", settled_by: receipt.open_questions.length > 0 ? "awaiting a person" : "open" });
  return { receipt, fx: fx ?? null, invoice_fx: booked, lines, trace: buildCaseTrace(db, intentId) };
}

interface Fx { currency: string; foreign_amount_cents: number; rate_ppm: number; fee_cents: number }

const KIND_LABELS: Record<string, string> = {
  apply_payment: "Cash applied", write_off: "Bank charges written off", fx_realized: "Realized FX loss", credit_memo: "Credit to the customer",
  tax_withholding: "Tax withheld at source", dispute_hold: "Held as disputed", unapplied_cash: "Held as unapplied cash",
};

function bookLine(db: Db, decisionId: string, kind: string, amount: number, state: BookLine["state"], by: string, fx: Fx | undefined): BookLine {
  const row = db.prepare("SELECT proposal_json FROM decision WHERE id = ?").get(decisionId) as { proposal_json: string | null } | undefined;
  const parsed = Proposal.safeParse(safeJson(row?.proposal_json ?? "null"));
  const account = parsed.success ? parsed.data.entries.find((l) => l.debit_cents > 0 && !isControlAccountCode(l.account))?.account ?? parsed.data.entries.find((l) => l.debit_cents > 0)?.account ?? null : null;
  const rate = fx ? (fx.rate_ppm / 1_000_000).toFixed(4) : null;
  const fxNote = !fx ? null : kind === "apply_payment" ? `${fx.currency}→USD · ${rate}` : kind === "fx_realized" ? `settled at ${rate}` : null;
  return { decision_id: decisionId, kind, label: KIND_LABELS[kind] ?? kind.replaceAll("_", " "), account, amount_cents: amount, fx_note: fxNote, state, settled_by: by };
}

/** One entry's workpaper with the text of every source it quotes, so the page can show the quote inside its source. */
export function workpaperView(db: Db, decisionId: string): unknown {
  const workpaper = buildWorkpaper(db, decisionId);
  if (!workpaper) return null;
  const row = db.prepare("SELECT proposal_json, actor, tier FROM decision WHERE id = ?").get(decisionId) as { proposal_json: string | null; actor: string; tier: number | null };
  const parsed = Proposal.safeParse(safeJson(row.proposal_json ?? "null"));
  const sources = Object.fromEntries([...new Set(workpaper.evidence.map((e) => e.trace_id))].map((id) => {
    const t = getTrace(db, id);
    const meta = db.prepare("SELECT source, kind, recorded_time FROM trace WHERE id = ?").get(id) as { source: string; kind: string; recorded_time: string } | undefined;
    return [id, { text: t?.payload_text ?? "", source: meta?.source ?? null, kind: meta?.kind ?? null, recorded_time: meta?.recorded_time ?? null }];
  }));
  return { workpaper, sources, entries: parsed.success ? parsed.data.entries : [], memo: parsed.success ? parsed.data.entries[0]?.memo ?? null : null, actor: row.actor, tier: row.tier };
}

export function fleetView(db: Db): unknown {
  return buildFleet(db);
}
