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
  /** ISO 3166 alpha-2. A label for the console's cash strip; no logic reads it. */
  country: z.string().length(2).optional(),
  /** Which legal entity of ours bills this customer: a key of `World.entities`. A label, like `country`. */
  billed_by: z.string().optional(),
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
  /** `monthly_cents` and `value_cents` are USD. A contract priced in another currency says so here and in its text. */
  terms: z.object({
    monthly_cents: NonNegCents, billing: z.enum(["monthly", "quarterly"]), payment_terms_days: z.number().int(), method: z.enum(["ach", "wire"]),
    currency: z.string().length(3).optional(), foreign_monthly_cents: NonNegCents.optional(),
  }),
  text: z.string().min(1),
  recorded_time: IsoTs,
});
export type WorldContract = z.infer<typeof WorldContract>;

/** Rates are USD per one unit of the foreign currency, times 1,000,000: 1.1000 is 1100000. No float touches a rate. */
const RatePpm = z.number().int().positive();

export const WorldInvoice = z.object({
  id: z.string().min(1), party_id: z.string().min(1), contract_id: z.string().min(1),
  issue_date: IsoDate, due_date: IsoDate, total_cents: NonNegCents,
  /** Billed in a foreign currency. `total_cents` stays USD at the booked rate, so the AR control account still ties. */
  fx: z.object({ currency: z.string().length(3), foreign_total_cents: NonNegCents, booked_rate_ppm: RatePpm }).optional(),
  /** First month of the service it bills, when that is not the month it is issued in (invoiced in advance). `YYYY-MM`. */
  service_from: z.string().regex(/^\d{4}-\d{2}$/).optional(),
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
  /** A foreign-currency receipt the humans settled: what the rate moving cost (positive) or gave (negative), to 7100. */
  fx_loss_cents: Cents.optional(),
});
export type HistorySettlement = z.infer<typeof HistorySettlement>;

export const WorldBankTxn = z.object({
  id: z.string().min(1), posted_date: IsoDate, amount_cents: Cents, descriptor: z.string().min(1),
  method: z.enum(["ach", "wire", "check", "card", "other"]), recorded_time: IsoTs,
  history: HistorySettlement.optional(),
  /** Which of our bank accounts: a key of `World.bank.accounts`. Absent in a one-account world. */
  account: z.string().optional(),
  /** A receipt the bank converted. `amount_cents` is the USD that landed: foreign x rate, less the fee. */
  fx: z.object({
    currency: z.string().length(3), foreign_amount_cents: NonNegCents, rate_ppm: RatePpm, fee_cents: NonNegCents,
    /** `World.mail` id of the bank's credit advice, which states the foreign amount, the rate and the fee. Closed months keep none. */
    advice_mail_id: z.string().min(1).optional(),
  }).optional(),
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

export const WorldEntity = z.object({ id: z.string().min(1), name: z.string().min(1), country: z.string().length(2) });
export const WorldBankAccount = z.object({ id: z.string().min(1), entity: z.string().min(1), label: z.string().min(1), opening_balance_cents: Cents });

export const World = z.object({
  meta: z.object({ seed: z.number().int(), company: z.string(), version: z.number().int(), live_period: z.string(), history_periods: z.array(z.string()) }),
  periods: z.array(z.object({ id: z.string(), status: z.enum(["open", "closing", "locked"]) })),
  people: z.array(WorldPerson),
  parties: z.array(WorldParty),
  contracts: z.array(WorldContract),
  invoices: z.array(WorldInvoice),
  bills: z.array(WorldBill),
  /** Our legal entities. Labels only: the ledger is one set of books in USD. Absent in a one-entity world. */
  entities: z.array(WorldEntity).optional(),
  /** `accounts` absent: one account named `account`, one bank file. Present: one file per account, every txn names its own. */
  bank: z.object({ account: z.string(), opening_balance_cents: Cents, accounts: z.array(WorldBankAccount).optional(), txns: z.array(WorldBankTxn) }),
  mail: z.array(WorldMail),
  chat: z.array(WorldChat),
  crm: z.object({ deals: z.array(WorldDeal), notes: z.array(WorldCrmNote) }),
  files: z.array(WorldFile),
  /** Entries the humans posted by journal in the seeded history, such as a month-end remeasurement and its reversal. */
  journals: z.array(z.object({
    id: z.string().min(1), date: IsoDate, memo: z.string().min(1), party_id: z.string().optional(),
    lines: z.array(z.object({ account: z.string().min(1), debit_cents: NonNegCents, credit_cents: NonNegCents })).min(2),
  })).optional(),
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
  /** A shortfall with more than one cause, in USD cents. The parts sum to `shortfall_cents`. */
  causes?: { fx_loss_cents: number; bank_fee_cents: number; withheld_cents: number };
  expected: string;
}
