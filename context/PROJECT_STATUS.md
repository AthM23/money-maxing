# Project Status — money-maxing

**Source of truth.** Read this before starting work. Append to it after anything
notable. See [`README.md`](./README.md) for the rules.

---

## At a glance

| | |
|---|---|
| **Last updated** | 2026-09-19 ~19:30 ET |
| **Phase** | Pre-build — direction **proposed** (see "Proposed decision" below), waiting for team sign-off |
| **Repo state** | Empty. No code committed yet. |
| **Deadline** | 24h hackathon build |
| **Design brief** | [`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md) |
| **Test bar** | [`../tests/README.md`](../tests/README.md) — 115 edge cases, each with an expected route |
| **Agent onboarding** | [`../AGENTS.md`](../AGENTS.md) |
| **Proposed spec** | [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) |
| **Roadmap (two builders)** | [`ROADMAP.md`](./ROADMAP.md) — proposed, not yet agreed |
| **Architecture board** | [`diagrams/architecture/`](./diagrams/architecture/README.md) — 20 sheets, target architecture, nothing built |
| **Research** | [`research/`](./research/README.md) |

---

## Current direction

**Not yet locked.** What we know from the judge:

- The product space is **autonomous finance-ops agents** — automating the context
  collection and bookkeeping work that happens *before* financial statements get
  prepared, not the statement analysis itself.
- Judged on three axes: **ambition** (cross-function > single-function),
  **frontier-ness** (right models / partners / memory layer), and **difficulty of
  the chosen process** (equity > revenue ≈ collections ≈ payroll > cash).
- **Hard requirement: fully autonomous.** Human is pulled in *only* on a genuine
  context blocker, and the answer must be written to memory and reused
  automatically thereafter.

### Decision needed

Pick the shape of the build:

- **(A) Deep in one function** — realistic. Revenue end-to-end is the judge's own
  worked example. Medium difficulty score.
- **(B) Cross-function multi-agent** — ambitious, riskier, scores higher on
  ambition. e.g. cash agent that also queries payroll + equity agents.
- **(C) Equity** — highest difficulty score, most context-hungry (state + federal
  law, cap tables), hardest to fake convincingly in 24h.

_No decision recorded yet._

> **Superseded 2026-09-19 ~17:10 ET** by the proposal below. Kept for history.

### Proposed decision — 2026-09-19 ~17:10 ET (Karan, with a Claude Code session). Needs sign-off from the rest of the team.

**Shape (B), cross-function.** Working name **Footnote**: an agent finance team that closes all of July for a simulated $60M SaaS company across eight functions (AR and collections, AP, bank rec, revenue, close, 13-week forecast, reporting, audit and controls) on **one shared ledger and one judgment layer**. Full spec: [`PROJECT_SPEC.md`](./PROJECT_SPEC.md).

Why (B): the track doc lists "ambition and creativity" first, calls several agents across functions "the stretch goal", and says it looks for "the same transaction means the same thing everywhere". The CTO's workshop opened with "Finance is not one workflow. The same judgment layer spans many functions."

How breadth stays buildable: the judgment layer is built once (investigate → propose an entry → a deterministic kernel re-checks its workpaper → post or escalate → learn; plus replay of human-closed Q2 and compiling repeated judgment into approved policies). Each function is a thin pack on top. The demo spine is one event (a short-paid invoice explained by a CEO email) rippling through five functions. Build order and cut order are in the spec.

Known risk, stated plainly: at Maximor's own Syndicate hackathon two weeks ago, breadth-only entries and multi-agent swarms did not win; narrow, finished, measured projects did. See [`research/syndicate-hackathon-analysis.md`](./research/syndicate-hackathon-analysis.md). The spec answers this with a deterministic core, real counts per function, and a hard checkpoint: the spine must work across AR, revenue, forecast and close by 22:30 tonight, or scope is cut from the bottom of the list.

---

## Tried & rejected

_Nothing yet. Log failed approaches here with the reason, so nobody re-runs them._

| Date | Approach | Why it was dropped |
|---|---|---|
| 09-19 | Meta-anchored idea: Instagram reel → small-business checkout via Muse | A near-identical project (JustDM) won the Visa prize at another hackathon last month; heavy Instagram commerce restrictions. Shelved. |
| 09-19 | Visa "Reimagine Shopping" on the Trusted Agent Protocol (one-click checkout) | The one-click engine has no generative AI, which Visa's brief requires; Visa's consumer brief does not stack with Maximor. Team re-targeted Maximor. |
| 09-19 | Audit or fraud detection on public payment data (Checkbook L.A.) | Free ground truth, but no email or Slack context, so it misses the sponsor's main point (context capture and learning). Kept only as the audit function inside the larger system. |
| 09-19 | Order-to-cash only (spec v1) | Deep but single-function. Ambition is the first judging criterion and cross-function is the named stretch goal. Superseded by the eight-function spec, which keeps its mechanism. |
| 09-19 | Equity as the function | Rated hardest by the sponsor, but no open sandbox or data, and the difficulty is legal knowledge we cannot fake in a day. |
| 09-19 | Graphiti, Mem0 or Letta as the memory layer | None has a "use this precedent only inside this scope" primitive; Graphiti is Python-only. Hand-rolled facts and policies with valid-time and learned-time columns instead. |
| 09-19 | Live GEPA or DSPy optimization as the learning loop | Needs dozens of labeled examples and a second strong model; wrong shape for corrections that arrive one at a time. Named as an upgrade path only. |
| 09-19 | OpenAI fine-tuning as the route for the small model (spec §6) | OpenAI's deprecations page: organisations that had never fine-tuned were blocked from creating jobs on 2026-05-07 (checked directly 09-19). AthM23 also stated the team will fine-tune an open-weight model. |
| 09-19 | Learning the route (AUTO / PROPOSE / ESCALATE / REFUSE / BLOCK) with a fine-tuned classifier | The 115 corpus cases are a test set, not training data; ESCALATE is about information that is missing, which case text does not carry; a wrong AUTO has asymmetric cost. Routes stay rules plus a calibrated threshold. |
| 09-19 | `@excalidraw/mermaid-to-excalidraw` for the editable whiteboard export | Drops classDef colours, keeps `<br>` as literal text so boxes come out thousands of pixels wide, and fails on open links. Replaced by `diagrams/architecture/tools/svg2exc.mjs`, which reads Mermaid's own rendered layout. |

---

## Open questions

- Which function(s) are we committing to? (see Decision needed above)
  - _Proposed 09-19:_ eight functions on one judgment layer; build order AR → revenue → forecast → close → bank rec → AP → audit → reporting.
- What's the memory layer? The judge explicitly grades this — "the right memory
  layer" is one of the three axes.
  - _Proposed 09-19:_ hand-rolled in SQLite: facts and policies with scope, valid-time and learned-time, approver, source evidence; code (never the model) decides whether one applies. Reasons in `research/frontier-stack.md`.
- What data sources do we simulate vs. actually integrate (email, Slack, bank
  statements, accounting system)?
  - _Proposed 09-19:_ live QuickBooks Online sandbox (mirror of accepted entries), live Gmail and Slack; bank feed from the Increase sandbox or a file; contracts, CRM notes and the Q2 close workbook local. Details and API quirks in `research/sandboxes-and-connectors.md`.
- What's the fixture company? Needs to look ~Series A, not a two-person startup.
  - _Correction 09-19:_ Maximor's stated target is **$50M-$500M revenue** (TechCrunch, and Maximor's own CFO benchmark page), so the garbled "familiar and above" was a revenue figure, not "Series A". Proposed fixture: Northwind Systems, $60M SaaS, 12 customers, 10 vendors.
- How do we stage the escalate → answer → remember demo so it's legible in a
  short pitch?
  - _Proposed 09-19:_ an unexplained short-pay goes to a judge's phone in Slack; their answer becomes a scoped fact; the rerun of July does not ask again. Demo script in the spec, section 12.

---

## Log

### 2026-09-19 — Context folder created; judge interview captured

- Created `context/` as the shared source of truth for humans and agents.
- Added `PROJECT_STATUS.md` (this file) and `README.md` with the logging rules.
- Recorded the judge/sponsor interview: summary + raw transcript in
  [`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md).
