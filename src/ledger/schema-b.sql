-- Person B's lane tables. Additive to src/contract/schema.sql and never read by the kernel or an agent tool,
-- so they live here rather than in the jointly owned contract. Applied by openWorldDb().

-- one cursor per bus subscriber, so a restarted process resumes instead of replaying the bus
CREATE TABLE IF NOT EXISTS event_cursor (
  subscriber TEXT PRIMARY KEY, last_event_id INTEGER NOT NULL DEFAULT 0
);
-- world id -> external id per target system. Makes seeding idempotent and --reset possible.
-- `origin` is why the row exists: 'created' means the record is ours to remove, 'adopted' means it was already in the
-- target company and we only wrote down where it is. A reset may never touch an adopted record (see src/seed/quickbooks.ts).
-- NULL is a row written before this column existed: also never touched, because nothing says the record is ours.
CREATE TABLE IF NOT EXISTS seed_manifest (
  world_id TEXT NOT NULL, system TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL, seeded_at TEXT NOT NULL,
  origin TEXT CHECK (origin IN ('created','adopted')),
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

-- ───────────── Phase 2: engines, conductor, mirror, ripple (see src/engines/README.md)

-- revenue schedule engine (sheet 13). One active version per contract; a revision supersedes, it never edits.
CREATE TABLE IF NOT EXISTS rev_schedule (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES contract(id), party_id TEXT NOT NULL REFERENCES party(id),
  version INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('active','superseded')),
  method TEXT NOT NULL DEFAULT 'ratable_monthly',
  total_cents INTEGER NOT NULL,             -- equals SUM(rev_schedule_line.amount_cents) exactly
  modification_id TEXT,                     -- null for version 1
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, version)
);
CREATE TABLE IF NOT EXISTS rev_schedule_line (
  schedule_id TEXT NOT NULL REFERENCES rev_schedule(id), period TEXT NOT NULL,   -- 'YYYY-MM'
  amount_cents INTEGER NOT NULL,
  PRIMARY KEY (schedule_id, period)
);
-- what was recognised, per contract and period, whichever schedule version was active when it was proposed.
-- The line counts as recognised when decision.posted_at is set (recognition above materiality waits for approval).
CREATE TABLE IF NOT EXISTS rev_recognition (
  contract_id TEXT NOT NULL REFERENCES contract(id), period TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES rev_schedule(id), decision_id TEXT NOT NULL,
  PRIMARY KEY (contract_id, period)
);
-- one row per thing that changed a contract's consideration. cause_decision_id UNIQUE is half of the double-hit
-- guard: one decision can move revenue once.
CREATE TABLE IF NOT EXISTS contract_modification (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES contract(id),
  cause_decision_id TEXT NOT NULL UNIQUE, cause_intent_id TEXT, cause_entry_id TEXT,
  treatment TEXT NOT NULL CHECK (treatment IN ('prospective','memo_only','contra_revenue_no_schedule_change')),
  pct_off_bps INTEGER, effective_period TEXT NOT NULL, until TEXT,
  memo_cents INTEGER NOT NULL, memo_account TEXT NOT NULL,
  delta_total_cents INTEGER NOT NULL,       -- change in schedule total; 0 when the memo already hit a revenue account
  from_version INTEGER, to_version INTEGER, fact_id TEXT, created_at TEXT NOT NULL
);

-- 13-week forecast (sheet 15). forecast_line.as_of holds forecast_version.as_of.
CREATE TABLE IF NOT EXISTS forecast_version (
  as_of TEXT PRIMARY KEY,                   -- '<as_of_date>/v<version>'
  as_of_date TEXT NOT NULL, version INTEGER NOT NULL, built_at TEXT NOT NULL, reason TEXT NOT NULL,
  cause_event_id INTEGER, cause_intent_id TEXT,
  opening_cash_cents INTEGER NOT NULL, inflow_cents INTEGER NOT NULL, outflow_cents INTEGER NOT NULL,
  min_cash_cents INTEGER NOT NULL, min_cash_week TEXT NOT NULL,
  UNIQUE (as_of_date, version)
);

-- QuickBooks mirror: one row per decision and mirrored object, so a re-run creates nothing.
CREATE TABLE IF NOT EXISTS mirror_log (
  decision_id TEXT NOT NULL, system TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('mirrored','dry_run','skipped','failed')),
  detail TEXT, mirrored_at TEXT NOT NULL,
  PRIMARY KEY (decision_id, system, kind)
);

-- the ripple view (sheet 30): what one intent changed in each function, with the amounts, so the console can show
-- "the same transaction means the same thing everywhere" without re-deriving it.
CREATE TABLE IF NOT EXISTS ripple (
  id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, function TEXT NOT NULL, kind TEXT NOT NULL,
  ref TEXT NOT NULL, summary TEXT NOT NULL,
  before_cents INTEGER, after_cents INTEGER, delta_cents INTEGER,
  event_id INTEGER, created_at TEXT NOT NULL,
  UNIQUE (intent_id, function, kind, ref)
);

-- ───────────── the global July: labels for the console's cash strip. No kernel check and no agent tool reads them.

CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_account (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entity(id), label TEXT NOT NULL, opening_balance_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS party_profile (
  party_id TEXT PRIMARY KEY REFERENCES party(id), country TEXT, billed_by TEXT REFERENCES entity(id)
);
-- which of our accounts a bank line landed in. Written by ingestion from the bank file's own columns.
CREATE TABLE IF NOT EXISTS bank_txn_label (
  bank_txn_id TEXT PRIMARY KEY REFERENCES bank_txn(id), account_id TEXT NOT NULL, entity_id TEXT, currency TEXT NOT NULL DEFAULT 'USD'
);
