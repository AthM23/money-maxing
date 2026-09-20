import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile, Proposal } from "../../contract/types.js";
import { accountName } from "../../ledger/accounts.js";
import type { Tier0Plan } from "../../router/tier0.js";
import type { Clock } from "../../runtime/config.js";
import type { Db } from "../../runtime/db.js";
import { newId } from "../../runtime/ids.js";
import { safeJson } from "../../runtime/lookups.js";
import { expenseHistory, isSteady, lastDayOf, median3, recurringExpenses, type ExpenseHistory } from "./history.js";

const usd = (cents: number): string => `USD ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (cents: number): string => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface UnbilledExpense { party_id: string; party: string; account: string; account_name: string; period: string; prior: ExpenseHistory["prior"]; steady: boolean; estimate_cents: number; intent_id: string | null; status: string | null }

/** Recurring vendor expenses with nothing booked for the month being closed: what the close still has to account for. */
export function unbilledExpenses(db: Db, period: string): UnbilledExpense[] {
  const name = db.prepare("SELECT name FROM party WHERE id = ?");
  return recurringExpenses(db, period).filter((h) => h.booked_cents === 0).map((h) => {
    const intent = caseFor(db, h.party_id, h.account, period);
    return { party_id: h.party_id, party: (name.get(h.party_id) as { name: string } | undefined)?.name ?? h.party_id, account: h.account, account_name: accountName(h.account), period,
      prior: h.prior, steady: isSteady(h), estimate_cents: median3(h), intent_id: intent?.id ?? null, status: intent?.status ?? null };
  });
}

function caseFor(db: Db, partyId: string, account: string, period: string): { id: string; status: string } | undefined {
  return db.prepare(
    `SELECT id, status FROM intent WHERE function = 'close' AND json_extract(case_json, '$.party_id') = ?
       AND json_extract(case_json, '$.accrual.account') = ? AND json_extract(case_json, '$.accrual.period') = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(partyId, account, period) as { id: string; status: string } | undefined;
}

/**
 * The close's own drift monitor: one case per recurring expense nobody has billed for the month. Opening a case books
 * nothing. It is asked once: a vendor and account with a case for that month does not get a second one.
 */
export function openAccrualCases(db: Db, clock: Clock, period: string): string[] {
  const opened: string[] = [];
  for (const u of unbilledExpenses(db, period).filter((x) => x.intent_id === null)) {
    const id = newId("int");
    const c: CaseFile = { intent_id: id, function: "close", party_id: u.party_id, entry_date: lastDayOf(period), doc_ids: [], expected_cents: u.estimate_cents, received_cents: 0,
      shortfall_cents: u.estimate_cents, method: "other", trace_ids: billTraces(db, u.party_id), accrual: { account: u.account, period } };
    db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'close', ?, 'close', 'open', ?, ?)")
      .run(id, `Accrue ${period} for ${u.party}: no bill received, ${u.account_name} was ${u.prior.map((p) => plain(p.cents)).join(", ")} in the three months before`, JSON.stringify(c), clock.now());
    opened.push(id);
  }
  return opened;
}

function billTraces(db: Db, partyId: string): string[] {
  return (db.prepare("SELECT trace_id FROM bill WHERE party_id = ? AND trace_id IS NOT NULL ORDER BY bill_date").all(partyId) as { trace_id: string }[]).map((r) => r.trace_id);
}

/**
 * The code tier for an accrual. A steady expense (three months within one percent) is estimated at its median, with
 * each month's bill quoted; the kernel redoes that arithmetic from the ledger (F11). An expense that moves is not
 * averaged by code: what it will be this month is for someone to find in the vendor's own words, so it is left to
 * the judgment tiers with the history in the notes.
 */
