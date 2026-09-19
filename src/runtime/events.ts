import type { Topic } from "../contract/topics.js";
import type { Clock } from "./config.js";
import type { Db } from "./db.js";

export interface EmitInput {
  topic: Topic;
  from_function: string;
  intent_id: string | null;
  payload: Record<string, unknown>;
}

/** Append one event to the bus table. Consumers poll by id; nothing here calls them. */
export function emit(db: Db, clock: Clock, e: EmitInput): number {
  const info = db
    .prepare("INSERT INTO event (ts, topic, from_function, intent_id, payload_json) VALUES (?, ?, ?, ?, ?)")
    .run(clock.now(), e.topic, e.from_function, e.intent_id, JSON.stringify(e.payload));
  return Number(info.lastInsertRowid);
}
