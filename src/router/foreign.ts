import type { CaseFile } from "../contract/types.js";
import { realizedFxCents } from "../kernel/fx.js";
import { normalizeWs, statesFigure } from "../kernel/util.js";
import type { Db } from "../runtime/db.js";
import { fxRealizedCents, getBankFx, getDocFx } from "../runtime/lookups.js";

/**
 * A receipt converted by the bank can be short for three different reasons at once, and only one of them is a
 * judgment: the bank's fee (its advice states it), the rate moving between booking and settlement (arithmetic), and
 * whatever the customer actually held back. A matcher that sees one number calls all of it a short-pay.
 */
export interface ForeignParts {
  currency: string;
  advice_trace_id: string | null;
  foreign_amount_cents: number;
  booked_rate_ppm: number;
  rate_ppm: number;
  fee_cents: number;
  fx_loss_cents: number;
  /** What the customer did not pay, in USD at the booked rate. The only part that may need a person. */
  residual_cents: number;
  /** Already in the books for this case, so a second pass never books them twice. */
  fee_booked: boolean;
  fx_booked: boolean;
}

const money = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (ppm: number): string => (ppm / 1_000_000).toFixed(4);

/** The split, or null when the case has no foreign-currency records or they do not describe one invoice and one receipt. */
export function foreignParts(db: Db, c: CaseFile, notes: string[]): ForeignParts | null {
  const docId = c.doc_ids.length === 1 ? c.doc_ids[0] : undefined;
  const bankFx = c.bank_txn_id ? getBankFx(db, c.bank_txn_id) : undefined;
  const docFx = docId ? getDocFx(db, docId) : undefined;
  if (!c.bank_txn_id || !bankFx || !docFx) return null;
  if (bankFx.currency !== docFx.currency) {
    notes.push(`the receipt is in ${bankFx.currency} and ${docId} in ${docFx.currency}: not split, a person has to look`);
    return null;
  }
  const fx = realizedFxCents(bankFx.foreign_amount_cents, docFx.booked_rate_ppm, bankFx.rate_ppm);
  const residual = c.shortfall_cents - bankFx.fee_cents - Math.max(fx, 0);
  if (fx < 0 || residual < 0) {
    notes.push(`the foreign-currency records do not explain the ${c.shortfall_cents} cent difference (fee ${bankFx.fee_cents}, rate effect ${fx}): not split`);
    return null;
  }
  notes.push(`Of the ${money(c.shortfall_cents)} difference: ${money(bankFx.fee_cents)} is the bank's fee, ${money(fx)} is the rate moving from ${rate(docFx.booked_rate_ppm)} at booking to ${rate(bankFx.rate_ppm)} at settlement on ${bankFx.currency} ${money(bankFx.foreign_amount_cents)}, and ${money(residual)} is ${bankFx.currency} ${money(docFx.foreign_total_cents - bankFx.foreign_amount_cents)} the customer did not pay.`);
  return { currency: bankFx.currency, advice_trace_id: bankFx.advice_trace_id, foreign_amount_cents: bankFx.foreign_amount_cents,
    booked_rate_ppm: docFx.booked_rate_ppm, rate_ppm: bankFx.rate_ppm, fee_cents: bankFx.fee_cents, fx_loss_cents: fx, residual_cents: residual,
    fee_booked: feeBooked(db, c, bankFx.fee_cents, bankFx.advice_trace_id), fx_booked: fxRealizedCents(db, c.bank_txn_id) > 0 };
}

/** The fee counts as booked once a write-off for exactly that amount, citing the bank's advice, has taken effect on this case. */
function feeBooked(db: Db, c: CaseFile, feeCents: number, adviceTraceId: string | null): boolean {
  if (feeCents === 0) return true;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM decision d WHERE d.intent_id = ? AND d.mode = 'live' AND d.posted_at IS NOT NULL AND d.kind = 'write_off'
         AND (SELECT COALESCE(SUM(a.value ->> '$.amount_cents'), 0) FROM json_each(json_extract(d.proposal_json, '$.applications')) a) = ?
         AND EXISTS (SELECT 1 FROM json_each(json_extract(d.proposal_json, '$.evidence')) e WHERE e.value ->> '$.trace_id' = ?)`,
    )
    .get(c.intent_id, feeCents, adviceTraceId ?? "") as { n: number };
  return row.n > 0;
}

/**
 * The bank's own line for a figure, label and all: "Incoming wire fee: USD 40.00", not "40.00". The advice is cut at
 * line ends and sentence ends, and the first piece that states the figure as a number of its own is the quote, so a
 * reviewer reads what the number means and the kernel agrees the whole phrase to the source. Falls back to the bare
 * figure when no piece states it; the kernel then decides.
 */
export function labelledQuote(adviceText: string, figure: string): string {
  const pieces = adviceText.split(/\r?\n|(?<=[.;])\s+(?=[A-Z])/).map((p) => normalizeWs(p).replace(/[.;]$/, ""));
  return pieces.find((p) => p.length <= 200 && statesFigure(p, figure)) ?? figure;
}