- Key takeaways now driving the build: autonomy is mandatory, memory is the
  thesis (not a feature), cash reconciliation alone is the "easy" path the judge
  called out, and the target customer is ~Series A and above.
- Repo is otherwise empty — no code, no stack chosen.

### 2026-09-19 ~17:10 ET — Research added; direction proposed (Karan + Claude Code session)

- Added [`research/`](./research/README.md): the track brief verbatim, a transcription of Maximor's workshop slides (given by their CTO), company intel with sources, an analysis of Maximor's Syndicate hackathon, agent-stack and memory-layer findings, sandbox and connector notes with API quirks, the earlier plan's reasoning, and hackathon logistics.
- Added [`PROJECT_SPEC.md`](./PROJECT_SPEC.md): proposed final spec. Frozen schema, tool interface, kernel checks, three lanes, checkpoints, cut order, demo script. **Status: proposed, not yet agreed by the whole team.**
- New facts that change earlier notes:
  - Target customer is $50M-$500M revenue, not Series A (see Open questions).
  - The workshop gave Maximor's own mechanism: reconstruct → replay ("hide the answer, re-run the close") → compile ("repeated judgment → policy", "compile away as much freedom as possible") → verify ("pytest for finance": six runtime checks). The CTO also listed three open questions: what is Lean for finance, can agent costs compress with scale, intent as first-class state. The spec attempts each.
  - Foundation Capital led Maximor's seed, and its context-graph essay (cited in the track doc) names Maximor as the finance example.
