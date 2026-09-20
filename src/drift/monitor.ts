import { poll, subscribe, type BusEvent } from "../bus/bus.js";
import type { Db } from "../ledger/db.js";
import { bankUnmatched } from "../ledger/read.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { runCrmVsSchedule, type C1Finding } from "./crmVsSchedule.js";
import { runInvoiceVsCash, type DriftFinding } from "./invoiceVsCash.js";

const SUBSCRIBER = "drift";
const TOPICS = ["ingest.committed", "evidence.reversioned", "rev.schedule.revised", "fact.activated"] as const;

/** C2 looks again when the bank moved. */
const touchesBank = (e: BusEvent): boolean => (e.topic === "ingest.committed" || e.topic === "evidence.reversioned") && e.payload.source === "bank";
/** C1 looks again when either side of its comparison moved (a CRM deal, a schedule) or a fact that could explain it went active. */
const touchesC1 = (e: BusEvent): boolean => e.topic === "rev.schedule.revised" || e.topic === "fact.activated" || e.payload.source === "crm";

/**
 * Run the comparators whose inputs changed since this subscriber last looked. One pass per batch. Returns the C2
 * findings, as it always has (the ingest CLI counts them); C1 runs here too, and `driftC1Once` is the way to read
 * what it found.
 */
export async function driftOnce(db: Db, clock: Clock = systemClock): Promise<DriftFinding[]> {
  let bankChanged = false;
  let c1Changed = false;
  await poll(db, SUBSCRIBER, TOPICS, (e) => {
    if (touchesBank(e)) bankChanged = true;
    if (touchesC1(e)) c1Changed = true;
  });
  if (c1Changed) runCrmVsSchedule(db, clock);
  return bankChanged ? runInvoiceVsCash(db, clock) : [];
}

/**
 * C1 under its own cursor, for a caller that wants its findings. The comparator is idempotent, so it does not matter
 * whether `driftOnce` got to the same events first: the finding then says `opened: false`.
 */
export async function driftC1Once(db: Db, clock: Clock = systemClock): Promise<C1Finding[]> {
  let changed = false;
  await poll(db, `${SUBSCRIBER}-c1`, TOPICS, (e) => {
    if (touchesC1(e)) changed = true;
  });
  return changed ? runCrmVsSchedule(db, clock) : [];
}

export function startDriftMonitor(db: Db, clock: Clock = systemClock): () => void {
  return subscribe(db, `${SUBSCRIBER}-loop`, TOPICS, (e) => {
    if (touchesBank(e)) runInvoiceVsCash(db, clock);
    if (touchesC1(e)) runCrmVsSchedule(db, clock);
  });
}

interface EndCondition { bank_txn_applied?: string; docs_settled?: string[] }

/**
 * Intent as first-class state: an intent closes when its end condition holds in the ledger, not when an agent says
 * it is done. For C2 that is: the bank line is fully applied and every document it related to is settled.
 * Initech does not close after the cash posts, because $1,200 is still owed on INV-1042. The runtime's
 * settleIntent moves an attempted case to waiting_on_human; this only ever closes one that is still open.
 */
export function closeSettledIntents(db: Db, clock: Clock = systemClock): string[] {
  const open = db.prepare("SELECT id, end_condition_json FROM intent WHERE status = 'open' AND end_condition_json IS NOT NULL").all() as { id: string; end_condition_json: string }[];
  const unmatched = new Set(bankUnmatched(db).map((t) => t.id));
  const closed: string[] = [];
  for (const row of open) {
    const end = JSON.parse(row.end_condition_json) as EndCondition;
    if (!end.bank_txn_applied || unmatched.has(end.bank_txn_applied)) continue;
    const stillOpen = (end.docs_settled ?? []).some((id) => {
      const doc = db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(id) as { open_cents: number } | undefined;
      return (doc?.open_cents ?? 0) > 0;
    });
    if (stillOpen) continue;
    db.prepare("UPDATE intent SET status = 'resolved', closed_at = ? WHERE id = ? AND status = 'open'").run(clock.now(), row.id);
    closed.push(row.id);
  }
  return closed;
}
