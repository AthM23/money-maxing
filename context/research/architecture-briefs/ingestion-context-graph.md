# Architecture brief: input side and shared state (Footnote)

Prepared 2026-09-19 for the diagram author. Scope: connectors, ingestion pipeline, as-of trace store, entity resolution, context graph, and the drift monitor as consumer. Everything here is **proposed** against `context/PROJECT_SPEC.md` v3; nothing is built. Memory stays hand-rolled in SQLite (Graphiti, Mem0, Letta are in Tried & rejected; only schema ideas are borrowed). API facts were checked today against vendor docs unless marked **UNVERIFIED**.

Diagram reading order, left to right: **Sources -> Connectors (cursor + auth) -> Ingestion pipeline (11 stages) -> Trace store (as-of) -> Entity resolution -> Context graph (3 tiers) -> Drift monitor -> intents**. One feedback arrow: human answers and posted entries return as traces, facts and artifacts.

---

## 1. Connectors

Common contract: every connector is a pull loop with a persisted cursor, emits `RawItem{source_system, source_id, fetched_at, bytes, content_hash, source_event_time?, source_recorded_time?}`, and never writes domain tables itself. Design goal: **no public URL anywhere** (venue Wi-Fi, no tunnel).

| Connector | Auth | Change detection | Objects pulled | Limits and quirks |
|---|---|---|---|---|
| **QuickBooks Online sandbox** | OAuth 2.0 auth-code; client id/secret; access token ~1h, rolling refresh token (lifetimes from memory, UNVERIFIED). Base `https://sandbox-quickbooks.api.intuit.com` | **Poll Change Data Capture**: `GET /v3/company/{realm}/cdc?entities=...&changedSince=<ISO>`. Webhooks exist but need a public HTTPS endpoint, 200 within 3 s, HMAC-SHA256 over the body checked against `intuit-signature` with the verifier token; payload carries **ids only, never the record**, may arrive out of order, and moved to a CloudEvents envelope (legacy format retired 31 Jul 2026 per secondary sources; Intuit's own pages would not render today, so UNVERIFIED). Webhook = optional "poll now" nudge; CDC is the truth | Customer, Vendor, Item, Invoice, Payment, CreditMemo, Bill, BillPayment, JournalEntry, Deposit, Attachable; reports (TB, aged AR/AP) as control totals | CDC looks back **30 days max, 1,000 objects per response**; 5 entities excluded (TaxCode, TaxRate, TaxAgency, TimeActivity, JournalCode). 500 req/min and 10 concurrent per realm, 40 batch/min (Intuit help article). `SyncToken` optimistic lock on update. Deletes surface as a stub with `status=Deleted` (UNVERIFIED). `MetaData.LastUpdatedTime` is seed time, not world time (see 3.2). **Echo suppression:** the mirror writes here too; any record whose `fn:` external id maps to an `artifact` row is our own write and is skipped as a source |
| **Bank: Increase sandbox** (or file) | Bearer API key; sandbox base `https://sandbox.increase.com`; `Idempotency-Key` header supported | **Poll `GET /events`** with `created_at.after` + `category.in` (`transaction.created`, `inbound_ach_transfer.*`, `inbound_wire_transfer.*`), cursor pagination, max 100/page. Webhooks optional | Transaction (`amount` integer minor units, `currency`, `created_at`, `description`, `source.category`), plus the source object for remittance detail | Simulations confirmed: `POST /simulations/inbound_ach_transfers` and **`POST /simulations/inbound_wire_transfers`** (`debtor_name`, `unstructured_remittance_information`, `end_to_end_identification`), which closes the spec's "wire simulation not confirmed". Numeric rate limit undocumented (429 `rate_limited_error`). Transactions carry one timestamp and simulations post "now": **backdating Q2 is UNVERIFIED and unlikely**, so Q2 bank history and posted/value date pairs come from the file feed; Increase supplies live July lines only |
| **Bank: file** | none | sha256 of file; re-drop = same hash = no-op; changed hash = new version (A-24) | CSV/OFX rows: posted date, value date, descriptor, amount, running balance | Full structural validation (section 2). Statement opening/closing balance is the control total |
| **HubSpot test account** | Static bearer token from a private app, now labelled **"legacy private app"** in docs (still supported); dev test accounts expire after 90 idle days | **Poll CRM search** filtered/sorted on `hs_lastmodifieddate` (contacts use `lastmodifieddate`). Webhooks need a public URL: skip | companies, deals (amount, closedate, stage, owner), notes/engagements, owners, associations | Search: **5 req/s per account**, 200/page, **10,000 results per query cap**, max 5 filterGroups x 6 filters (18 total), **indexing lag** ("a few moments"), so the seeder must verify by id, not by search. General: 100 req/10 s per app, 250k/day on Free/Starter. Docs now show date-versioned paths (`/crm/objects/2026-09/{object}/search`); whether `/crm/v3/...` stays served is UNVERIFIED |
| **Gmail** | OAuth user consent; `gmail.readonly` to read, `gmail.insert` or `gmail.modify` to seed | **Poll `users.history.list(startHistoryId)`** (2 quota units). History kept "at least one week"; too-old id returns **404 -> full resync** (`messages.list` + batched `messages.get`). `users.watch` needs a Cloud Pub/Sub topic with publish rights for `gmail-api-push@system.gserviceaccount.com`, expires in 7 days, max 1 notification/s/user; a **pull subscription** avoids a public URL. For 24h, polling is enough | messages (headers, body, `internalDate`, `threadId`, labels), attachments (bill PDFs, remittance advices) | Seeding: `messages.insert` is IMAP-APPEND-like, bypasses most scanning; `internalDateSource=dateHeader` backdates. Quota 6,000 units/min/user: get=20, list=5, insert=25, attachments.get=20, send=100. Whether inserts emit `messagesAdded` history records is UNVERIFIED: run a full sync after seeding |
| **Slack** | Bot token `xoxb-` + **app-level token `xapp-` with `connections:write`** | **Socket Mode** (`apps.connections.open` -> WebSocket). Carries Events API **and interactive payloads** (`block_actions`, `view_submission`, slash commands). Ack each `envelope_id`; up to 10 sockets; connection refreshes every few hours with a `disconnect` warning. Backfill with `conversations.history` + `conversations.replies` (Tier 3; internal apps exempt from the May 2025 1 req/min clamp) | messages in #finance, #deals, #cs-escalations, thread replies, users (as person nodes), button clicks on escalations | **Spec correction:** `sandboxes-and-connectors.md` says buttons need a public request URL and a tunnel; Socket Mode removes that. Dedupe on `event_id`. HTTP mode, if ever used: 3 s ack, 3 retries, 30,000 events/workspace/app/hour. Not Marketplace-listable (irrelevant). `search.messages` needs a user token (from memory, UNVERIFIED): index locally instead |
| **Files** (contracts PDF, board consents, policy memo md, Q2 close workbook, grants ledger) | none | Directory scan, sha256 per file | Whole file as one trace + extracted child traces (clause, grant row, workbook cell range, memo section) | Policy memo sections load as company-tier **policy candidates**, not only as retrievable prose. Workbook cells are Q2 `human_outcome`: replay-only, never exposed to live agent tools |
| **Processor payout file** (optional) | none | file hash | payout -> charges, fees, refunds | Buys corpus A-07/H-2 (one deposit = three rows) without a Stripe integration; spec lists Stripe as out of scope |
| **Portal browser automation** (optional, H-4/B-25) | Playwright persistent `storageState` | On demand only, invoked by the investigator as tool `portal.fetch(vendor, po)` | delivery note: DOM text + screenshot | Runs outside the agent sandbox (agents have no shell/file tools), domain allow-list, read-only, every page read is screenshotted and hashed into a trace. Hackathon target: a local seeded mini-site |

---

## 2. Ingestion pipeline (stage order)

Structure before content; refuse the whole file, never half of it. Each stage appends to `ingest_run(id, connector, cursor_before, cursor_after, stage, status, counts_json, started_at, finished_at)`.

| # | Stage | What it does | Failure route | Corpus |
|---|---|---|---|---|
| 0 | **Fetch from cursor** | Read connector cursor (CDC timestamp, historyId, event cursor, file hash). Cursor advances only in the stage-9 commit | retry | F-11 |
| 1 | **Land raw** | Byte-exact blob to `raw_blob(hash, bytes, mime)`; sha256 content hash. Immutable | - | F-06, F-13 |
| 2 | **Structural validation** | Header present; **field count of every row == header**; no footer/merged/blank-header rows; encoding detected; **date format inferred from the whole column** (any day > 12 decides; undecidable -> refuse); **sign convention inferred, then asserted against a control total** (statement closing balance, QBO report total); currency minor-unit exponent known | `REFUSE` file, reason stored | F-01, F-02, F-04, F-08, F-12 |
| 3 | **Normalise** | NFKC, NBSP/tab strip, case-fold for *keys only*; `raw_value` kept beside `norm_value` | - | F-13 |
| 4 | **Idempotency and version detect** | Unique key `(source_system, source_id)`. Same hash -> no-op. Different hash -> new `version`, `supersedes_trace_id` set, flagged for stage 10 | - | F-05, F-06, A-24 |
| 5 | **Parse to typed records** | Amounts to **integer minor units + exponent**; bank lines store **`posted_date` and `value_date`** (match on value, report on posted) | row-level refuse | F-03, F-07, F-08 |
| 6 | **Extract** (unstructured only) | Small model pulls terms from PDFs/emails with **quoted spans and per-field confidence** (OCR confidence carried through). Raise on `finish_reason=length` or empty content. Free validator: header total == sum of lines | `REFUSE` / low-confidence flag | F-10, F-14, B-15 |
| 7 | **Sanity checks** | Every extracted date inside the **open fiscal window** (or the contract's own term); every quote is a substring of the raw trace | `REFUSE` fact | F-09 |
| 8 | **Entity resolution** | Attach `party_id` + match method + confidence (section 4) | unresolved -> `party_id` null, flagged | A-09, A-10, B-18 |
| 9 | **Commit** | One SQLite transaction: trace rows, domain rows, graph edges, cursor advance, `event(topic='ingested')` | rollback; resume from cursor | F-11 |
| 10 | **Downstream invalidation** | For a superseded trace: walk `EVIDENCED_BY` edges; mark workpapers `stale`, decisions `needs_rerun`, facts sourced from it `suspended`; open an intent; the close cannot lock with stale workpapers | `ESCALATE` | F-06, H-6, A-24 |
| 11 | **Trigger drift monitor** | Run comparators over the parties/accounts touched | - | spec 6 |

**Confidence propagates:** `trace.extraction_confidence` and `party_match_confidence` cap the route. Low on either forbids the router's no-model path and forbids `AUTO`; the kernel's E marks read the same fields. Confidence is a checklist score (G-11), not a model's self-report.

---

## 3. As-of trace store

### 3.1 Three clocks, not two
The spec's `trace` has `event_time` and `recorded_time`. Add a third, and versioning:

```sql
trace(id, source_system, source_id, version, content_hash, supersedes_trace_id,
      kind, event_time,        -- when it happened in the world (TxnDate, email Date header, value date)
      recorded_time,           -- when the COMPANY could first have known it (mail received, bank posted, QBO created)
      ingested_at,             -- when Footnote pulled it (wall clock)
      party_id, party_match_method, party_match_confidence,
      extraction_confidence, raw_blob_hash, payload_json, visible_to_json,
      UNIQUE(source_system, source_id, version))
```

### 3.2 Why the third clock matters (spec gap)
Q2 history is seeded today. QBO `MetaData.CreateTime`, HubSpot `createdate` and Increase `created_at` will all say 19 Sep 2026, so a naive `recorded_time` makes **all of Q2 look unknown until today, and no-look-ahead replay returns nothing**. Rule: the seeder writes a world `recorded_time` per record into the manifest; the ingestion layer (never an agent) reads it. Gmail is the one source that backdates natively (`internalDateSource=dateHeader`).

### 3.3 Queries the diagram should name
- **As-of read:** latest version per `(source_system, source_id)` with `recorded_time <= T`. Every read tool takes `T`; live runs pass `now`, replay passes `decision_point.decided_at`.
- **"What did the human know, and when":** traces with `recorded_time <= decided_at`, filtered by `visible_to_json` (a mailbox only its owner could read is not shared knowledge).
- **No-look-ahead is enforced twice:** in the tool layer (SQL filter) and in kernel E ("trace recorded by T").
- **Late and backdated items:** `event_time < recorded_time` is normal (a July bill arriving 8 Aug) and is exactly what the cutoff checks read.
- Facts and policies obey the same rule through `learned_at <= T`.

---

## 4. Entity resolution

The spec has separate `customer` and `vendor` tables, no employee, no alias table. Replace with a party master.

```sql
party(id, kind,                 -- customer|vendor|employee|bank|processor|tax_authority|own_entity
      legal_name, norm_name, status, merged_into_party_id)
party_external_id(party_id, system, external_id)   -- QBO Id, HubSpot id, email domain, ACH originator id, debtor account hash
party_alias(party_id, alias_raw, alias_norm, source, first_seen, last_seen, confidence, confirmed_by)
party_link(parent_party_id, child_party_id, kind, valid_from, valid_to)   -- parent_of | pays_for | same_group
```

**Resolution ladder (first hit wins; method is recorded):** 1. external id -> 2. structured identifier (ACH originator id, wire debtor account, sender domain, invoice number in remittance text) -> 3. exact hit in `party_alias` -> 4. fuzzy on `norm_name` (token-set plus edit distance) producing **candidates only** -> 5. model tier chooses among candidates or abstains (A-11: no lexical overlap) -> 6. escalate. Rungs 4-5 can never yield `AUTO`; a human-confirmed match writes a `party_alias` row, so next month it resolves at rung 3.

- **Mutating descriptors (A-09, H-3, G-09):** `GUSTO PAYROLL` and `GUSTO TAX COLLECTION` are two aliases of one `party_id`. Policies and facts reference `party_id`, never a descriptor substring. **Decay detector:** a policy whose fire count drops to zero in a period while its party still has bank activity raises a drift row.
- **Parent pays for subsidiary:** cash from party P applies to party S's invoice only if a `pays_for` link covers the date; otherwise escalate, and the answer creates the link.
- **Duplicate vendors (B-18):** block on `norm_name` stem, then compare bank fingerprint, tax id, address, domain. A merge is `ESCALATE`; approved merges set `merged_into_party_id` (no deletes). Duplicate-payment checks key on the canonical party.
- **Bank-detail change (B-17):** the bank fingerprint is versioned on the party; a change without out-of-band confirmation is a `BLOCK`, and also a drift comparator.

---

## 5. Context graph

Physical form: the spec's SQLite tables are the nodes, plus one generic bi-temporal edge table. Traversal is recursive CTEs (the Neo4j post notes these hurt at depth; ours stay under 5 hops over a few thousand rows).

```sql
edge(id, src_type, src_id, rel, dst_type, dst_id,
     valid_from, valid_to,          -- world time
     recorded_at, expired_at,       -- system time
     source_trace_id, created_by_decision_id)
```

### 5.1 Borrowed ideas
| Source | Idea borrowed | Where it lands |
|---|---|---|
| Foundation Capital essay | A decision trace records "what inputs were gathered", "what policy was evaluated", which exception route, "who approved", what state was written; "precedent becomes searchable"; being in the execution path is what makes capture possible. Names Maximor as the finance example | `decision` + `workpaper` + `escalation` + `artifact`, all linked to one `intent` |
| Neo4j, William Lyon | Two halves: entities vs decision traces; `DecisionContext` = state snapshot at decision time; edges `CAUSED`, `PRECEDENT_FOR`, `ABOUT`, `APPLIED_POLICY`, `GRANTED_EXCEPTION`, `TRIGGERED`; precedent search = text embedding + structural similarity | Edge vocabulary below; `decision.context_snapshot_json` (open balance, active fact ids, as-of T) |
| Graphiti / Zep paper | Two timelines; four timestamps (`t_valid`, `t_invalid`, `t'_created`, `t'_expired`); contradiction **invalidates, never deletes**; raw episodes kept non-lossy with bidirectional provenance; retrieval = cosine + BM25 + graph BFS, then rerank | Four time columns on `fact` and `edge`; trace = episode; `source_trace_ids`; retrieval order in 5.5 |

### 5.2 Node types
| Node | Half | Key fields beyond the spec |
|---|---|---|
| party | entity | section 4 |
| person / role | entity | `slack_user_id`, `role`, **`approval_ceiling_cents`**, `functions_json`, `valid_from/to` (from the memo's approval matrix) |
| contract, invoice, bill, po, receipt, bank_txn, payroll_run, grant | entity | `source_trace_id`; bank_txn has `posted_date`, `value_date` |
| trace | episode | section 3 |
| intent | decision trace | question, end condition, parent |
| decision | decision trace | `context_snapshot_json`, `as_of` |
| workpaper | decision trace | `stale` flag |
| artifact | decision trace | external id in QBO/Gmail/Slack; used for echo suppression |
| escalation | decision trace | question, answer, asked person |
| fact | memory | `tier`, `authority_ceiling_cents`, `expired_at`, `supersedes_fact_id`, `status` |
| policy | memory | `tier`, `party_id` or class scope, `authority_ceiling_cents`, `version`, `supersedes_policy_id`, `fire_count_by_period` |
| drift_observation | monitor | comparator, expected, actual, delta, `explained_by_fact_id`, `residual_cents`, `intent_id` |

### 5.3 Edge types
| Edge | From -> To | Meaning |
|---|---|---|
| `ABOUT` | trace, intent, decision, fact, drift_observation -> party / document | subject |
| `PARENT_OF`, `PAYS_FOR`, `ALIAS_OF` | party -> party | section 4 |
| `GOVERNS` | contract -> invoice | billing under a contract |
| `SETTLES` | bank_txn -> invoice / bill (with amount) | cash application |
| `SUPERSEDES` | trace -> trace, fact -> fact, policy -> policy | versioning (G-07) |
| `OPENED` | drift_observation -> intent | front door |
| `ANSWERS` | decision, escalation -> intent | the question it served |
| `EVIDENCED_BY` | decision, workpaper, fact -> trace (with quote span) | invalidation walks this |
| `APPLIED_POLICY`, `APPLIED_FACT` | decision -> policy / fact | kernel J checks these |
| `PRODUCED` | decision -> artifact | entry, credit memo, email |
| `TRIGGERED` | decision -> intent (other function) | hand-off ripple |
| `ESCALATED_TO`, `APPROVED_BY`, `STATED_BY` | escalation, decision, fact, policy -> person | authority source |
| `YIELDED` | escalation -> fact | asked once |
| `COMPILED_FROM` | policy -> decision (2 or more) | G-05 |
| `PRECEDENT_FOR` | decision -> decision | advisory only |
| `EXPLAINS` | fact -> drift_observation | suppression |

### 5.4 Three tiers as layers
| Tier | Content | Source | Mutability | Portability |
|---|---|---|---|---|
| **1 Universal** | Debits = credits, period lock, segregation of duties, GAAP cutoff and ASC 606 schedule sums, 409A / ISO $100K / Rule 701 checks | Shipped as kernel code and constants | Release only; no human answer can override; violations `BLOCK` | Every deployment |
| **2 Vertical (SaaS)** | Ratable recognition default, annual prepay -> deferred revenue, processor-net payouts, typical wire-fee band, month-13 escalators | Shipped policy pack, `tier='vertical'` | Controller may override per company | Every SaaS deployment |
| **3 Company** | Materiality $500, approval matrix, accrual rules (memo); the CEO's Initech 10% through renewal; aliases; pays-for links | Policy memo, escalation answers, compiled replay policies | Learned continuously, always scoped | None by default |

**Precedence:** (1) a tier-1 constraint always wins, and for controls the **most restrictive** rule wins; (2) for treatment the **most specific scope** wins: party+contract > party > party class > company > vertical default; (3) same specificity: higher approver authority, then later `learned_at`; (4) two active facts, same scope, overlapping valid time, contradictory values -> **no winner: `ESCALATE`**; the answer supersedes one (old row gets `valid_to`/`expired_at`, never edited); (5) model output and `PRECEDENT_FOR` never outrank a fact or policy: they inform proposals, they cannot authorise posting.

**Lifecycle:** `candidate` (from `record_fact_candidate` or the compiler) -> `approved` (person with authority; **`authority_ceiling_cents` copied from the approver at approval time**, G-04) -> `active` (while `valid_from <= date < valid_to`) -> `expired` (date passes; the drift it explained reappears by itself) | `superseded` (G-07) | `suspended` (source trace superseded, H-6). Policies additionally need two agreeing source decisions quoted verbatim (G-05), a passing backtest over all closed periods (G-06), tolerance clamped between the learned case and the class ceiling (G-08), and a `party_id` or class pin, never a descriptor (G-09). A single human statement about one party may become a **fact**; it may not become a **policy**.

### 5.5 Retrieval order for an investigator (all as-of T)
1. **Scope match in code, no model.** SQL over `policy`/`fact`: party (plus parents via `party_link`), decision kind, amount <= ceiling, event date in valid time, `status='active'`, `learned_at <= T`. A hit takes the router's no-model path.
2. **Graph neighbourhood by key.** 1-2 hops from the party and document: contract, open invoices, recent bank_txns, open intents, prior escalations, drift observations.
3. **Lexical search over traces.** SQLite FTS5/BM25, pre-filtered by party, date window and `recorded_time <= T`. Gmail `q=` is discovery only; anything found goes through the pipeline so evidence is always a hashed trace.
4. **Semantic search over trace chunks** (embeddings, in-process cosine). Needed only where words do not overlap (A-11). Stretch.
5. **Similar past decisions** (`memory.similar_decisions`): same kind, nearby features, with outcome and approver. Advisory.
6. **Portal fetch** (H-4), when a required third leg is known to live off-system.
7. **Escalate**, listing every place searched.

---

## 6. Drift monitor as consumer

Reads: as-of traces, domain rows, `party` keys, active facts. Writes: `drift_observation`, intents. Runs at stage 11 and at period end.

Comparators (spec section 6) are pure functions returning `{comparator, party_id, period, expected_cents, actual_cents, delta_cents}`, joined on `party_id` (hence after entity resolution): CRM deal vs contract vs invoice run-rate, invoice vs cash, bank vs ledger cash, subledgers vs GL, deferred schedule vs GL, forecast opening cash vs GL, vendor bank details vs last paid, payroll register vs bank debit, grants ledger vs stock-comp expense; plus two from this brief: **policy fire-count decay** and **stale workpaper present**.

**Suppression is arithmetic, in code:** (1) find active in-scope facts for the party and period (5.5 step 1); (2) each fact's predicate yields an *expected delta* (`pct_off=10` on $144,000 -> $14,400); (3) `residual = delta - sum(expected deltas)`; (4) `|residual| <= tolerance` -> observation stored with `explained_by_fact_id`, no intent; otherwise an intent opens **for the residual only**. Suppressed rows stay visible to the audit pack. When the fact expires at renewal, step 1 stops matching and the drift reopens with no extra code. A fact whose amount exceeds its authority ceiling does not suppress.

---

## 7. Deltas to the frozen schema (for the diagram legend)
`trace` +version, content_hash, supersedes, ingested_at, confidences, visible_to · `bank_txn` +posted_date, value_date, currency exponent · `customer`/`vendor` -> `party` + `party_external_id` + `party_alias` + `party_link` · `fact`/`policy` +tier, authority_ceiling_cents, expired_at, supersedes, party pin · `workpaper` +stale · new `edge`, `drift_observation`, `ingest_run`, `raw_blob`, `person`.

## Sources
- Intuit webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks (JS-rendered; not readable today)
- Intuit CDC: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture · https://blogs.intuit.com/2023/08/24/building-smarter-with-intuit-stay-in-sync-with-cdc/
- Intuit CloudEvents notice: https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure (403 today); secondary: https://www.maesn.com/blog/quickbooks-online-webhooks/ · https://www.maesn.com/blog/quickbooks-webhooks-cloudevents
- Intuit rate limits: https://help.developer.intuit.com/s/article/QuickBooks-Online-API-Best-Practices
- Gmail sync: https://developers.google.com/workspace/gmail/api/guides/sync · push: https://developers.google.com/workspace/gmail/api/guides/push · insert: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/insert · quota: https://developers.google.com/workspace/gmail/api/reference/quota
- Slack Socket Mode: https://docs.slack.dev/apis/events-api/using-socket-mode · Events API: https://docs.slack.dev/apis/events-api/ · conversations.history: https://docs.slack.dev/reference/methods/conversations.history
- HubSpot search: https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm · limits: https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines · account types: https://developers.hubspot.com/docs/getting-started/account-types
- Increase overview: https://increase.com/documentation/api/overview · events: https://increase.com/documentation/api/events · inbound wires + simulation: https://increase.com/documentation/api/inbound-wire-transfers · inbound ACH: https://increase.com/documentation/api/inbound-ach-transfers · transactions: https://increase.com/documentation/api/transactions
- Foundation Capital: https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity
- Neo4j (William Lyon, 14 Jan 2026): https://neo4j.com/blog/agentic-ai/hands-on-with-context-graphs-and-neo4j/ · https://github.com/johnymontana/context-graph-demo
- Zep / Graphiti bi-temporal paper: https://arxiv.org/html/2501.13956v1 · https://github.com/getzep/graphiti
- Repo: `context/PROJECT_SPEC.md` (2b, 6, 6b, 7, 8, 9), `context/PROJECT_STATUS.md`, `context/judge-interview-2026-09-19.md` (8), `context/research/sandboxes-and-connectors.md`, `context/research/frontier-stack.md` (B, C), `context/research/maximor-workshop-slides.md`, `tests/edge-cases/office-of-the-cfo.md` (F, G, A-09, A-24, B-17, B-18, B-25, H-3, H-4, H-6)
