import { createHash } from "node:crypto";
import { emit } from "../bus/bus.js";
import { isRegisteredSource } from "../connectors/registry.js";
import type { Connector, RawItem } from "../connectors/types.js";
import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { canonicalJson } from "../runtime/persist.js";
import { traceId } from "./ids.js";
import { invalidateEvidence } from "./invalidate.js";
import { buildResolver, type Resolver } from "./resolve.js";

export interface IngestResult {
  committed: number;
  /** Same source, same id, same content: a re-pull is a no-op. */
  unchanged: number;
  /** Same source and id, different content: a new version, the old one kept (corpus A-24, H-6). */
  reversioned: number;
  refused: number;
  bank_txns: number;
}

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * The only writer of `trace` and `bank_txn`. Idempotent on (source, external_id): content is hashed, an identical
 * re-pull changes nothing, changed content becomes version n+1. Three clocks are kept apart: event_time and
 * recorded_time come from the source (the world's clock), ingested_at is ours and is never used for as-of reads.
 */
export function ingest(db: Db, items: RawItem[], clock: Clock = systemClock): IngestResult {
  const result: IngestResult = { committed: 0, unchanged: 0, reversioned: 0, refused: 0, bank_txns: 0 };
  const resolver = buildResolver(db);
  const run = db.transaction(() => {
    for (const item of items) ingestOne(db, clock, resolver, item, result);
  });
  run();
  return result;
}

/** Pull every connector, then ingest. A connector that throws (a malformed file) is refused whole, not half-loaded. */
export async function ingestAll(db: Db, connectors: Connector[], clock: Clock = systemClock): Promise<Record<string, IngestResult | { error: string }>> {
  const out: Record<string, IngestResult | { error: string }> = {};
  for (const c of connectors) {
    try {
      out[c.name] = ingest(db, await c.pull(), clock);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      emit(db, { topic: "ingest.refused", from_function: "ingest", intent_id: null, payload: { connector: c.name, reason } }, clock);
      out[c.name] = { error: reason };
    }
  }
  return out;
}

function ingestOne(db: Db, clock: Clock, resolver: Resolver, item: RawItem, result: IngestResult): void {
  // The registry is the gate, not a schema enum: a source nobody declared has no search tool and no provenance story.
  if (!isRegisteredSource(item.source)) {
    emit(db, { topic: "ingest.refused", from_function: "ingest", intent_id: null, payload: { source: item.source, external_id: item.external_id, reason: `source "${item.source}" is not in the connector registry (src/connectors/registry.ts)` } }, clock);
    result.refused++;
    return;
  }
  if (!TS.test(item.event_time) || !TS.test(item.recorded_time)) {
    emit(db, { topic: "ingest.refused", from_function: "ingest", intent_id: null, payload: { source: item.source, external_id: item.external_id, reason: "event_time and recorded_time must be ISO-8601 UTC" } }, clock);
    result.refused++;
    return;
  }
  const payloadJson = canonicalJson(item.payload);
  const hash = createHash("sha256").update(payloadJson).digest("hex");
  const latest = db
    .prepare("SELECT id, version, content_hash FROM trace WHERE source = ? AND external_id = ? ORDER BY version DESC LIMIT 1")
    .get(item.source, item.external_id) as { id: string; version: number; content_hash: string } | undefined;
  if (latest?.content_hash === hash) {
    result.unchanged++;
    return;
  }
  const version = (latest?.version ?? 0) + 1;
  const id = traceId(item.source, item.external_id, version);
  const partyId = resolver.resolve(item.party_hint);
  db.prepare(
    "INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, version, content_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, item.source, item.kind, item.external_id, item.event_time, item.recorded_time, clock.now(), partyId, version, hash, payloadJson);

  let bankTxnId: string | null = null;
  if (item.bank_txn) {
    bankTxnId = item.bank_txn.id;
    writeBankTxn(db, item.bank_txn, partyId, id, latest !== undefined);
    writeBankExtras(db, item.bank_txn);
    if (!latest) result.bank_txns++;
  }
  const base = { trace_id: id, source: item.source, kind: item.kind, external_id: item.external_id, party_id: partyId, bank_txn_id: bankTxnId, version };
  emit(db, { topic: "ingest.committed", from_function: "ingest", intent_id: null, payload: base }, clock);
  if (latest) {
    const affected = invalidateEvidence(db, latest.id, bankTxnId);
    emit(db, { topic: "evidence.reversioned", from_function: "ingest", intent_id: null, payload: { ...base, supersedes_trace_id: latest.id, affected_decision_ids: affected } }, clock);
    result.reversioned++;
  } else {
    result.committed++;
  }
}

function writeBankTxn(db: Db, t: NonNullable<RawItem["bank_txn"]>, partyId: string | null, trace: string, exists: boolean): void {
  if (exists) {
    // The bank restated a line. The row follows the newest version; decisions already taken keep citing the old trace.
    db.prepare("UPDATE bank_txn SET posted_date = ?, amount_cents = ?, descriptor = ?, method = ?, party_id = COALESCE(?, party_id), trace_id = ? WHERE id = ?")
      .run(t.posted_date, t.amount_cents, t.descriptor, t.method, partyId, trace, t.id);
    return;
  }
  db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id, trace_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(t.id, t.posted_date, t.amount_cents, t.descriptor, t.method, partyId, trace);
}

/**
 * What a wide bank file says beyond the line itself: which account it landed in, and what the bank converted. The
 * advice is named by its mail id, so its trace id is known before the mailbox has been read (ids are a pure function).
 */
function writeBankExtras(db: Db, t: NonNullable<RawItem["bank_txn"]>): void {
  if (t.label) {
    db.prepare(
      "INSERT INTO bank_txn_label (bank_txn_id, account_id, entity_id, currency) VALUES (?, ?, ?, ?) ON CONFLICT(bank_txn_id) DO UPDATE SET account_id = excluded.account_id, entity_id = excluded.entity_id, currency = excluded.currency",
    ).run(t.id, t.label.account_id, t.label.entity_id, t.label.currency);
  }
  if (t.fx) {
    db.prepare(
      "INSERT INTO bank_txn_fx (bank_txn_id, currency, foreign_amount_cents, rate_ppm, fee_cents, advice_trace_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(bank_txn_id) DO UPDATE SET currency = excluded.currency, foreign_amount_cents = excluded.foreign_amount_cents, rate_ppm = excluded.rate_ppm, fee_cents = excluded.fee_cents, advice_trace_id = excluded.advice_trace_id",
    ).run(t.id, t.fx.currency, t.fx.foreign_amount_cents, t.fx.rate_ppm, t.fx.fee_cents, t.fx.advice_ref ? traceId("gmail", t.fx.advice_ref) : null);
  }
}