- Tried and rejected table filled in with today's abandoned directions.
- Not added on purpose: photos from the workshop (they show a person), and tracker files containing the venue Wi-Fi password and personal contact details.
- Blocked on humans: team sign-off on the proposed direction; Intuit developer app and OAuth token; decision on the bank feed (Increase sandbox vs file); who owns which lane.

### 2026-09-19 ~17:40 ET — Spec v3: the team's whiteboard plan folded in (Karan + Claude Code session)

- The team's whiteboard plan had three stages: workflow context (emails, Slack, connectors, md files), finding the reason (off numbers, look through receipts), custom agents (low token cost, low latency); plus "compare data sets", equity, invoice generator, traces like LangSmith, fine-tune a model.
- Mapped into [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) v3:
  - **Drift monitor** is now the front door ("compare data sets"): deterministic comparators across contract, CRM, invoice, bank, ledger and forecast; a known fact suppresses an expected difference, anything else opens an intent.
  - **Real connectors, all seeded** from one canonical world file with planted drift, a manifest, a reset command and an answer key agents cannot read (spec section 6b). HubSpot moved from local to real.
  - **Custom agent router**: compiled rule → small model → frontier model, escalating when the kernel rejects. Fine-tuning a small model on kernel-verified traces is a stretch item, first thing cut.
  - **Decision traces** stored per decision and shown as a timeline; they are also the replay and training data.
  - **Equity-lite** added as a ninth function, last in build order, labeled as a stretch.
  - New section "What Maximor already ships, and what we add on top": the talk track.
- Added [`diagrams/`](./diagrams/): architecture and one-slide Mermaid sources with PNG renders (both validated by rendering).
- Feedback that prompted this: the short description sounded like a junior project. The differentiators are now stated against Maximor's shipping product and their CTO's open questions.
- Pending: sourced finance pain-point numbers (research running).

### 2026-09-19 ~17:55 ET — Sourced finance pain points added (Karan + Claude Code session)

- Added [`research/finance-pain-points.md`](./research/finance-pain-points.md): ten pain points, every number with a source link, vendor surveys labeled, and a "do not use" list of popular claims that failed a direct check.
- Spec section 2a now maps each pain to the function that answers it. Strongest for this sponsor: their own commissioned study says only 14% of CFOs fully trust AI accounting data unsupervised, which is the case for proof-carrying entries.
- Three researched scenarios added to the seeding plan as second-wave plants: the reopened close, the missed price escalator, and the accrual whose owner left.

