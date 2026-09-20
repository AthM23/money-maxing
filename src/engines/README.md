# Phase 2 engines (Person B): conventions

Read this before touching `src/engines/`, `src/close/`, `src/mirror/` or the Phase 2 drift comparators.
Context: [`context/ROADMAP.md`](../../context/ROADMAP.md) Phase 2, Person B column.

## Hard rules

- **Never edit** `src/contract/`, `src/kernel/`, `src/runtime/`, `src/router/`, `src/agents/`, `src/memory/`,
  `src/learn/`, `src/worker/`, `src/audit/`, `src/packs/`, `eval/`, `ft/`. Those are Person A's or joint. Import from them freely.
- Money is **integer cents**. No floats on a money path: multiply before dividing, `Math.floor` on integers only,
  percentages as basis points (`bps = Math.round(pct * 100)`).
- Engines are **deterministic code**. No model client, no `Date.now()` on a money or date path: take a `Clock`
  (`src/runtime/config.ts`) for timestamps and an explicit `as_of` / `period` for business dates.
- **The only way to write `gl_entry` / `gl_line` is `proposeEntry`** (`src/runtime/proposeEntry.ts`). Engines build a
  `Proposal` in code and call it with `{ mode: "live", actor: "engine:<name>", autonomy_level: "auto", tier: 0 }`.
  Measured: a `rev_recognition` of $500 or more passes every kernel mark and **parks as PROPOSE** (materiality is
  Person A's rule and applies to the whole amount). So an engine must treat `pending_approval` as a normal outcome and
  read "did it post" from `decision.posted_at`, never from its own call's return value.
- Lane B tables live in `src/ledger/schema-b.sql` (already extended for Phase 2: `rev_schedule`, `rev_schedule_line`,
  `rev_recognition`, `contract_modification`, `forecast_version`, `mirror_log`, `ripple`). Open databases with
  `openWorldDb()` from `src/ledger/db.ts`. If you need another column, add it there, additive only.
- Bus: `emit` / `poll` from `src/bus/bus.ts`. Delivery is **at-least-once**: every handler must be idempotent.
  Each engine exposes `xxxOnce(db, clock?)` that polls its topics under its own subscriber name and returns what it did.
  Pass the causing event's `intent_id` through to every event you emit, so the ripple view can follow one intent.
- Every change an engine makes because of an intent is recorded with `recordRipple` (`src/engines/ripple.ts`).
- Style, matching the rest of the repo: TypeScript ESM with `.js` import suffixes, no function over ~50 lines, no
  nesting past 4, no `console.log` in library code (CLIs write with `process.stdout.write`), doc comments that say
  *why*. Tests are vitest, colocated in `__tests__/`, on an in-memory database.
- Test fixture: the real world. `openWorldDb()` + `seedLocal(db, JSON.parse(readFileSync("world/northwind.json")))`
  gives 13 contracts, Q2 closed by humans (periods 2026-04..06 `locked`), July invoices issued (Dr 1200 / Cr 2400)
  and nothing else booked for July. Initech: contract `CTR-initech-2026`, 2026-07-01..2027-06-30, $144,000,
  $12,000 a month, invoice `INV-1042`, paid $10,800 on bank line `BTX-0070`.

## Event payloads (the contract between the engines)

Incoming, emitted by Person A's `postEntry` (`src/runtime/post.ts`), all carry the AR `intent_id`:

- `ar.credit_memo.posted` · `entry.posted` · `ar.payment.applied` · `rev.recognised`: payload
  `{ decision_id, entry_id, kind, party_id, entry_date, bank_txn_id, applications: [{doc_id, amount_cents}] }`.
  The proposal itself (with `terms_change: {pct_off, until}` and `fact_refs`) is `decision.proposal_json`.
- `billing.expectation.changed`: the same plus `terms_change` and `fact_refs`.
- `fact.activated`: `{ fact_id, party_id, predicate, approved_by }`.

Emitted by lane B:

- `rev.schedule.revised` (from `revenue`):
  `{ modification_id, contract_id, party_id, cause_decision_id, treatment, from_version, to_version,
     effective_period, until, before_total_cents, after_total_cents, delta_total_cents,
     monthly_delta_cents, lines: [{period, before_cents, after_cents}], fact_id }`
  (`delta_*` are negative for a concession; `lines` lists only periods that changed).
- `forecast.updated` (from `forecast`):
  `{ as_of, as_of_date, version, prior_as_of, reason, cause_event_id, opening_cash_cents, inflow_cents, outflow_cents,
     delta_inflow_cents, delta_by_week: [{week, before_cents, after_cents}],
     beyond_horizon: { monthly_delta_cents, through } | null, min_cash_cents, min_cash_week }`
- `drift.explained` / a new `intent` from comparator C1 (CRM deal value vs revenue schedule).

## The double-hit guard (revenue)

A concession must reduce revenue **once**. The Initech credit memo is `Dr 2400 deferred revenue / Cr 1200 AR`, so the
only movement in recognised revenue is the schedule line dropping from $12,000 to $10,800. If a credit memo debits a
revenue account instead (4000 or 4900), **that month's** revenue has already been cut in the ledger, and lowering that
month's schedule line as well would cut it twice ($2,400). So the guard protects the month the memo relates to:

- one-off memo to a revenue account: `contra_revenue_no_schedule_change`, `delta_total_cents = 0`, no new version, no event;
- memo to a revenue account **with** a standing `terms_change`: the memo's month is left alone, later months still take
  the percentage (the memo never touched them), treatment `prospective`.

Four more rules, each from a reproduced review finding (`__tests__/regressions.test.ts`):

- A standing percentage is applied to the **version 1** (list price) line, `min(current, v1 - floor(v1 * bps / 10000))`,
  so the same concession arriving again (one memo per short-paid invoice) changes nothing and never compounds. In the
  memo's own month the ledger is the truth: the memo amount comes off.
- `contract_modification.cause_decision_id` is UNIQUE: one decision can never revise a schedule twice.
- A recognition **parked** at the old amount is withdrawn by the revision (a `rejected` approval by `engine:revenue`),
  and the next `recogniseMonth` proposes the revised amount. **Known gap in Person A's runtime:** `approveDecision` does
  not treat an earlier rejection as final, so someone approving the withdrawn decision by id still posts it. Lane B
  makes that loud (tie-out red, close item not done) but cannot prevent it.
- A memo arriving after its month was **posted** cannot be fixed by the schedule: a `int_rev_trueup_*` intent is opened
  for a person. Months are recognised in order and never ahead of `worldToday`.
