import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { newId } from "../runtime/ids.js";

export interface RippleInput {
  intent_id: string;
  function: string;
  /** e.g. 'rev_schedule_revision', 'forecast_version', 'checklist_tick', 'qbo_credit_memo' */
  kind: string;
  /** Id of the thing in its own table or system. With intent, function and kind it is the idempotency key. */
  ref: string;
  summary: string;
  before_cents?: number | null;
  after_cents?: number | null;
  delta_cents?: number | null;
  event_id?: number | null;
  /** When the ripple has a decision behind it, an `artifact` row is written too (the contract's own record). */
  artifact?: { decision_id: string; system: string };
}

/**
 * Record what one intent changed in one function. Idempotent on (intent, function, kind, ref): bus delivery is
 * at-least-once, so every engine handler may call this twice. Returns false when the row already existed.
 */
export function recordRipple(db: Db, r: RippleInput, clock: Clock = systemClock): boolean {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO ripple (intent_id, function, kind, ref, summary, before_cents, after_cents, delta_cents, event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(r.intent_id, r.function, r.kind, r.ref, r.summary, r.before_cents ?? null, r.after_cents ?? null, r.delta_cents ?? null, r.event_id ?? null, clock.now());
  if (info.changes === 0) return false;
  if (r.artifact) {
    db.prepare("INSERT INTO artifact (id, decision_id, intent_id, function, system, external_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(newId("art"), r.artifact.decision_id, r.intent_id, r.function, r.artifact.system, r.ref, r.kind, clock.now());
  }
  return true;
}