### 2026-09-19 — Test corpus added; AGENTS.md added

- Added [`../tests/`](../tests/): an Office-of-the-CFO edge-case corpus, 115 cases
  in the hard tail of finance ops, each with an **expected route**
  (`AUTO` / `PROPOSE` / `ESCALATE` / `REFUSE` / `BLOCK`, plus `INVARIANT`).
  Corpus prose is ground truth; `tests/cases.csv` is the machine-readable index
  mapped onto the proposed function packs; `tests/RESULTS.md` is the scoreboard.
- Added [`../AGENTS.md`](../AGENTS.md) at the repo root: tells any agent to read
  this file first, how to log to it, what the tests are, and that the spec lives
  on the `research/claude-session-notes` branch rather than `main`.
- Nothing has been run — all 115 cases are `todo`. No system exists yet.
- Three findings from mapping the corpus onto the spec, each needs a decision:
  - **Only 18 of 115 cases are auto-clearable**, and `ESCALATE` is the single
    largest route at 39. The corpus tests partitioning, not throughput; a system
    tuned for auto-clear rate fails it by construction.
  - **19 cases are out of the spec's declared scope** (tax, FX, multi-entity,
    Stripe). Two of those matter: `A-07`/`H-2` (Stripe processor payout) is in
    the corpus's own minimum fixture *and* a demo beat, and `H-6` (evidence
    changed underneath you) is restageable on `A-24` to bring it back in scope.
  - Coverage is bank-rec and AP heavy: `revenue` and `forecast` have **zero**
    minimum-fixture cases and `audit` has one case total, while the demo spine
    runs through exactly those packs. That fixture has to come from the spec's
    own planted cases, not from this corpus.
- Note on branches: this file has now diverged between `main` and
  `research/claude-session-notes`. The research branch's copy carries the
  proposed-direction and research entries; this copy carries the tests entry.


### 2026-09-19 ~18:45 ET — `research/claude-session-notes` merged into `main`

- Merged the research branch into `main` (no fast-forward). `main` now carries
  `PROJECT_SPEC.md`, `research/` (9 files) and `diagrams/` alongside the test
  corpus and `AGENTS.md`. The branch is no longer the place the spec lives.
- One conflict, in this file, resolved as a **union** — both sides had only
  appended. The "At a glance" table now keeps all four rows (test bar, agent
  onboarding, spec, research) and the spec row points at the file on `main`.
  Log entries are in commit-time order: research (17:10, 17:35, 17:38) then the
  test corpus (18:33). Nothing was dropped from either side.
- **Supersedes** the last bullet of the "Test corpus added" entry and its twin in
  `AGENTS.md`: the spec is on `main`, not on a branch. That branch note is stale
  wherever it still appears.
- Replaced `research/maximor-track-brief.md` with the full text of both track
  documents, pasted by Karan. The previous copy was labeled verbatim but was
  abridged: it had dropped the **Key concepts** section entirely, compressed the
  six reference-point benchmarks to a single line of names, and condensed the
  prize amounts and fast-track detail. Nothing in the file is paraphrased now.
  Nothing in the spec depended on the dropped text, so no spec change follows.
- Still blocked on humans, unchanged by this merge: team sign-off on the
  proposed direction, the Intuit developer app and OAuth token, the bank-feed
  decision (Increase sandbox vs file), and lane ownership.


### 2026-09-19 ~19:30 ET — Architecture board added (AthM23 + Claude Code session)

- Added [`diagrams/architecture/`](./diagrams/architecture/README.md): a 20-sheet **target architecture**
  (1,931 nodes, 2,586 edges). Mermaid sources are the source of truth; SVG renders and an editable Excalidraw
  board (all sheets on one canvas, arrows bound to nodes) are generated from them by `tools/build.mjs`.
  Sheets: master map · inputs and integrators · context graph · drift monitor and intents · judgment layer and
  kernel · human loop · nine function packs · learning loops · fine-tune pipeline · observability ·
  testing and benchmarking · demo spine. **Nothing on it is built or measured.**
