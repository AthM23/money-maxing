import { z } from "zod";
import { IsoDate, NonNegCents } from "../contract/types.js";

/**
 * What a remittance advice says, in the shape lane C's models are trained to return (ft/gen_data.py): what was
 * remitted, the invoices it is for at their gross amounts, and any deduction the customer CLAIMS. A claimed
 * deduction is not an agreed one: it still has to be explained by evidence, a fact or a rule, like any shortfall.
 */
export const RemittanceRead = z.object({
  doc_kind: z.literal("remittance"),
  amount_cents: NonNegCents,
  applications: z.array(z.object({ invoice: z.string().min(1), amount_cents: NonNegCents })).min(1),
  discount_cents: NonNegCents.default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  date: IsoDate.optional(),
  method: z.string().optional(),
  payer: z.string().optional(),
  ref: z.string().optional(),
});
export type RemittanceRead = z.infer<typeof RemittanceRead>;

export type ReadOutcome =
  | { ok: true; doc: unknown; latency_ms: number; tokens_in?: number; tokens_out?: number }
  | { ok: false; reason: string; latency_ms: number; raw?: string };

/**
 * Whatever turns a document into fields: a small local model, a frontier model, or a script in tests. It never
 * throws, and nothing it returns is trusted: the harness re-checks every number against the bank and the ledger.
 */
export interface DocumentReader {
  name: string;
  read(documentText: string): Promise<ReadOutcome>;
}

/** The instruction lane C's models were trained on, word for word, so a fine-tuned reader sees what it was tuned for. */
export const READ_INSTRUCTION = "Extract every field from this finance document as JSON. Amounts are integer cents. Respond with JSON only.";
