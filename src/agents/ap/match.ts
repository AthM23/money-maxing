import { z } from "zod";
import type { Db } from "../../runtime/db.js";
import { safeJson } from "../../runtime/lookups.js";

/**
 * The three-way match, computed in code: purchase order against goods receipts against the bill.
 * Nothing here trusts a model, and nothing here throws: every way this can go wrong comes back as a
 * typed result the caller turns into a failing tick mark.
 */

/** A line on a purchase order. `schema.sql` leaves `lines_json` free-form, so the pack pins the shape. */
export const ApLine = z.object({
  sku: z.string().min(1),
  qty: z.number().int().nonnegative(),
  unit_cents: z.number().int().nonnegative(),
});
export type ApLine = z.infer<typeof ApLine>;

/** A goods receipt note records what arrived, not what it costs: the price is always the PO's. */
export const ApReceiptLine = ApLine.partial({ unit_cents: true });
export type ApReceiptLine = z.infer<typeof ApReceiptLine>;

/** The tolerance band: the larger of a flat floor and a percentage of the supported amount. */
export interface Tolerance {
  floor_cents: number;
  pct: number;
}
export const DEFAULT_TOLERANCE: Tolerance = { floor_cents: 100, pct: 0.5 };

export function toleranceCents(supportedCents: number, t: Tolerance): number {
  return Math.max(t.floor_cents, Math.round((Math.abs(supportedCents) * t.pct) / 100));
}

export interface BillRow {
  id: string;
  party_id: string;
  po_id: string | null;
  vendor_invoice_no: string;
  service_period: string | null;
  total_cents: number;
  open_cents: number;
  status: string;
  trace_id: string | null;
}

export interface MatchNumbers {
  billed_cents: number;
  ordered_cents: number;
  received_cents: number;
  supported_cents: number;
  tolerance_cents: number;
}

export type MatchResult =
  | ({ status: "tied"; bill: BillRow } & MatchNumbers)
  | ({ status: "over"; bill: BillRow; detail: string } & MatchNumbers)
  | { status: "no_po"; bill: BillRow; detail: string }
  | { status: "error"; bill?: BillRow; detail: string };

export function getBill(db: Db, id: string): BillRow | undefined {
  return db
    .prepare(
      `SELECT id, party_id, po_id, vendor_invoice_no, service_period, total_cents, open_cents, status, trace_id
       FROM bill WHERE id = ?`,
    )
    .get(id) as BillRow | undefined;
}

interface PoRow {
  id: string;
  party_id: string;
  lines_json: string;
}

/** Either a value or the reason it could not be read. Nothing in this file throws on bad data. */
type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

/** Match one bill against its purchase order and every receipt booked against that order. */
export function matchBill(db: Db, billId: string, tol: Tolerance = DEFAULT_TOLERANCE): MatchResult {
  const bill = getBill(db, billId);
  if (!bill) return { status: "error", detail: `bill ${billId} is not in the ledger` };
  if (!bill.po_id) {
    return { status: "no_po", bill, detail: `bill ${bill.id} (${bill.vendor_invoice_no}) cites no purchase order: a non-PO bill needs a named approver before it can be paid` };
  }
  const po = db.prepare("SELECT id, party_id, lines_json FROM po WHERE id = ?").get(bill.po_id) as PoRow | undefined;
  if (!po) return { status: "error", bill, detail: `bill ${bill.id} cites purchase order ${bill.po_id}, which is not in the ledger` };
  if (po.party_id !== bill.party_id) {
    return { status: "error", bill, detail: `purchase order ${po.id} belongs to ${po.party_id}, but bill ${bill.id} is from ${bill.party_id}` };
  }
  const poLines = readLines(po.lines_json, ApLine, `purchase order ${po.id}`);
  if (!poLines.ok) return { status: "error", bill, detail: poLines.error };
  const received = receivedBySku(db, po.id);
  if (!received.ok) return { status: "error", bill, detail: received.error };
  return verdict(bill, amounts(poLines.value, received.value), tol);
}

/** Over-billing is the only direction that fails: a vendor who bills less than was received costs us nothing. */
function verdict(bill: BillRow, sums: Omit<MatchNumbers, "billed_cents" | "tolerance_cents">, tol: Tolerance): MatchResult {
  const numbers: MatchNumbers = {
    billed_cents: bill.total_cents,
    ...sums,
    tolerance_cents: toleranceCents(sums.supported_cents, tol),
  };
  const excess = numbers.billed_cents - numbers.supported_cents;
  if (excess > numbers.tolerance_cents) {
    const detail =
      `bill ${bill.id} (${bill.vendor_invoice_no}) bills ${numbers.billed_cents} cents against ` +
      `${numbers.supported_cents} cents supported by purchase order and receipts ` +
      `(ordered ${numbers.ordered_cents}, received ${numbers.received_cents}): ` +
      `${excess} cents over, tolerance ${numbers.tolerance_cents}`;
    return { status: "over", bill, detail, ...numbers };
  }
  return { status: "tied", bill, ...numbers };
}

/**
 * Supported amount: for every PO line, the quantity actually received (capped at the quantity ordered)
 * at the PO's unit price. Receipts are consumed line by line, so a sku spread over several PO lines is
 * not counted twice.
 */
function amounts(poLines: readonly ApLine[], received: ReadonlyMap<string, number>): Omit<MatchNumbers, "billed_cents" | "tolerance_cents"> {
  const price = new Map<string, number>();
  for (const line of poLines) if (!price.has(line.sku)) price.set(line.sku, line.unit_cents);
  const left = new Map(received);
  let ordered = 0;
  let supported = 0;
  for (const line of poLines) {
    ordered += line.qty * line.unit_cents;
    const available = left.get(line.sku) ?? 0;
    const take = Math.min(line.qty, available);
    left.set(line.sku, available - take);
    supported += take * line.unit_cents;
  }
  let receivedCents = 0;
  for (const [sku, qty] of received) receivedCents += qty * (price.get(sku) ?? 0);
  return { ordered_cents: ordered, received_cents: receivedCents, supported_cents: supported };
}

/** Split deliveries accumulate: one PO, three goods receipts, matched on the running total per sku. */
function receivedBySku(db: Db, poId: string): Loaded<Map<string, number>> {
  const rows = db
    .prepare("SELECT id, lines_json FROM receipt WHERE po_id = ? ORDER BY received_date, id")
    .all(poId) as Array<{ id: string; lines_json: string }>;
  const totals = new Map<string, number>();
  for (const row of rows) {
    const lines = readLines(row.lines_json, ApReceiptLine, `goods receipt ${row.id}`);
    if (!lines.ok) return lines;
    for (const line of lines.value) totals.set(line.sku, (totals.get(line.sku) ?? 0) + line.qty);
  }
  return { ok: true, value: totals };
}

/** `lines_json` is either a bare array of lines or an object with a `lines` array. Anything else is a fail. */
function readLines<T>(json: string, line: z.ZodType<T>, where: string): Loaded<T[]> {
  const raw = safeJson(json);
  if (raw === null) return { ok: false, error: `${where}: lines_json is not valid JSON` };
  const array = Array.isArray(raw) ? raw : (raw as { lines?: unknown }).lines;
  const parsed = z.array(line).safeParse(array);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, error: `${where}: lines_json does not parse as lines of sku, qty and unit_cents (${issues})` };
}