- Added [`research/architecture-briefs/`](./research/architecture-briefs/): seven research briefs behind the
  sheets, sources linked, unconfirmed items marked UNVERIFIED.
- Process: research agents → one author per sheet, each required to render and inspect → four independent
  reviewers checked every sheet against `tests/cases.csv` routes, the briefs and the spec and fixed about 190
  issues → event topic names normalised to one proposed list of 50 (`diagrams/architecture/EVENT_TOPICS.md`).
- **Direction stated by AthM23 this session:** fine-tuning will use an **open-weight model**, and the
  architecture should carry heavy testing and benchmarking anchored on the sponsor's track doc. Sheet 21 draws
  LoRA SFT on a small open-weight model (Claude as teacher, kernel as rejection-sampling filter, a gradient-boosted
  pair-feature baseline it must beat, calibrate-and-abstain, shadow before promote). Sheet 23 draws the test
  pyramid, pass^k over seeds, ablations, the sponsor's six reference benchmarks and the metric tree.
  Not reconciled: spec §11 still lists the fine-tuned model as the first thing cut.
- **Proposed, new this session:** an overnight autoresearch-style loop (sheet 20, loop D): cluster failed traces →
  one change per git branch → eval under a fixed budget → lexicographic gate (false auto-posts = 0, no
  regressions, then accuracy, then fewer escalations) → keep or reset → held-out check → human approval queue.
  Kernel, scorer, corpus labels, held-out set and answer key are read-only to it. This does **not** reopen the
  rejected "live GEPA/DSPy" row: GEPA appears only as an optional offline batch proposer inside that loop. What
  changed for batch use: the GEPA repo states it works from about 3 examples and 100-500 metric calls.
