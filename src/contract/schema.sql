-- Footnote schema. DRAFT by Person A, 2026-09-19. Source: PROJECT_SPEC.md §7.
-- Lines marked "-- ADDED" are the additions ROADMAP.md Phase 0 says to take before the freeze.
-- Money is INTEGER cents. Dates are ISO text. Every *_json column holds JSON text.
PRAGMA foreign_keys = ON;

-- ───────────── world and ledger (Person B writes, everyone reads through tools)
-- ADDED: one party master instead of separate customer and vendor tables, plus aliases (board: schema gaps).
CREATE TABLE IF NOT EXISTS party (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer','vendor','employee','bank','other')),
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES party(id),
  remit_to_json TEXT,                       -- vendor bank details as last PAID, for BANK_DETAILS_CHANGED
  owner_user TEXT                           -- account owner, Slack user id
);
CREATE TABLE IF NOT EXISTS alias (          -- ADDED
  party_id TEXT NOT NULL REFERENCES party(id),
  alias TEXT NOT NULL,
  source TEXT NOT NULL,                     -- 'seed' | 'fact:<id>'
  PRIMARY KEY (party_id, alias)
);
CREATE TABLE IF NOT EXISTS contract (
  id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id),
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, value_cents INTEGER NOT NULL,
  terms_json TEXT NOT NULL, trace_id TEXT
);
CREATE TABLE IF NOT EXISTS invoice (
  id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id), contract_id TEXT REFERENCES contract(id),
  issue_date TEXT NOT NULL, due_date TEXT NOT NULL, total_cents INTEGER NOT NULL, open_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','paid','disputed','void'))
);
CREATE TABLE IF NOT EXISTS po (id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id), lines_json TEXT NOT NULL, total_cents INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS receipt (id TEXT PRIMARY KEY, po_id TEXT NOT NULL REFERENCES po(id), received_date TEXT NOT NULL, lines_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bill (
  id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id), po_id TEXT REFERENCES po(id),
  vendor_invoice_no TEXT NOT NULL, bill_date TEXT NOT NULL, due_date TEXT NOT NULL,
  service_period TEXT,                      -- ADDED: part of the obligation key (board correction 4)
  total_cents INTEGER NOT NULL, open_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','held','approved','scheduled','paid','void')), trace_id TEXT
);
CREATE TABLE IF NOT EXISTS bank_txn (
  id TEXT PRIMARY KEY, posted_date TEXT NOT NULL, amount_cents INTEGER NOT NULL,   -- signed: credits positive
  descriptor TEXT NOT NULL, method TEXT, party_id TEXT REFERENCES party(id), trace_id TEXT
);
-- ADDED: foreign-currency facts about an invoice and a receipt. The ledger stays in USD; these carry what the kernel
-- needs to re-perform realized FX. Rates are USD per one unit of the currency, times 1,000,000 (1.0800 -> 1080000).
CREATE TABLE IF NOT EXISTS invoice_fx (
  invoice_id TEXT PRIMARY KEY REFERENCES invoice(id), currency TEXT NOT NULL,
  foreign_total_cents INTEGER NOT NULL, booked_rate_ppm INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_txn_fx (
  bank_txn_id TEXT PRIMARY KEY REFERENCES bank_txn(id), currency TEXT NOT NULL,
  foreign_amount_cents INTEGER NOT NULL, rate_ppm INTEGER NOT NULL, fee_cents INTEGER NOT NULL DEFAULT 0,
  advice_trace_id TEXT                      -- the bank's credit advice: it must state the foreign amount, the rate and the fee
);
CREATE TABLE IF NOT EXISTS payroll_run (id TEXT PRIMARY KEY, pay_date TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, gross_cents INTEGER NOT NULL, register_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS period (
  id TEXT PRIMARY KEY,                      -- '2026-07'
  status TEXT NOT NULL CHECK (status IN ('open','closing','locked')),
  locked_at TEXT                            -- ADDED
);
CREATE TABLE IF NOT EXISTS gl_entry (
  id TEXT PRIMARY KEY, period TEXT NOT NULL REFERENCES period(id), date TEXT NOT NULL,
  source_decision_id TEXT NOT NULL, memo TEXT NOT NULL,
  posted_at TEXT NOT NULL                   -- ADDED
);
CREATE TABLE IF NOT EXISTS gl_line (
  entry_id TEXT NOT NULL REFERENCES gl_entry(id), line_no INTEGER NOT NULL, account TEXT NOT NULL,
  debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  party_id TEXT REFERENCES party(id),
  CHECK (NOT (debit_cents > 0 AND credit_cents > 0)),
  PRIMARY KEY (entry_id, line_no)
);

-- ───────────── shared judgment layer (Person A writes through the runtime)
CREATE TABLE IF NOT EXISTS trace (
  -- source is any slug registered in src/connectors/registry.ts, which ingestion enforces; the column only checks the
  -- shape, so adding a system (Linear, NetSuite, a vendor portal) needs no schema change and no migration of this table
  id TEXT PRIMARY KEY, source TEXT NOT NULL CHECK (source GLOB '[a-z][a-z0-9_-]*'),
  kind TEXT NOT NULL, external_id TEXT NOT NULL,
  event_time TEXT NOT NULL,                 -- when it happened in the world
  recorded_time TEXT NOT NULL,              -- when the company's systems knew it; replay reads only recorded_time <= T
  ingested_at TEXT NOT NULL,                -- ADDED third clock: when WE loaded it (always 19-20 Sep 2026)
  party_id TEXT REFERENCES party(id),
  version INTEGER NOT NULL DEFAULT 1,       -- ADDED evidence versioning
  content_hash TEXT NOT NULL,               -- ADDED
  payload_json TEXT NOT NULL,
  UNIQUE (source, external_id, version)
);
CREATE TABLE IF NOT EXISTS decision_point (
  id TEXT PRIMARY KEY, function TEXT NOT NULL, period TEXT NOT NULL, kind TEXT NOT NULL,
  trace_ids_json TEXT NOT NULL, decided_at TEXT NOT NULL,
  case_json TEXT NOT NULL,                  -- ADDED: CaseFile with docs_snapshot, as the humans saw it at decided_at
  human_outcome_json TEXT NOT NULL          -- HumanOutcome; never reachable from any agent tool
);
CREATE TABLE IF NOT EXISTS autonomy (       -- ADDED: the earned autonomy ladder, per decision kind
  function TEXT NOT NULL, kind TEXT NOT NULL,
  agree INTEGER NOT NULL, n INTEGER NOT NULL, covered INTEGER NOT NULL CHECK (covered IN (0,1)),
  level TEXT NOT NULL CHECK (level IN ('auto','review','shadow')), updated_at TEXT NOT NULL,
  PRIMARY KEY (function, kind)
);
CREATE TABLE IF NOT EXISTS intent (
  id TEXT PRIMARY KEY, parent_id TEXT REFERENCES intent(id), function TEXT NOT NULL, question TEXT NOT NULL,
  owner TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('open','waiting_on_human','resolved','abandoned')),
  end_condition_json TEXT,
  case_json TEXT,                           -- ADDED: CaseFile from the drift monitor (types.ts)
  created_at TEXT NOT NULL, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS decision (
  id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES intent(id), function TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','replay')), decision_point_id TEXT REFERENCES decision_point(id),
  kind TEXT NOT NULL, proposal_json TEXT, actor TEXT NOT NULL,
  autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('auto','review','shadow')),
  route TEXT CHECK (route IN ('AUTO','PROPOSE','ESCALATE','REFUSE','BLOCK')),   -- ADDED: what the corpus scores
  tier INTEGER,                             -- ADDED: router tier that produced the accepted proposal (0-3)
  model_calls INTEGER NOT NULL DEFAULT 0, cost_micros INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,                       -- ADDED
  posted_at TEXT,                           -- ADDED: set when the decision took effect, including kinds that write no ledger entry
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decision_step (  -- ADDED per-step trace: the timeline in the console, and training data
  decision_id TEXT NOT NULL REFERENCES decision(id), step_no INTEGER NOT NULL, ts TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- 'tool_call' | 'evidence_hit' | 'kernel_mark' | 'model_turn' | 'route'
  tier INTEGER, tool TEXT, input_json TEXT, output_json TEXT,
  tokens_in INTEGER, tokens_out INTEGER, cost_micros INTEGER, latency_ms INTEGER,
  PRIMARY KEY (decision_id, step_no)
);
CREATE TABLE IF NOT EXISTS workpaper (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decision(id), marks_json TEXT NOT NULL,
  kernel_verdict TEXT NOT NULL CHECK (kernel_verdict IN ('accept','reject','block')),
  checkable_num INTEGER NOT NULL, checkable_den INTEGER NOT NULL, created_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0,1))
);
CREATE TABLE IF NOT EXISTS approval (       -- ADDED: the approval is itself a checked artifact (kernel P)
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decision(id),
  approver_id TEXT NOT NULL, approver_kind TEXT NOT NULL CHECK (approver_kind IN ('human','controller_agent')),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','rejected','corrected')),
  note TEXT, slack_ts TEXT, approved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocked_attempt ( -- ADDED: BLOCK persists with the rule that caused it
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decision(id), rule TEXT NOT NULL,
  approver_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approver (       -- ADDED: the approval matrix as data (from the policy memo)
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, slack_user TEXT, limit_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decision(id), intent_id TEXT NOT NULL REFERENCES intent(id),
  function TEXT NOT NULL, system TEXT NOT NULL, external_id TEXT NOT NULL, kind TEXT NOT NULL,
  created_at TEXT NOT NULL, unwound_at TEXT
);
CREATE TABLE IF NOT EXISTS fact (
  id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id), predicate TEXT NOT NULL,
  value_json TEXT NOT NULL, scope_json TEXT NOT NULL,
  explained_amount_cents INTEGER,           -- ADDED: a fact suppresses only the amount it explains
  max_amount_cents INTEGER,                 -- ADDED: authority ceiling inherited from approved_by (corpus G-04)
  uses TEXT NOT NULL DEFAULT 'standing' CHECK (uses IN ('standing','one_time')),
  valid_from TEXT NOT NULL, valid_to TEXT NOT NULL,          -- no open-ended facts
  learned_at TEXT NOT NULL, source_trace_ids_json TEXT NOT NULL,
  stated_by TEXT NOT NULL, approved_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('candidate','approved','active','expired','superseded')),
  supersedes TEXT REFERENCES fact(id)
);
CREATE TABLE IF NOT EXISTS policy (
  id TEXT PRIMARY KEY, function TEXT NOT NULL, name TEXT NOT NULL,
  condition_json TEXT NOT NULL, action_json TEXT NOT NULL, intent_text TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('universal','vertical','company')),
  max_amount_cents INTEGER,                 -- ADDED: same ceiling rule as facts
  backtest_json TEXT, status TEXT NOT NULL CHECK (status IN ('proposed','approved','retired')),
  approved_by TEXT, approved_at TEXT,
  code TEXT,                                -- ADDED: the rule's short name across versions, e.g. SHORT-PAY-01
  version INTEGER NOT NULL DEFAULT 1,       -- ADDED: a widened or narrowed rule is a new version, never an edit
  supersedes TEXT REFERENCES policy(id)     -- ADDED: the version this one retires when it is approved
);
CREATE TABLE IF NOT EXISTS replay_result (
  decision_point_id TEXT NOT NULL REFERENCES decision_point(id), decision_id TEXT NOT NULL REFERENCES decision(id),
  agrees INTEGER NOT NULL CHECK (agrees IN (0,1)), diff_json TEXT,
  triage TEXT CHECK (triage IN ('agent_wrong','human_inconsistent','context_missing')),
  PRIMARY KEY (decision_point_id, decision_id)
);
CREATE TABLE IF NOT EXISTS escalation (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES decision(id), asked_user TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,                 -- ADDED: party_id + predicate + decision kind (asked once)
  question_json TEXT NOT NULL, answer_json TEXT, default_treatment TEXT NOT NULL DEFAULT 'dispute_hold',
  deadline TEXT, asked_at TEXT NOT NULL, answered_at TEXT, slack_ts TEXT
);
CREATE INDEX IF NOT EXISTS escalation_dedupe ON escalation(dedupe_key);

-- ───────────── coordination (Person B)
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, topic TEXT NOT NULL,
  from_function TEXT NOT NULL, intent_id TEXT, payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_item (
  id TEXT PRIMARY KEY, period TEXT NOT NULL REFERENCES period(id), function TEXT NOT NULL, name TEXT NOT NULL,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','done')),
  blocked_reason TEXT, decision_ids_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS forecast_line (
  id TEXT PRIMARY KEY, as_of TEXT NOT NULL, week TEXT NOT NULL, kind TEXT NOT NULL,
  source_ref TEXT, amount_cents INTEGER NOT NULL, fact_id TEXT REFERENCES fact(id)
);
CREATE TABLE IF NOT EXISTS forecast_miss (
  id TEXT PRIMARY KEY, week TEXT NOT NULL, expected_cents INTEGER NOT NULL, actual_cents INTEGER NOT NULL,
  decision_id TEXT REFERENCES decision(id)
);
-- DECIDE (not taken in this draft): employee and grant tables (equity-lite is second on the cut list).
