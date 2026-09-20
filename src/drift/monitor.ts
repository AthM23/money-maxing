import { poll, subscribe } from "../bus/bus.js";
import type { Db } from "../ledger/db.js";
import { bankUnmatched } from "../ledger/read.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { runInvoiceVsCash, type DriftFinding } from "./invoiceVsCash.js";

const SUBSCRIBER = "drift";

/** Run the comparators if anything new reached the bank since this subscriber last looked. One pass per batch. */
export async function driftOnce(db: Db, clock: Clock = systemClock): Promise<DriftFinding[]> {
  let bankChanged = false;
  await poll(db, SUBSCRIBER, ["ingest.committed", "evidence.reversioned"], (e) => {
    if (e.payload.source === "bank") bankChanged = true;
  });
  return bankChanged ? runInvoiceVsCash(db, clock) : [];
}

export function startDriftMonitor(db: Db, clock: Clock = systemClock): () => void {
  return subscribe(db, `${SUBSCRIBER}-loop`, ["ingest.committed", "evidence.reversioned"], (e) => {
    if (e.payload.source === "bank") runInvoiceVsCash(db, clock);
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
