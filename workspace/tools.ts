import { z } from "zod";
import { buildFleet } from "../src/readmodel/fleet.js";
import type { Db } from "../src/runtime/db.js";
import { arAgeing, cashByWeek, closeView, forecastView, revenueView, trialBalance, type Table } from "./modules.js";
import { caseView } from "./views.js";

/**
 * The books as tools. One registry, three callers: the Ask page's code router, the Ask page's agent, and an MCP
 * server when one is shipped. Every tool is read-only, takes validated input, and returns a table or facts that code
 * computed from the ledger, with the tables it read. A model that uses them chooses and explains; it never computes.
 */
export interface ToolContext { db: Db; period: string }
export interface ToolResult { title: string; summary: string; table: Table | null; source: string }
export interface BookTool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  icon: string;
  example: string;
  input: S;
  run(ctx: ToolContext, input: z.infer<S>): ToolResult;
}

const None = z.object({});
const lastDay = (period: string): string => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
const usd = (cents: number): string => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function tool<S extends z.ZodType>(t: BookTool<S>): BookTool<S> { return t; }

export const TOOLS = [
  tool({ name: "ar_ageing", title: "AR ageing", icon: "t_ageing", example: "Who owes us money, and how late is it?", input: None,
    description: "What each customer owes and how overdue it is, as of the end of the month being closed.",
    run: ({ db, period }) => {
      const table = arAgeing(db, lastDay(period));
      return { title: "AR ageing by customer", summary: `${table.rows.length - 1} customers owe ${usd(Number(table.rows[0]?.[5] ?? 0))} as of ${lastDay(period)}.`, table, source: "invoice" };
    } }),
  tool({ name: "open_bills", title: "Bills on file", icon: "t_close", example: "What bills are open?", input: None,
    description: "Vendor bills on file that have not been posted or paid, newest first, each with its evidence.",
    run: ({ db }) => {
      const rows = db.prepare("SELECT b.id, p.name AS vendor, b.vendor_invoice_no AS ref, b.bill_date, b.service_period, b.total_cents, b.status FROM bill b JOIN party p ON p.id = b.party_id WHERE b.status NOT IN ('paid','void') ORDER BY b.bill_date DESC LIMIT 50")
        .all() as { id: string; vendor: string; ref: string; bill_date: string; service_period: string; total_cents: number; status: string }[];
      return { title: "Bills on file, not yet paid", summary: rows.length ? `${rows.length} open bill(s) totalling ${usd(rows.reduce((n, r) => n + r.total_cents, 0))}. Nothing posts until a person approves.` : "No open bills on file.",
        table: { columns: ["Vendor", "Ref", "Bill date", "Period", "Amount", "Status"], money_columns: [4], rows: rows.map((r) => [r.vendor, r.ref, r.bill_date, r.service_period, r.total_cents, r.status]) }, source: "bill, trace" };
    } }),
  tool({ name: "trial_balance", title: "Trial balance", icon: "t_balance", example: "Show me the trial balance", input: None,
    description: "Debit and credit balance of every ledger account through the month being closed. The totals must be equal.",
    run: ({ db, period }) => ({ title: `Trial balance through ${period}`, summary: "Debits and credits by account; the last row has to foot.", table: trialBalance(db, period), source: "gl_entry, gl_line" }) }),
  tool({ name: "cash_received", title: "Cash received", icon: "t_cashin", example: "How much cash came in this month?", input: None,
    description: "Cash that landed in the bank accounts during the month, by week.",
    run: ({ db, period }) => {
      const weeks = cashByWeek(db, period);
      return { title: `Cash received by week, ${period}`, summary: `${usd(weeks.reduce((n, w) => n + w.cents, 0))} landed across ${weeks.length} weeks.`, table: { columns: ["Week starting", "Cash received"], money_columns: [1], rows: weeks.map((w) => [w.week, w.cents]) }, source: "bank_txn" };
    } }),
  tool({ name: "waiting_on_people", title: "Not settled yet", icon: "t_waiting", example: "What is not settled yet?", input: None,
    description: "Every case that is not settled, saying which are still being worked (open) and which are waiting for a person's answer or approval.",
    run: ({ db }) => {
      const rows = db.prepare("SELECT json_extract(case_json, '$.party_id') AS party, status, question FROM intent WHERE status != 'resolved' AND case_json IS NOT NULL ORDER BY created_at").all() as { party: string; status: string; question: string }[];
      const waiting = rows.filter((r) => r.status === "waiting_on_human").length;
      return { title: "What is not settled yet", summary: `${rows.length - waiting} case(s) are open and still being worked; ${waiting} ${waiting === 1 ? "is" : "are"} waiting for a person.`, table: { columns: ["Customer", "Status", "Question"], money_columns: [], rows: rows.map((r) => [r.party, r.status.replaceAll("_", " "), r.question]) }, source: "intent" };
    } }),
  tool({ name: "explain_receipt", title: "Explain a receipt", icon: "t_receipt", example: "Why is Vossberg short?", input: z.object({ customer: z.string().min(2).max(80).describe("Customer name or id, or an invoice number") }),
    description: "How one customer's receipt was explained: the bank line, each book line with its account and who or what settled it, and what is still open.",
    run: ({ db }, { customer }) => explainReceipt(db, customer) }),
  tool({ name: "agent_activity", title: "What the agents did", icon: "t_agents", example: "What did the agents do, and what did it cost?", input: None,
    description: "What each kind of worker (code, each model tier, people) did this month: entries posted alone, parked, questions, drafts the kernel refused, model calls and cost.",
    run: ({ db }) => {
      const f = buildFleet(db);
      return { title: "Who did what", summary: `${f.totals.model_calls} model calls costing ${usd(Math.round(f.totals.cost_micros / 10_000))}; the kernel refused ${f.totals.kernel_refusals} draft(s).`, source: "decision, decision_step, approval",
        table: { columns: ["Worker", "Turns", "Posted alone", "Parked", "Asked", "Refused by kernel", "Model calls", "Cost"], money_columns: [7], rows: f.workers.map((w) => [w.worker, w.turns, w.posted_alone, w.parked, w.asked, w.kernel_refusals, w.model_calls, Math.round(w.cost_micros / 10_000)]) } };
    } }),
  tool({ name: "cash_forecast", title: "Expected receipts", icon: "t_forecast", example: "What receipts do we expect over the next weeks?", input: None,
    description: "Receipts expected by week from open invoices and scheduled billing, added to opening cash. Payments out are not modelled, so this is not a full cash forecast. Also lists what it says it does not model.",
    run: ({ db }) => {
      const f = forecastView(db);
      if (!f.available) return { title: "Expected receipts", summary: "This database has no forecast. It is built by pnpm spine.", table: null, source: "forecast_line" };
      return { title: `Expected receipts as of ${String(f.as_of).split("/")[0]}`, summary: f.not_modelled?.filter(Boolean).length ? `Not modelled, and said so: ${f.not_modelled.filter(Boolean).join("; ")}.` : "Everything on file is modelled.", source: "forecast_line",
        table: { columns: ["Week", "Expected receipts", "Opening cash + receipts"], money_columns: [1, 2], rows: (f.weeks ?? []).map((w) => [w.week, w.inflow_cents, w.balance_cents]) } };
    } }),
  tool({ name: "close_status", title: "Close status", icon: "t_close", example: "Can we close the month?", input: None,
    description: "The close checklist: each item is a test on the ledger, with its status and what a blocked item is waiting on.",
    run: ({ db }) => {
      const c = closeView(db);
      if (!c.available) return { title: "Close status", summary: "This database has no close checklist. It is built by pnpm spine.", table: null, source: "checklist_item" };
      return { title: `Close run ${c.period}`, summary: `${c.done} of ${c.items?.length ?? 0} items hold in the ledger today.`, source: "checklist_item", table: { columns: ["Task", "Status", "Waiting on"], money_columns: [], rows: (c.items ?? []).map((i) => [i.name, i.status.replaceAll("_", " "), i.reason]) } };
    } }),
  tool({ name: "revenue_schedules", title: "Revenue schedules", icon: "t_revenue", example: "What revenue is scheduled by customer?", input: None,
    description: "Every contract with its value and the revenue schedule built from it.",
    run: ({ db }) => {
      const r = revenueView(db);
      if (!r.available) return { title: "Revenue schedules", summary: "This database has no revenue schedules. They are built by pnpm spine.", table: null, source: "contract, rev_schedule" };
      const rows = (r.contracts ?? []) as { party: string; id: string; value_cents: number; scheduled_cents: number | null; version: number | null }[];
      return { title: "Contracts and schedules", summary: `${rows.length} contracts on file.`, source: "contract, rev_schedule", table: { columns: ["Customer", "Contract", "Value", "Scheduled", "Version"], money_columns: [2, 3], rows: rows.map((c) => [c.party, c.id, c.value_cents, c.scheduled_cents, c.version === null ? "none" : `v${c.version}`]) } };
    } }),
  tool({ name: "policies_and_memory", title: "Policies and memory", icon: "t_policies", example: "What rules has it learned?", input: None,
    description: "Rules derived from what the team booked (with status and version) and facts people told it (with scope and end date).",
    run: ({ db }) => {
      const rules = db.prepare("SELECT COALESCE(code, id) AS code, version, status, name FROM policy ORDER BY code, version").all() as { code: string; version: number; status: string; name: string }[];
      const facts = db.prepare("SELECT party_id, predicate, status, valid_to FROM fact WHERE status IN ('active','candidate') ORDER BY learned_at").all() as { party_id: string; predicate: string; status: string; valid_to: string }[];
      return { title: "What it has learned", summary: `${rules.length} rule version(s) and ${facts.length} remembered fact(s).`, source: "policy, fact",
        table: { columns: ["Kind", "What", "Status"], money_columns: [], rows: [...rules.map((r) => ["rule", r.name, `${r.status} · v${r.version}`]), ...facts.map((f) => ["fact", `${f.party_id}: ${f.predicate.replaceAll("_", " ")} until ${f.valid_to}`, f.status])] } };
    } }),
];

