import { z } from "zod";
import { IsoDate, NonNegCents } from "./types.js";

export const Remittance = z.object({
  reference: z.string().regex(/^[A-Za-z0-9-]{4,40}$/),
  date: IsoDate,
  amount_cents: NonNegCents.positive(),
  applications: z.array(z.object({ doc_id: z.string().min(1), amount_cents: NonNegCents.positive() })).min(1).max(100),
}).refine(r => new Set(r.applications.map(a => a.doc_id)).size === r.applications.length, "duplicate invoice")
  .refine(r => r.applications.reduce((n, a) => n + a.amount_cents, 0) === r.amount_cents, "remittance does not foot");
export type Remittance = z.infer<typeof Remittance>;

/** Deliberately narrow, reproducible email format. XLSX and free-form model extraction are not implied. */
export function parseRemittance(text: string): Remittance | null {
  const blocks = [...text.matchAll(/BEGIN REMITTANCE\r?\n([\s\S]*?)\r?\nEND REMITTANCE/g)];
  if (blocks.length !== 1) return null;
  const lines = blocks[0]![1]!.split(/\r?\n/).map(l => l.trim());
  const reference = /^Reference: (\S+)$/.exec(lines[0] ?? "")?.[1];
  const date = /^Date: (\S+)$/.exec(lines[1] ?? "")?.[1];
  const amount = /^Amount: (\S+)$/.exec(lines[2] ?? "")?.[1];
  if (lines[3] !== "invoice,amount") return null;
  const cents = (s: string | undefined): number => /^\d+\.\d{2}$/.test(s ?? "") ? Number(s!.replace(".", "")) : NaN;
  const applications = lines.slice(4).map(l => { const [doc_id, amount, extra] = l.split(","); return { doc_id, amount_cents: extra === undefined ? cents(amount) : NaN }; });
  const result = Remittance.safeParse({ reference, date, amount_cents: cents(amount), applications });
  return result.success ? result.data : null;
}

/** Money as it appears in customer mail: $1,234.56 · 1234.56 · USD 1,234.56 · 5,494.98. Always two decimals. */
const MONEY = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
/** How far from an invoice number its amount may sit, in characters. "INV-6685 ($996.35)" and "INV-1891:5,494.98" are well inside. */
const PAIRING_WINDOW = 60;

interface Token { at: number; cents: number }

function moneyTokens(text: string): Token[] {
  return [...text.matchAll(MONEY)].map((m) => ({ at: m.index ?? 0, cents: Number(`${m[1]!.replaceAll(",", "")}${m[2]!}`) }));
}

/**
 * Check a free-form remittance that a model (or a person) read, against the customer's own words. Nothing the reader
 * said is trusted: every invoice number must appear in the text, its amount must sit next to it with no other
 * document number in between (so a correct total cannot hide amounts swapped between invoices, and a payment cannot be
 * moved onto an invoice the customer only mentioned), the total must appear, and the allocations must foot to it.
 * Pure text and arithmetic; the kernel runs it again at every gate.
 */
export function remittanceProvenanceProblems(
  text: string, applications: ReadonlyArray<{ doc_id: string; amount_cents: number }>, totalCents: number,
): string[] {
  const problems: string[] = [];
  const money = moneyTokens(text);
  if (applications.length === 0) return ["the remittance allocates nothing"];
  if (new Set(applications.map((a) => a.doc_id)).size !== applications.length) problems.push("an invoice is allocated twice");
  const footed = applications.reduce((n, a) => n + a.amount_cents, 0);
  if (footed !== totalCents) problems.push(`allocations foot to ${footed}, the receipt is ${totalCents}`);
  const pairing = pairAmounts(text, money, applications);
  // With several invoices the total has to be a figure of its own, not one of the amounts already paired to an invoice.
  const free = applications.length === 1 ? money : money.filter((t) => !pairing.used.has(t.at));
  if (!free.some((t) => t.cents === totalCents)) problems.push(`the receipt total ${totalCents} is not stated in the remittance`);
  return [...problems, ...pairing.problems];
}

type Application = { doc_id: string; amount_cents: number };
type Side = "after" | "before";
interface Pairing { problems: string[]; used: Set<number> }

/**
 * Which amount belongs to which invoice. Customers write one way or the other throughout a remittance: the amount
 * after the invoice ("INV-1 ($5.00)", "INV-1:5.00") or before it ("$5.00 against INV-1"). Every line has to pair
 * in the same direction, with no other document number in between, and an invoice named more than once has to carry
 * the same amount each time: a statement block followed by a payment block is a person's to read.
 */
function pairAmounts(text: string, money: Token[], applications: ReadonlyArray<Application>): Pairing {
  const named = applications.map((a) => ({ app: a, at: positionsOf(text, a.doc_id) }));
  const missing = named.filter((n) => n.at.length === 0).map((n) => `${n.app.doc_id} is not named in the remittance`);
  if (missing.length > 0) return { problems: missing, used: new Set() };
  const barriers = documentNumberPositions(text);
  let firstFailure: string[] = [];
  for (const side of ["after", "before"] as const) {
    const seen = named.map((n) => ({ app: n.app, tokens: n.at.map((idAt) => neighbour(money, barriers, idAt, side)).filter((t): t is Token => t !== undefined) }));
    const bad = seen.filter((n) => n.tokens.length === 0 || n.tokens.some((t) => t.cents !== n.app.amount_cents));
    if (bad.length === 0) return { problems: [], used: new Set(seen.flatMap((n) => n.tokens.map((t) => t.at))) };
    if (side === "after") firstFailure = bad.map((n) => `${n.app.amount_cents} is not stated next to ${n.app.doc_id} in the remittance`);
  }
  return { problems: firstFailure, used: new Set() };
}

/** The first amount after a document number (or the last one before it), short of the next document number and the window. */
function neighbour(money: Token[], barriers: number[], idAt: number, side: Side): Token | undefined {
  if (side === "after") {
    const limit = Math.min(barriers.find((o) => o > idAt) ?? Infinity, idAt + PAIRING_WINDOW);
    return money.find((t) => t.at > idAt && t.at < limit);
  }
  const limit = Math.max([...barriers].reverse().find((o) => o < idAt) ?? -Infinity, idAt - PAIRING_WINDOW);
  return [...money].reverse().find((t) => t.at < idAt && t.at > limit);
}

/** Anything written like a document number (INV-3182, PO-4471, NW-48213), allocated or not: an amount belongs to the nearest one. */
function documentNumberPositions(text: string): number[] {
  return [...text.matchAll(/(?<![A-Za-z0-9-])[A-Za-z]{2,8}-?\d{3,}(?:-\d+)*(?![A-Za-z0-9-])/g)].map((m) => m.index ?? 0);
}

function positionsOf(text: string, id: string): number[] {
  const out: number[] = [];
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`, "g"))) out.push(m.index ?? 0);
  return out;
}