- **Spec corrections the research found** (drawn on the sheets, **not applied to `PROJECT_SPEC.md`**; full list
  in the board README): the Initech credit memo must debit deferred revenue or revenue drops twice · bank-rec
  kernel check becomes typed match groups plus a two-sided proof, timing items are not entries · B-17 is BLOCK and
  a Slack approval does not lift it · duplicates need an obligation key · the single $500 threshold should be three
  · accruals need a `reversal_mode` · flux review gates the lock · Slack Socket Mode removes the tunnel ·
  QuickBooks should be polled via Change Data Capture (UNVERIFIED, Intuit's pages would not load) · the trace
  store needs the seeder to supply world `recorded_time` or no-look-ahead replay breaks · the auditor must be
  fenced off from preparer memory · schema gaps (party and alias master, evidence versioning, approval record,
  `posted_at` / `locked_at`, `blocked_attempt`, employee and grant tables, artifact kinds in `Proposal.kind`).
- Blocked on humans, added by this work: can anything above the $500 approval threshold ever be AUTO · does the
  GPT controller's approval count as PROPOSE when the corpus says a human clicks approve · which model family
  runs the auditor · which schema additions go in before the freeze. Still open from before: team sign-off on the
  direction, Intuit app and token, bank-feed decision, lane ownership, Stripe payout scope (A-07 / H-2).

### 2026-09-19 ~19:40 ET — Two-person roadmap added (AthM23 + Claude Code session)

- Added [`ROADMAP.md`](./ROADMAP.md) at AthM23's request: the build divided between **two** people for the
  ~15 hours left. **Proposed, not yet agreed.** Person A owns judgment and learning (kernel, `propose_entry`
  runtime, router, investigator, controller, Slack escalation → fact memory, replay and compile, eval harness,
  open-weight fine-tune, results). Person B owns the world, engines and surface (seeder, connectors, ingestion,
  ledger, drift monitor, deterministic engines, event bus, close conductor, QuickBooks mirror, console, demo).
  AR, AP and revenue are split engine (B) / agent pack (A). The only jointly edited code is `src/contract/`.
- Spec §10 assumed three lanes and §11's checkpoints began at 18:15; no code exists at 19:40, so the roadmap
  re-times them: contract 20:30 · walking skeleton 22:30 · spine 00:45 · freeze 09:00 · submit 10:45. It does not
  change scope, schema, tool names or the never-cut list. Whether the team is now two builders or the spec's
  three was not stated; if three, the Surface items in B's lane split back out.
- Blocked on humans: who is Person A and who is Person B; the four Phase 0 decisions listed in the roadmap.

### 2026-09-19 ~19:55 ET — Lanes assigned; scaffold and DRAFT contract landed (Karan + Claude Code session)

- **Person A = Karan, Person B = Atharv**, stated by Karan. `ROADMAP.md` updated. This clears the "who is A and B" blocker.
- Repo scaffold committed: TypeScript ESM (NodeNext), Node 22, pnpm, vitest, zod, better-sqlite3, tsx. `pnpm install` needs
  the native build allowed; `pnpm-workspace.yaml` already does that. `pnpm test`, `pnpm typecheck`.
- `src/contract/` committed as a **DRAFT written by Person A alone**, so it is not frozen: `types.ts` (`Proposal`, `Mark`,
  routes, six block rules, two-stage `KernelResult`), `tools.ts` (tool registry from spec §8, auditor deny-list),
  `topics.ts` (the 50 topics from `EVENT_TOPICS.md`), `schema.sql` (spec §7 plus the roadmap's "take now" additions, each
  marked `-- ADDED`; 30 tables; loads in SQLite). Atharv: edit it in conversation with Karan, points marked `DECIDE:`.
  Differences from spec §7 worth a look: one `party` table with `alias` instead of `customer` and `vendor`; `gl_line.party_id`;
  `decision.route`, `decision.tier`, `decision_step`; `approval`, `blocked_attempt`, `approver`; `fact.uses`,
  `fact.max_amount_cents`, `fact.explained_amount_cents`; `escalation.dedupe_key`; `bill.service_period`.
- `src/kernel/types.ts`: the kernel's input interface (plain data and lookups, no database or model import).
- **Proposed by Person A for the four Phase 0 decisions (not agreed):** (1) nothing at or above $500 is AUTO except an
  exact-match cash application with no residual; the threshold applies to the adjustment amount, not the matched payment.
  (2) The GPT controller reviews and signs judgment marks but its approval does not satisfy PROPOSE at or above $500; a
  person clicks. (3) Bank feed from a file now. (4) Processor payout in as a file, cut early if behind. Auditor model:
  open-weight on the fine-tune host, so it differs from Claude and GPT.
- In progress, Person A: kernel checks with pass and fail fixtures, eval harness for `tests/cases.csv`, then the
  `propose_entry` runtime. No API keys are needed for these.

### 2026-09-19 ~20:00 ET — Third builder joins; ASUS GX10 checked out; local fine-tune lane proposed (Preet + Claude Code session)

- **Preet is the third builder.** ROADMAP's two-person re-cut is superseded on one point: a lane C is
  proposed in [`research/gx10-finetune-plan.md`](./research/gx10-finetune-plan.md) — Preet takes the
  fine-tune/eval-data items out of A's overnight (trace export, rejection-sampling filter, GBT baseline,
  LoRA SFT, shadow eval, serving, cost/latency numbers). A and B lanes otherwise unchanged. **Proposed,
  needs A+B sign-off.**
- **Hardware: ASUS Ascent GX10 checked out from the ASUS booth** (GB10 Grace Blackwell, 128 GB unified,
  aarch64, DGX OS). This supersedes "Team machine has NO NVIDIA GPU" in
  `research/architecture-briefs/fine-tuning.md` and removes the hosted-LoRA route (Together/Modal) entirely:
  the open-weight SFT trains and serves locally. Everything else in that brief stands (GBT primary, task (e)
  extraction target, shadow-only, routes stay rules).
- Access: Tailscale mesh is up — Preet's MacBook `100.119.234.32`, GX10 `100.73.102.120`
  (`gx10-d56e`, MagicDNS `gx10-d56e.tail800199.ts.net`). The GX10 has **no keyboard**; all work goes over
  SSH from the Mac. Username `asus`; key-based auth being set up. Tailscale SSH not enabled.