export function planAccrualTier0(db: Db, c: CaseFile): Tier0Plan {
  const meta = c.accrual;
  if (!meta) return { proposals: [], unexplained_cents: c.shortfall_cents, notes: ["this close case names no expense account to accrue"] };
  const h = expenseHistory(db, c.party_id, meta.account, meta.period);
  const history = h.prior.map((p) => `${p.period} ${usd(p.cents)}`).join(", ");
  if (h.booked_cents !== 0) return { proposals: [], unexplained_cents: 0, notes: [`${usd(h.booked_cents)} is already booked to ${meta.account} for ${meta.period}: nothing to accrue`] };
  if (!isSteady(h)) {
    return { proposals: [], unexplained_cents: c.shortfall_cents, notes: [`Accrue ${accountName(meta.account)} (account ${meta.account}) for ${meta.period}. The last three months were ${history}: it moves, so code does not average it. Find the amount for ${meta.period} in the vendor's own words.`] };
  }
  const amount = median3(h);
  const evidence = billQuotes(db, c.party_id, amount);
  if (evidence.length < 3) return { proposals: [], unexplained_cents: c.shortfall_cents, notes: [`The ledger shows ${history} but fewer than three of those bills can be quoted: a person has to look.`] };
  const memo = `Accrue ${accountName(meta.account)} for ${meta.period}: no bill received; ${history}`;
  const proposal: Proposal = {
    intent_id: c.intent_id, function: "close", kind: "accrual", party_id: c.party_id, entry_date: c.entry_date, applications: [], reversal_mode: "auto_next_period",
    entries: [{ account: meta.account, debit_cents: amount, credit_cents: 0, memo }, { account: ACCOUNTS.accrued_liabilities, debit_cents: 0, credit_cents: amount, memo }],
    evidence, policy_refs: [], fact_refs: [],
    judgment: [{ note: `No bill for ${meta.period} has arrived. The last three months were identical, so ${meta.period} is accrued at the same ${usd(amount)} and reverses when the bill is booked.`, confidence: "high" }],
  };
  return { proposals: [proposal], unexplained_cents: 0, notes: [memo] };
}

/** One quote per prior bill: the bill's own line stating the amount, as the vendor wrote it. */
function billQuotes(db: Db, partyId: string, cents: number): Proposal["evidence"] {
  const rows = db.prepare("SELECT b.id, b.service_period, b.trace_id, t.payload_json FROM bill b JOIN trace t ON t.id = b.trace_id WHERE b.party_id = ? AND b.total_cents = ? ORDER BY b.bill_date DESC LIMIT 3")
    .all(partyId, cents) as { id: string; service_period: string | null; trace_id: string; payload_json: string }[];
  return rows.flatMap((r) => {
    const body = (safeJson(r.payload_json) as { body?: string } | null)?.body ?? "";
    const line = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l.includes(plain(cents)));
    return line ? [{ claim: `${r.id}: billed for ${r.service_period ?? "the month"}`, trace_id: r.trace_id, quote: line }] : [];
  }).reverse();
}

/**
 * The close checklist's test for accruals, on the ledger like every other item: a recurring vendor expense with
 * nothing booked for the month is still to do, whether nobody has looked or an accrual is waiting for a person. With
 * no recurring vendor expense on file there is nothing to accrue and the item holds.
 */
export function accrualsCheck(db: Db, period: string): { done: boolean; reason: string; decision_ids: string[] } {
  const posted = (db.prepare(
    `SELECT d.id FROM decision d WHERE d.mode = 'live' AND d.kind = 'accrual' AND d.posted_at IS NOT NULL AND substr(json_extract(d.proposal_json, '$.entry_date'), 1, 7) = ? ORDER BY d.rowid`,
  ).all(period) as { id: string }[]).map((r) => r.id);
  const open = unbilledExpenses(db, period);
  if (open.length === 0) return { done: true, reason: posted.length ? `${posted.length} accrual(s) posted for ${period}; every recurring vendor expense has something booked` : "no recurring vendor expense is unbilled", decision_ids: posted };
  const parked = (db.prepare(
    `SELECT COUNT(*) AS n FROM decision d WHERE d.mode = 'live' AND d.kind = 'accrual' AND d.route = 'PROPOSE' AND d.posted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected') AND substr(json_extract(d.proposal_json, '$.entry_date'), 1, 7) = ?`,
  ).get(period) as { n: number }).n;
  const names = open.map((u) => `${u.party} (${u.account_name})`).join(", ");
  return { done: false, reason: `${open.length} recurring expense(s) have nothing booked for ${period}: ${names}${parked ? `; ${parked} accrual(s) are waiting for approval` : ""}`, decision_ids: posted };
}
