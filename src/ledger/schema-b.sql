-- Person B's lane tables. Additive to src/contract/schema.sql and never read by the kernel or an agent tool,
-- so they live here rather than in the jointly owned contract. Applied by openWorldDb().

-- one cursor per bus subscriber, so a restarted process resumes instead of replaying the bus
CREATE TABLE IF NOT EXISTS event_cursor (
  subscriber TEXT PRIMARY KEY, last_event_id INTEGER NOT NULL DEFAULT 0
);
-- world id -> external id per target system. Makes seeding idempotent and --reset possible.
CREATE TABLE IF NOT EXISTS seed_manifest (
  world_id TEXT NOT NULL, system TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL, seeded_at TEXT NOT NULL,
  PRIMARY KEY (world_id, system)
);
-- bank lines the humans already matched in the seeded history (Q2). bank.unmatched excludes them.
CREATE TABLE IF NOT EXISTS bank_match_seed (
  bank_txn_id TEXT PRIMARY KEY, entry_id TEXT NOT NULL
);
-- drift dedupe: the same difference updates its intent, it never opens a second one (intent has no dedupe column)
CREATE TABLE IF NOT EXISTS drift_case (
  dedupe_key TEXT PRIMARY KEY, comparator TEXT NOT NULL, intent_id TEXT NOT NULL REFERENCES intent(id),
  delta_cents INTEGER NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
);