/** Finds the customer by id, name or invoice number, then reads the case the same way the Cash page does. */
function explainReceipt(db: Db, needle: string): ToolResult {
  const like = `%${needle.toLowerCase()}%`;
  // A customer has many cases over time. The one being asked about is the one still unsettled, or else the one that was
  // shortest: never simply the oldest.
  const row = db
    .prepare(
      `SELECT i.id FROM intent i LEFT JOIN party p ON p.id = json_extract(i.case_json, '$.party_id')
       WHERE i.case_json IS NOT NULL AND json_extract(i.case_json, '$.bank_txn_id') IS NOT NULL
         AND (lower(json_extract(i.case_json, '$.party_id')) LIKE ? OR lower(COALESCE(p.name, '')) LIKE ? OR lower(i.case_json) LIKE ?)
       ORDER BY (i.status = 'resolved'), COALESCE(json_extract(i.case_json, '$.shortfall_cents'), 0) DESC, i.created_at DESC LIMIT 1`,
    )
    .get(like, like, like) as { id: string } | undefined;
  const view = row ? (caseView(db, row.id) as { receipt: { party_name: string | null; party_id: string; shortfall_cents: number; status: string }; lines: { label: string; account: string | null; amount_cents: number; state: string; settled_by: string }[] } | null) : null;
  if (!view) return { title: "Explain a receipt", summary: `No receipt found for "${needle}".`, table: null, source: "intent" };
  const r = view.receipt;
  // The subtotals are stated here, by code, so that nobody downstream has to add anything up.
  const explained = view.lines.filter((l) => l.state === "posted" && l.label !== "Cash applied").reduce((n, l) => n + l.amount_cents, 0);
  const open = view.lines.filter((l) => l.state !== "posted").reduce((n, l) => n + l.amount_cents, 0);
  const split = r.shortfall_cents > 0 ? ` Of the ${usd(r.shortfall_cents)} shortfall, ${usd(explained)} is explained and posted and ${usd(open)} is still open.` : "";
  return { title: `${r.party_name ?? r.party_id}: ${r.shortfall_cents > 0 ? `${usd(r.shortfall_cents)} short` : "paid in full"}`, summary: `The case is ${r.status.replaceAll("_", " ")}.${split}`, source: "decision, gl_line, bank_txn_fx, invoice_fx",
    table: { columns: ["Book line", "Account", "Amount", "State", "Settled by"], money_columns: [2], rows: view.lines.map((l) => [l.label, l.account ?? "", l.amount_cents, l.state, l.settled_by]) } };
}

export function toolByName(name: string): BookTool | undefined {
  return (TOOLS as readonly BookTool[]).find((t) => t.name === name);
}