- Cloned https://github.com/karpathy/autoresearch beside the repo as reference for sheet 20 loop D
  (still cut 1st; unchanged).
- Added [`research/winner-patterns-2026.md`](./research/winner-patterns-2026.md): web-researched synthesis
  of 2023-2026 winners at HackMIT/TreeHacks/CalHacks/PennApps/HackHarvard, distilled to demo lessons —
  judge-interactive live moment, delete flaky features, name the built-vs-bought split, trust-layer framing,
  track stacking. Feeds B's demo lane; changes no build scope.
- Possible extra prize surface: ASUS "Build What's Next" (project built on ASUS hardware). Verify at the
  booth that it stacks with Maximor before adding it to Plume.
- Blocked on humans: one-time SSH password entry on the Mac to install Preet's key on the GX10; A+B
  sign-off on lane C.

### 2026-09-19 ~20:00 ET — Kernel, `propose_entry` runtime, fact memory and router tier 0 landed (Person A)

_Heading time corrected from "~20:20": commit `805e468` is stamped 19:59._

- `src/kernel/`: pure functions, no database or model import. Marks F1-F3, F7, E1-E3, E5, P1-P6, P9, J1-J3 and the six hard
  BLOCK rules; two stages (proposal, post gate). Every check has a passing and a failing fixture. `src/runtime/`:
  `proposeEntry` is the only write path (zod → decision → kernel → AUTO post, PROPOSE park, or BLOCK persisted with its
  rule and an `entry.blocked` event), `approveDecision` re-runs the kernel as the post gate with the approver's identity,
  posting is one SQLite transaction (ledger, open balances, artifact, events). `src/memory/`: fact candidates with guards,
  approval that inherits the approver's ceiling, applicability decided in code with the failed dimension named, one-time
  facts, supersede and expiry, asked-once escalations. `src/router/`: tier 0 builds proposals in code from an exact match,
  an active fact or an approved policy.
- Measured: `pnpm test` → 10 files, **176 tests passing**; `pnpm typecheck` clean. Covered end to end on an in-memory
  database: Initech cash application posts AUTO; the $1,200 credit memo parks as PROPOSE and posts after a human approves;
  changing one character of the quoted email makes the kernel reject (E2); the controller agent cannot approve at or above
  $500; preparer-as-approver, over-limit approver and a locked period each BLOCK and persist; a $20 wire shortfall clears
  on a compiled policy with zero model calls and AR stays tied; replay never posts. No model has been called yet.
- **Contract changes made by Person A alone since the last entry, for Atharv to review:** `src/contract/accounts.ts`
  (chart of accounts as codes), `CaseFile` in `types.ts` and `intent.case_json` in `schema.sql` (the structured difference
  the drift monitor hands to the router: party, docs, expected, received, shortfall, method, trace ids).
- **Seeder obligation the kernel enforces (F3):** before any proposal runs, GL 1200 must equal the sum of open invoice
  balances, and GL 2000 the sum of approved or scheduled bills. If the seed posts invoices without their ledger entries,
  every AR proposal is rejected with "not tied before the proposal".
- One brief error of mine, fixed: P9 first rejected any terms end date outside the fiscal window, which rejected the
  Initech concession (ends 2027-06-30). It now checks the entry date against the window, and the terms end date against
  "not in the past, not more than five years out".
- Next for Person A: the agent loop on the Claude Agent SDK and the AR agent pack (needs an Anthropic key to run), the
  eval harness for `tests/cases.csv`, then replay and compile.

### 2026-09-19 ~20:12 ET — Agent layer, Agent SDK investigator and eval harness landed (Person A)

- `src/agents/`: read tools over `trace` with the replay as-of guard applied in SQL, write tools (`propose_entry`,
  `escalate`, `record_fact_candidate`, `finish`), one metered dispatcher used by every harness, a `decision_step`
  timeline, the AR system prompt (no exception-specific instructions), and `runCase`: tier 0 in code, then
  investigators by tier, with the route settled from what happened at the write tools rather than from the agent's
  own summary. Decisions are now opened at intake so steps and cost are metered from the start.
