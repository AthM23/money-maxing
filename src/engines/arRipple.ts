import { poll } from "../bus/bus.js";
import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { recordRipple } from "./ripple.js";

const usd = (cents: number): string => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Application { doc_id: string; amount_cents: number }

/**
 * The first ring of the ripple: what AR itself booked on the intent. Person A's runtime posts the entry and emits
 * the event; this only writes the ripple row, so the view starts where the money did and every later row
 * (revenue, forecast, close, QuickBooks) can be read against the same amount.
 */
export async function arRippleOnce(db: Db, clock: Clock = systemClock): Promise<number> {
  let written = 0;
  await poll(db, "ar-ripple", ["ar.credit_memo.posted", "ar.payment.applied"], (e) => {
    const entryId = typeof e.payload.entry_id === "string" ? e.payload.entry_id : null;
    const decisionId = typeof e.payload.decision_id === "string" ? e.payload.decision_id : null;
    if (!e.intent_id || !entryId || !decisionId) return;
    const apps = (Array.isArray(e.payload.applications) ? e.payload.applications : []) as Application[];
    const cents = apps.reduce((n, a) => n + a.amount_cents, 0);
    const docs = apps.map((a) => a.doc_id).join(", ");
    const memo = e.topic === "ar.credit_memo.posted";
    const debited = (db.prepare("SELECT GROUP_CONCAT(DISTINCT account) AS a FROM gl_line WHERE entry_id = ? AND debit_cents > 0").get(entryId) as { a: string | null }).a ?? "?";
    const fresh = recordRipple(db, {
      intent_id: e.intent_id, function: "ar", kind: memo ? "credit_memo" : "cash_applied", ref: entryId, event_id: e.id,
      summary: memo ? `Credit memo ${usd(cents)} against ${docs}: Dr ${debited} / Cr 1200 AR` : `Cash ${usd(cents)} applied to ${docs}`,
      delta_cents: memo ? -cents : cents,
    }, clock);
    if (fresh) written += 1;
  });
  return written;
}
