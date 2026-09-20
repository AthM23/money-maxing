import { z } from "zod";
import { Cents, IsoDate, NonNegCents } from "../contract/types.js";

/**
 * The canonical world file (`world/northwind.json`). One file drives every seeder target, so every system tells
 * the same story except where drift is planted. Every record carries the world's own `recorded_time`: seeding
 * happens tonight, and replay's no-look-ahead guard must not see 19 Sep on Q2 evidence.
 */
const IsoTs = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "ISO-8601 UTC, seconds");

export const WorldParty = z.object({
  id: z.string().min(1),
  kind: z.enum(["customer", "vendor", "employee", "bank", "other"]),
  name: z.string().min(1),
  parent_id: z.string().optional(),
  /** Account owner: a key of `World.people`. */
  owner: z.string().optional(),
  /** Every string the party is known by: bank descriptors, email domains, legal names. */
  aliases: z.array(z.string().min(1)),
  email_domain: z.string().optional(),
  /** Vendors: bank details as last paid. */
  remit_to: z.object({ bank: z.string(), routing: z.string(), account_last4: z.string() }).optional(),
  default_expense_account: z.string().optional(),
});
export type WorldParty = z.infer<typeof WorldParty>;

export const WorldPerson = z.object({
  id: z.string().min(1),          // placeholder Slack user id; remapped to the real workspace at seed time
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().min(1),
  /** Present when the person is on the approval matrix. */
  limit_cents: NonNegCents.optional(),
});
export type WorldPerson = z.infer<typeof WorldPerson>;

export const WorldContract = z.object({
  id: z.string().min(1), party_id: z.string().min(1), start_date: IsoDate, end_date: IsoDate,
  value_cents: NonNegCents,
  terms: z.object({ monthly_cents: NonNegCents, billing: z.literal("monthly"), payment_terms_days: z.number().int(), method: z.enum(["ach", "wire"]) }),
  text: z.string().min(1),
  recorded_time: IsoTs,
});
export type WorldContract = z.infer<typeof WorldContract>;

export const WorldInvoice = z.object({
  id: z.string().min(1), party_id: z.string().min(1), contract_id: z.string().min(1),
  issue_date: IsoDate, due_date: IsoDate, total_cents: NonNegCents,
});
export type WorldInvoice = z.infer<typeof WorldInvoice>;

export const WorldBill = z.object({
  id: z.string().min(1), party_id: z.string().min(1), vendor_invoice_no: z.string().min(1),
  bill_date: IsoDate, due_date: IsoDate, service_period: z.string(), total_cents: NonNegCents, expense_account: z.string().min(1),
});
export type WorldBill = z.infer<typeof WorldBill>;

/** What the humans booked against a Q2 bank line. July lines carry none: that is the agents' work. */
export const HistorySettlement = z.object({
  doc_kind: z.enum(["invoice", "bill", "equity"]),
  doc_id: z.string().optional(),
  applied_cents: NonNegCents,
  /** A judgment the humans made on the residual, e.g. a wire fee written off. Becomes a decision_point. */
  write_off: z.object({ account: z.string(), amount_cents: NonNegCents, decided_at: IsoTs }).optional(),
});
export type HistorySettlement = z.infer<typeof HistorySettlement>;

export const WorldBankTxn = z.object({
  id: z.string().min(1), posted_date: IsoDate, amount_cents: Cents, descriptor: z.string().min(1),
  method: z.enum(["ach", "wire", "check", "card", "other"]), recorded_time: IsoTs,
  history: HistorySettlement.optional(),
});
export type WorldBankTxn = z.infer<typeof WorldBankTxn>;

export const WorldMail = z.object({
  id: z.string().min(1), thread_id: z.string().min(1), date: IsoTs, from: z.string(), to: z.array(z.string()), cc: z.array(z.string()),
  subject: z.string(), body: z.string(), party_id: z.string().optional(),
});
export type WorldMail = z.infer<typeof WorldMail>;

export const WorldChat = z.object({
  id: z.string().min(1), channel: z.string(), user: z.string(), ts: IsoTs, text: z.string(), party_id: z.string().optional(),
});
export type WorldChat = z.infer<typeof WorldChat>;

export const WorldDeal = z.object({
  id: z.string().min(1), party_id: z.string().min(1), name: z.string(), amount_cents: NonNegCents, close_date: IsoDate,
  owner: z.string(), stage: z.string(), recorded_time: IsoTs,
});
export const WorldCrmNote = z.object({ id: z.string().min(1), party_id: z.string().min(1), ts: IsoTs, author: z.string(), text: z.string() });

export const WorldFile = z.object({
  id: z.string().min(1), kind: z.enum(["policy_memo"]), title: z.string(), recorded_time: IsoTs,
  sections: z.array(z.object({ slug: z.string(), heading: z.string(), text: z.string() })),
});

export const World = z.object({
  meta: z.object({ seed: z.number().int(), company: z.string(), version: z.number().int(), live_period: z.string(), history_periods: z.array(z.string()) }),
  periods: z.array(z.object({ id: z.string(), status: z.enum(["open", "closing", "locked"]) })),
  people: z.array(WorldPerson),
  parties: z.array(WorldParty),
  contracts: z.array(WorldContract),
  invoices: z.array(WorldInvoice),
  bills: z.array(WorldBill),
  bank: z.object({ account: z.string(), opening_balance_cents: Cents, txns: z.array(WorldBankTxn) }),
  mail: z.array(WorldMail),
  chat: z.array(WorldChat),
  crm: z.object({ deals: z.array(WorldDeal), notes: z.array(WorldCrmNote) }),
  files: z.array(WorldFile),
});
export type World = z.infer<typeof World>;

/** Planted drift and what a correct system does with it. Written next to the world file, gitignored, no tool reads it. */
export interface AnswerKeyItem {
  plant: string;
  party_id: string;
  bank_txn_id?: string;
  doc_ids: string[];
  shortfall_cents: number;
  explained_by?: string;
  expected: string;
}
