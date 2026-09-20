import { z } from "zod";
import type { ToolSpec } from "../agents/tools/read.js";
import { bankUnmatched, getInvoice, trialBalance } from "./read.js";

/**
 * Ledger read tools in Person A's ToolSpec shape, for the spec §8 names the agent layer does not carry yet
 * (`ledger.open_invoices` and `bank.get_transaction` already exist in src/agents/tools/read.ts, replay guard
 * included). Live only: in replay they answer nothing, because today's ledger already knows how Q2 ended.
 * To give them to an agent, spread LEDGER_TOOL_SPECS into READ_TOOL_SPECS.
 */
const liveOnly = <T>(mode: "live" | "replay", run: () => T): T | { error: string } =>
  mode === "replay" ? { error: "not available in replay: the case file carries the balances as they stood" } : run();

export const LEDGER_TOOL_SPECS: ToolSpec[] = [
  {
    name: "ledger_get_invoice", registry_name: "ledger.get_invoice", input: z.object({ invoice_id: z.string().min(1) }),
    description: "One invoice: customer, dates, total and open balance in integer cents, and every application posted against it.",
    run: (i, env) => liveOnly(env.mode, () => getInvoice(env.db, String(i.invoice_id)) ?? { error: "no such invoice" }),
  },
  {
    name: "bank_unmatched", registry_name: "bank.unmatched", input: z.object({ side: z.enum(["credit", "debit"]).optional(), since: z.string().optional() }),
    description: "Bank lines not yet fully tied to the ledger, oldest first, with the cents still unapplied.",
    run: (i, env) => liveOnly(env.mode, () => bankUnmatched(env.db, { side: i.side as "credit" | "debit" | undefined, since: i.since ? String(i.since) : undefined })),
  },
  {
    name: "ledger_trial_balance", registry_name: "ledger.trial_balance", input: z.object({ as_of: z.string().optional() }),
    description: "Trial balance as of a date (default: everything posted). Balances are debits minus credits, in integer cents.",
    run: (i, env) => liveOnly(env.mode, () => trialBalance(env.db, i.as_of ? String(i.as_of) : undefined)),
  },
];
