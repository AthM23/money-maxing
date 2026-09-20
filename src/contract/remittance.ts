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
