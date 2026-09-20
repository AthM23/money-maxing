/** trace.source values the contract schema allows. */
export type TraceSource = "qbo" | "bank" | "gmail" | "slack" | "contract" | "workbook" | "crm" | "file";

/**
 * What every connector hands to ingestion. Connectors never write tables: they fetch, shape and date.
 * `recorded_time` is when the company's systems knew it (the world's clock), never when we pulled it.
 */
export interface RawItem {
  source: TraceSource;
  kind: string;
  /** Stable id in the source system. With `source` it is the idempotency key. */
  external_id: string;
  event_time: string;
  recorded_time: string;
  payload: Record<string, unknown>;
  /** Hints for entity resolution, tried in order: explicit id, email addresses, free text (bank descriptor). */
  party_hint?: { party_id?: string; emails?: string[]; text?: string };
  /** Bank lines only: ingestion also writes the `bank_txn` row the ledger tools read. */
  bank_txn?: { id: string; posted_date: string; amount_cents: number; descriptor: string; method: string };
}

export interface Connector {
  name: string;
  pull(): Promise<RawItem[]>;
}

/** Payload shapes shared by the local stores and the live connectors, so a trace reads the same either way. */
export interface MailPayload { thread_id: string; from: string; to: string[]; cc: string[]; subject: string; date: string; body: string }
export interface ChatPayload { channel: string; user: string; user_name?: string; ts: string; text: string }