- `src/agents/sdk.ts`: the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.277, zod 4 peer) as an investigator:
  `tools: []` (no file, shell or web tools), only our MCP tools allowed, `settingSources: []`, empty temp working
  directory, `maxTurns` and `maxBudgetUsd` per tier. It typechecks against the SDK. **It has not been run: no
  Anthropic key is set on this machine yet.** `tsx src/agents/cli.ts <db> <case.json>` runs one case once a key exists.
- Scripted investigators (test doubles that can only act through the tools) cover Initech end to end (cash AUTO,
  agent finds the CEO email, credit memo PROPOSE, human approves, books tie, fact candidate recorded) and Wayne
  (nothing found, owner asked once, ESCALATE, nothing written off, the repeat case does not ask again).
- `eval/`: loads and validates `tests/cases.csv` (115 rows; routes and min-fixture counts asserted), grades the route
  with each route's obligation (BLOCK names its rule, REFUSE lists where it looked, ESCALATE names the unknown),
  the five rubric numbers as k / n, confusion matrix, out-of-scope rows reported separately, `--baseline`, `--stage
  min`, recorded-outcomes replay, and **exit code 2 on any false auto-post**. `pnpm eval --stage min` currently reports
  0 of 22 cases run, because no case is wired to the system yet.
- Measured: `pnpm test` → 17 files, **235 tests passing**; `pnpm typecheck` clean. Nothing has called a model.
- For Atharv: the investigator reads `trace` rows by `source` (`gmail`, `slack`, `contract`, `crm`, `file`, `workbook`)
  and needs `party.owner_user` for escalation. Ingest with a real `recorded_time`, or replay sees everything at once.

### 2026-09-19 ~20:16 ET — Replay, compile and the autonomy ladder landed (Person A)

- `src/learn/replay.ts`: for each `decision_point` in time order, hide the humans' entry, run the case as of
  `decided_at` (trace reads are as-of in SQL; document balances come from the case snapshot, because today's ledger
  already shows Q2 invoices settled), never post, and score in code against `human_outcome_json`. A miss where the
  agent sided with the humans' own majority is triaged `human_inconsistent` and not held against the agent.
- `src/learn/compile.ts`: deterministic policy induction. Groups the humans' judgments by treatment, account and
  method; needs three agreeing cases; the ceiling is the largest amount the humans actually did (never wider);
  backtests on every closed decision point; **one prior mis-clear refuses the draft**; same-treatment different-account
  cases are listed for the approver as outliers. Drafts are `proposed` and do nothing until `approvePolicy`, where the
  policy inherits its approver's ceiling. `src/learn/autonomy.ts`: auto at 95% with n of 5 or more and coverage by a
  cited policy or fact; review at 80%; otherwise shadow. Counts stored, not just rates.
- Measured on a seeded mini-Q2 (six wire shortfalls, one booked by a human to the wrong account): the compiler drafts
  "write off to 6150 up to 4,500 cents for wires" with backtest 5 of 6 and the outlier named; with the policy approved,
  replay through tier 0 reproduces 5 of 6 and triages the sixth as `human_inconsistent`; the ladder moves that kind to
  auto (6 of 6, covered); the next July wire shortfall clears with zero model calls. With no policy, replay proposes
  nothing on all six rather than guessing. `pnpm test` → 18 files, **242 passing**. Still no model call anywhere.
- Eval grader tightened: a false auto-post is always graded incorrect, even when the route label matches.
- **Contract additions by Person A alone, for Atharv (seeder) to review:** `decision_point.case_json` (a `CaseFile` with
  `docs_snapshot`: balances as the humans saw them), `HumanOutcome` type for `human_outcome_json` (kind, account,
  amount, docs, who was asked), and an `autonomy` table. The Q2 seed needs both JSON columns per decision point.
- Lane C (Preet, fine-tune on the GX10): fine by Person A's code, which already writes `decision_step` rows for export.
  Sign-off is Karan's to give.
