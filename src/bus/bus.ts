import { TOPICS, type Topic } from "../contract/topics.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { emit as appendEvent, type EmitInput } from "../runtime/events.js";
import type { Db } from "../ledger/db.js";

const TOPIC_SET: ReadonlySet<string> = new Set(TOPICS);

export interface BusEvent {
  id: number;
  ts: string;
  topic: Topic;
  from_function: string;
  intent_id: string | null;
  payload: Record<string, unknown>;
}

/** Append to the bus. Same table and row shape as the runtime's emit; this one refuses a topic outside the 50. */
export function emit(db: Db, e: EmitInput, clock: Clock = systemClock): number {
  if (!TOPIC_SET.has(e.topic)) throw new Error(`unknown event topic ${e.topic}`);
  return appendEvent(db, clock, e);
}

interface EventRow { id: number; ts: string; topic: Topic; from_function: string; intent_id: string | null; payload_json: string }

/**
 * Deliver every event after this subscriber's cursor, in bus order, to `handler`. The cursor moves after each
 * event, so a crash re-delivers at most the one in flight: handlers must be idempotent (at-least-once).
 * Returns the number handled.
 */
export async function poll(db: Db, subscriber: string, topics: readonly Topic[], handler: (e: BusEvent) => void | Promise<void>): Promise<number> {
  db.prepare("INSERT OR IGNORE INTO event_cursor (subscriber, last_event_id) VALUES (?, 0)").run(subscriber);
  const cursor = (db.prepare("SELECT last_event_id AS id FROM event_cursor WHERE subscriber = ?").get(subscriber) as { id: number }).id;
  const rows = db.prepare("SELECT id, ts, topic, from_function, intent_id, payload_json FROM event WHERE id > ? ORDER BY id LIMIT 500").all(cursor) as EventRow[];
  const advance = db.prepare("UPDATE event_cursor SET last_event_id = ? WHERE subscriber = ?");
  let handled = 0;
  for (const row of rows) {
    if (topics.includes(row.topic)) {
      await handler({ id: row.id, ts: row.ts, topic: row.topic, from_function: row.from_function, intent_id: row.intent_id, payload: JSON.parse(row.payload_json) as Record<string, unknown> });
      handled++;
    }
    advance.run(row.id, subscriber);
  }
  return handled;
}

/** Poll on an interval until stopped. One poll at a time per subscriber; an error is reported and the loop goes on. */
export function subscribe(
  db: Db, subscriber: string, topics: readonly Topic[], handler: (e: BusEvent) => void | Promise<void>,
  opts: { interval_ms?: number; on_error?: (err: unknown) => void } = {},
): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    poll(db, subscriber, topics, handler)
      .catch((err: unknown) => (opts.on_error ?? ((e) => console.error(`[bus:${subscriber}]`, e)))(err))
      .finally(() => { busy = false; });
  }, opts.interval_ms ?? 500);
  return () => clearInterval(timer);
}
