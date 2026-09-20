import { accountName } from "../src/ledger/accounts.js";
import type { Db } from "../src/runtime/db.js";

/**
 * The modules beyond cash: forecast, close, revenue and reports. Each one reads tables another lane already fills
 * (lane B's spine: `forecast_line`, `checklist_item`, `rev_schedule`) or the ledger itself, and says so plainly when a
 * database does not have them. Nothing here computes a number the books do not hold.
 */
export interface Table { columns: string[]; rows: (string | number | null)[][]; money_columns: number[] }

function hasTable(db: Db, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

/** The 13-week cash forecast as lane B last rebuilt it: opening cash, then expected receipts by week. */
export function forecastView(db: Db): { available: boolean; as_of?: string; weeks?: { week: string; inflow_cents: number; balance_cents: number }[]; not_modelled?: string[] } {
  if (!hasTable(db, "forecast_line")) return { available: false };
  const asOf = (db.prepare("SELECT MAX(as_of) AS a FROM forecast_line").get() as { a: string | null }).a;
  if (!asOf) return { available: false };
  const lines = db.prepare("SELECT week, kind, source_ref, amount_cents FROM forecast_line WHERE as_of = ? ORDER BY week").all(asOf) as { week: string; kind: string; source_ref: string | null; amount_cents: number }[];
  const opening = lines.filter((l) => l.kind === "opening_cash").reduce((n, l) => n + l.amount_cents, 0);
  const byWeek = new Map<string, number>();
  for (const l of lines) if (l.kind !== "opening_cash" && l.kind !== "not_modelled") byWeek.set(l.week, (byWeek.get(l.week) ?? 0) + l.amount_cents);
  let balance = opening;
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, inflow]) => ({ week, inflow_cents: inflow, balance_cents: (balance += inflow) }));
  return { available: true, as_of: asOf, weeks, not_modelled: lines.filter((l) => l.kind === "not_modelled").map((l) => l.source_ref ?? "") };
}

export function closeView(db: Db): { available: boolean; period?: string; items?: { area: string; name: string; status: string; reason: string | null }[]; done?: number } {
  if (!hasTable(db, "checklist_item")) return { available: false };
  const period = (db.prepare("SELECT MAX(period) AS p FROM checklist_item").get() as { p: string | null }).p;
  if (!period) return { available: false };
  const items = db.prepare("SELECT function AS area, name, status, blocked_reason AS reason FROM checklist_item WHERE period = ? ORDER BY rowid").all(period) as { area: string; name: string; status: string; reason: string | null }[];
  return { available: true, period, items, done: items.filter((i) => i.status === "done").length };
}

export function revenueView(db: Db): { available: boolean; contracts?: unknown[] } {
  if (!hasTable(db, "contract") || !hasTable(db, "rev_schedule")) return { available: false };
  const contracts = db
    .prepare(
      `SELECT c.id, c.party_id, p.name AS party, c.start_date, c.end_date, c.value_cents,
              s.id AS schedule_id, s.version, s.status AS schedule_status, s.method, s.total_cents AS scheduled_cents
       FROM contract c LEFT JOIN party p ON p.id = c.party_id
       LEFT JOIN rev_schedule s ON s.contract_id = c.id AND s.version = (SELECT MAX(version) FROM rev_schedule s2 WHERE s2.contract_id = c.id)
       ORDER BY c.value_cents DESC`,
    )
    .all() as { schedule_id: string | null }[];
  const lines = db.prepare("SELECT period, amount_cents FROM rev_schedule_line WHERE schedule_id = ? ORDER BY period");
  return { available: true, contracts: contracts.map((c) => ({ ...c, lines: c.schedule_id ? lines.all(c.schedule_id) : [] })) };
}

/** What customers owe, by how late it is, as of the last day of the month being closed. */
export function arAgeing(db: Db, asOf: string): Table {
  const rows = db
    .prepare(
      `SELECT COALESCE(p.name, i.party_id) AS customer,
              SUM(CASE WHEN julianday(?) - julianday(i.due_date) <= 0 THEN i.open_cents ELSE 0 END) AS current_cents,
              SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 1 AND 30 THEN i.open_cents ELSE 0 END) AS d30,
              SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 31 AND 60 THEN i.open_cents ELSE 0 END) AS d60,
              SUM(CASE WHEN julianday(?) - julianday(i.due_date) > 60 THEN i.open_cents ELSE 0 END) AS d90,
              SUM(i.open_cents) AS total
       FROM invoice i LEFT JOIN party p ON p.id = i.party_id WHERE i.open_cents > 0 GROUP BY i.party_id ORDER BY total DESC`,
    )
    .all(asOf, asOf, asOf, asOf) as { customer: string; current_cents: number; d30: number; d60: number; d90: number; total: number }[];
  const body = rows.map((r) => [r.customer, r.current_cents, r.d30, r.d60, r.d90, r.total]);
  const sum = (k: 1 | 2 | 3 | 4 | 5): number => body.reduce((n, r) => n + (r[k] as number), 0);
  return { columns: ["Customer", "Current", "1–30 days", "31–60 days", "Over 60 days", "Total open"], money_columns: [1, 2, 3, 4, 5], rows: [["Total", sum(1), sum(2), sum(3), sum(4), sum(5)], ...body] };
}

export function trialBalance(db: Db, period: string): Table {
  const rows = db
    .prepare(
      `SELECT l.account, SUM(l.debit_cents) AS dr, SUM(l.credit_cents) AS cr FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id
       WHERE e.period <= ? GROUP BY l.account ORDER BY l.account`,
    )
    .all(period) as { account: string; dr: number; cr: number }[];
  const body = rows.map((r) => [`${r.account} · ${accountName(r.account)}`, Math.max(r.dr - r.cr, 0), Math.max(r.cr - r.dr, 0)]);
  const total = (k: 1 | 2): number => body.reduce((n, r) => n + (r[k] as number), 0);
  return { columns: ["Account", "Debit", "Credit"], money_columns: [1, 2], rows: [...body, ["Total", total(1), total(2)]] };
}

export function cashByWeek(db: Db, period: string): { week: string; cents: number }[] {
  return db.prepare("SELECT strftime('%Y-%m-%d', posted_date, 'weekday 0', '-6 days') AS week, SUM(amount_cents) AS cents FROM bank_txn WHERE substr(posted_date, 1, 7) = ? AND amount_cents > 0 GROUP BY week ORDER BY week")
    .all(period) as { week: string; cents: number }[];
}

/**
 * "Ask the books." A question is matched to a report that code builds from the ledger; no model writes a number here,
 * and the answer says which tables it came from. A question it has no report for is answered with what it can do.
 */
export function ask(db: Db, question: string, period: string): { title: string; summary: string; table: Table | null; source: string } {
  const q = question.toLowerCase();
  const lastDay = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (/ag(e)?ing|owe|outstanding|receivable|\bar\b/.test(q)) {
    const table = arAgeing(db, lastDay);
    const total = table.rows[0]?.[5] as number | undefined;
    return { title: "AR ageing by customer", summary: `${table.rows.length - 1} customers owe ${dollars(total ?? 0)} as of ${lastDay}.`, table, source: "invoice (open balances and due dates)" };
  }
  if (/trial|balance sheet|\btb\b|ledger/.test(q)) return { title: `Trial balance through ${period}`, summary: "Debits and credits by account. The last row has to foot.", table: trialBalance(db, period), source: "gl_entry, gl_line" };
  if (/cash|bank|receipts?/.test(q)) {
    const weeks = cashByWeek(db, period);
    return { title: `Cash received by week, ${period}`, summary: `${dollars(weeks.reduce((n, w) => n + w.cents, 0))} landed in ${weeks.length} weeks.`, table: { columns: ["Week starting", "Cash received"], money_columns: [1], rows: weeks.map((w) => [w.week, w.cents]) }, source: "bank_txn" };
  }
  if (/wait|person|approv|question|stuck|open/.test(q)) {
    const rows = db.prepare("SELECT i.id, json_extract(i.case_json, '$.party_id') AS party, i.status, i.question FROM intent i WHERE i.status != 'resolved' AND i.case_json IS NOT NULL ORDER BY i.created_at").all() as { id: string; party: string; status: string; question: string }[];
    return { title: "What is not settled yet", summary: `${rows.length} case(s) are open or waiting for a person.`, table: { columns: ["Customer", "Status", "Question"], money_columns: [], rows: rows.map((r) => [r.party, r.status.replaceAll("_", " "), r.question]) }, source: "intent" };
  }
  return { title: "I can build these from the books", summary: "AR ageing by customer · the trial balance · cash received by week · what is waiting for a person. Each answer is computed by code from the ledger, and says which tables it read.", table: null, source: "—" };
}

const dollars = (cents: number): string => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
