# Project Status — money-maxing

**Source of truth.** Read this before starting work. Append to it after anything
notable. See [`README.md`](./README.md) for the rules.

---

## At a glance

| | |
|---|---|
| **Last updated** | 2026-09-19 ~23:15 ET |
| **Phase** | Phase 1 of lanes A and B is merged on `main` and runs end to end (log, 09-19 ~21:35 merge entry); Phase 2 in progress. Demo focus **proposed**, not agreed |
| **Repo state** | `main` = lanes A, B and C. `atharv-branch` adds lane B's Phase 2: `pnpm test` → 58 files, 584 passing; `pnpm typecheck` clean (measured 09-19 ~23:15, before merging the newer `main`) |
| **Deadline** | 24h hackathon build |
| **Design brief** | [`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md) |
| **Judge feedback v2** | [`judge-feedback-v2-2026-09-19.md`](./judge-feedback-v2-2026-09-19.md): do not be generic; 2-3 processes as one customer story; own benchmark + fine-tune comparison |
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
| 09-19 | Carrying the seeded world id in the Gmail `Message-ID` header | Verified live: `messages.insert` replaces it with Gmail's own id, which broke idempotent seeding (16 duplicates inserted). The id now travels in `X-Footnote-Id`. |
| 09-19 | A second Phase 0 contract, written on `atharv-branch` | Person A's contract on `main` already had the kernel, runtime, agents and eval built on it. `main` was merged and theirs taken; B's extra tables live in `src/ledger/schema-b.sql`. |

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

### 2026-09-19 ~20:22 ET — Human-answer path, controller agent and Slack transport written (Person A)

- `src/agents/humanLoop.ts`: a person's reply is kept verbatim as a `trace` (source slack, kind human_answer), the
  escalation is answered, a fact is stored that is never wider than what was said (this party, this treatment, one-time
  unless stated standing, always ends, inherits the answerer's ceiling), and the case resumes with an entry that quotes
  the answer. A one-time or lapsed answer does not cover later cases: the new question carries the old answer.
  Tested end to end for Wayne with a scripted investigator.
- `src/agents/controller.ts`: independent review packet (proposal, kernel marks, full text of cited sources). The
  controller can approve only below materiality and only if the approval matrix lists it with a ceiling; at or above
  materiality its note goes to the human approver; a disagreement posts nothing. `controllerOpenAI.ts` is the GPT
  implementation (`FOOTNOTE_CONTROLLER_MODEL`, default `gpt-5`, **UNVERIFIED that this model id exists**; one JSON call;
  an unreadable reply counts as not agreeing). **Seeder note for Atharv:** add an `approver` row for `controller:gpt`
  with `limit_cents` 49999, or the controller approves nothing.
- `src/agents/slack/`: Block Kit builders as plain data (escalation with what was checked and hit counts, answer modal
  with one-time vs standing, approval card with the entry, tick-mark tally, quoted evidence and the controller's note)
  and a Socket Mode transport (no tunnel). Answers and approvals go through `recordHumanAnswer` and `approveDecision`,
  so identity checks and the kernel's post gate apply unchanged.
- Measured: `pnpm test` → 21 files, **252 passing**. **Not run:** the Agent SDK investigator, the GPT controller and
  the Slack transport, because no Anthropic, OpenAI or Slack tokens are set on Person A's machine. All three are
  typechecked against their installed SDKs only.
- Blocked on a human (Karan): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and a Slack app in Socket Mode
  (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` with `connections:write`; bot scopes `chat:write`, `im:write`).

### 2026-09-19 ~20:29 ET — Independent review of Person A's code: nine confirmed holes, all fixed with regression tests

An independent reviewer agent (read-only, reproduced each finding with a probe) went through `src/kernel`, `runtime`,
`memory`, `router` and `agents`. **Two findings were false auto-post or double-post paths, which is the one thing this
system claims cannot happen.** They were real. All are fixed; each has a regression test in
`src/runtime/__tests__/reviewFindings.test.ts` that posted wrongly before the fix.

| # | Severity | What was wrong | Fix |
|---|---|---|---|
| 1 | critical | A write-off booked Dr cash / Cr AR read as a zero adjustment (control accounts were excluded), needed no evidence, and **posted AUTO** | Adjustment for non-cash reducing kinds is at least the amount applied; new check **F8** (entry shape fits the kind: a concession or write-off never touches cash; its outside-control debit equals what it applies) |
| 1b | critical | `apply_payment` with no bank line was accepted; one bank line could be applied twice | A cash application requires a bank line; the kernel subtracts what posted decisions already applied from it |
| 2 | critical | The same proposal parked twice, approved twice, **posted twice** | An identical proposal on the same intent that is pending or posted is handed back, not recorded again; approval refuses a decision whose twin already posted |
| 3 | high | Any active alias fact switched off the whole party tie, so one customer's cash could pay another's invoice | Documents must always belong to the proposal's party; an alias fact covers only the bank line of the one payer it names |
| 4 | high | Re-proposing a human-approved entry reported route AUTO | The stored route is returned |
| 5 | high | Kinds that write no ledger entry (dispute hold) were never deduped, and one-time facts cited on them never counted as used | `decision.posted_at` (schema addition) is stamped inside the post transaction for every kind; idempotency and fact-use counting key on it |
| 6 | medium | Ledger and bank tools had no as-of guard in replay | In replay, open invoices come from the case snapshot and a bank line posted after the as-of date does not exist |
| 7 | medium | Two applications to one document each passed F2, then the post threw and aborted the run | F2 adds applications per document; a failed post now returns a rejection (mark X1) instead of throwing |
| 8 | medium | The approval row was written outside the post transaction | Approval and post are one transaction |
| 9 | low | A fact with unreadable scope JSON was treated as unrestricted | It now covers no kind (fails closed) |

- Measured after the fixes: `pnpm test` → 22 files, **263 passing**; `pnpm typecheck` clean.
- What this changes in how we talk about it: "zero wrong auto-posts" is a property we test for, and a reviewer found two
  ways to break it within an hour. Say that in the limitations section, with the count of adversarial probes run.
- Contract change: `decision.posted_at`. `FactLite.value` added to the kernel's input types.

### 2026-09-19 ~20:46 ET — Free integration credentials configured and verified

- User authorized browser-based setup and credential extraction for Northwind Systems, with no purchases. Saved all eight requested QBO/Gmail/HubSpot fields in the Git-ignored `.env`; no secrets recorded here.
- QBO: reused Northwind Systems workspace and existing Test App (development); sandbox realm `9341457949189147` (Sandbox Company US effc). Authorized accounting scope through Intuit Playground. Verified refresh and sandbox CompanyInfo API both HTTP 200; persisted the refresh token returned by verification.
- HubSpot: account `247448288`, service key named Northwind Systems Finance Ops (key ID `53805625`). Used service keys because the current UI recommends them over legacy private apps. User explicitly approved companies/contacts/deals read and write (six scopes). Verified all three read endpoints HTTP 200. Did not seed or modify CRM records. Account's formal developer-test classification was not verified.
- Gmail: signed-in demo mailbox had no accessible Cloud projects, so created Northwind Systems project `hazel-framing-509200-n8`, OAuth app Northwind Systems Finance Ops, web client Northwind Gmail. Enabled Gmail API, added the demo mailbox as a test user, used Google's OAuth Playground with own client credentials. User approved Google terms, API User Data Policy, credential exchange and requested scopes. Verified refresh and profile API HTTP 200; returned scopes exactly gmail.readonly + gmail.insert. App remains in Testing; no billing or paid trial enabled. Earlier note about an existing Gmail client does not describe this signed-in account.
- No financial transactions, purchases, email sends, or demo seeding performed. Initial API verification was blocked by restricted network; approved network execution succeeded. Browser approval review required explicit scope and credential-destination confirmations, which the user supplied.

### 2026-09-19 ~20:52 ET — First real model runs; one key is enough; controller caught a treatment error (Person A)

- **One key is enough now.** `ANTHROPIC_API_KEY` lives in the repo's git-ignored `.env` (loaded by the CLIs; never committed).
  The controller falls back to a different Claude model (`claude-opus-5`, structured output, fails closed on refusal,
  truncation or an unreadable reply) when there is no OpenAI key; with one it uses GPT. Same family means weaker
  independence than GPT: say so in the limitations. Slack is optional: `pnpm inbox <db> list|answer|approve|reject` is
  the human side in a terminal and calls the same functions as the Slack transport.
- `pnpm demo [party]` seeds a small on-disk July (`src/demo/seed.ts`: three customers, a mailbox with the answer
  buried among ordinary mail, one approved policy) and runs the cases with the real tiers. Person B's seeder replaces it.
- **Measured, real models, 19 Sep:** Umbrella's $20 wire shortfall: AUTO → AUTO at tier 0, 7 ms, zero model calls, books
  tied. Initech's $1,200: Haiku (tier 1) searched facts, policy, workbook, bank, ledger, CRM, mail, Slack, contracts,
  found and read the CEO's email, recorded a fact candidate, and had four proposals rejected by the kernel before one
  passed every mark and parked as PROPOSE: 25 model turns, 82 s, **$0.085**. The controller (Opus 5) then **disagreed**:
  the draft was a `write_off` debiting revenue 4000 rather than a credit memo against deferred revenue 2400, and the
  email itself says "I have not told finance yet". Nothing posted. n = 1 run; not a rate.
- Three defects found by running it for real, each fixed with a test:
  1. The Agent SDK silently returned an **empty tool list** because one tool's input used a free-form record
     (`propertyNames` in JSON Schema). With no tools the model wrote fake tool calls as prose. The fact tool's input is
     now typed, a test bans `propertyNames` in any tool schema, and the investigator aborts loudly if the model starts
     with fewer tools than we defined.
  2. Trace search required every query word to match, so a query with one wrong word missed the CEO email and the
     agent escalated. Search is now ranked by how many terms match.
  3. The kernel accepted a concession booked straight to revenue. New mark **J4**: the judgment amount must land on an
     account the chart-of-accounts policy permits for that kind (credit memo → 2400 or 4900; write-off → 6150 or 6990).
- Also added: only tier 2 and above may ask a person when a stronger tier exists (a person's time costs more than a
  stronger model), lower tiers' findings are handed up as notes, and **preparer → reviewer → one revision**
  (`src/agents/review.ts`): a controller disagreement declines the draft on the record and sends its concerns to a
  stronger tier once; a person sees only what survives, with the controller's notes.
- `pnpm test` → 25 files, **270 passing**. Model ids per Anthropic's current list: `claude-haiku-4-5`, `claude-sonnet-5`,
  `claude-opus-5`.

### 2026-09-19 ~20:53 ET — Slack app configured and connection verified

- Created and installed Northwind Finance Ops (`A0C37Q8RUSY`) in existing Northwind Systems workspace (`T0C3620JPBK`). User explicitly approved bot scopes chat:write/im:write, app-token scope connections:write, and installation terms.
- Saved SLACK_BOT_TOKEN and SLACK_APP_TOKEN in ignored `.env`. Enabled Socket Mode and interactivity to match existing `src/agents/slack/transport.ts`; no public callback or paid plan needed.
- Verified Slack auth.test, apps.connections.open, and a live WebSocket hello handshake. No messages sent and no persistent agent started. Full approval interaction remains untested; real human Slack IDs must be mapped by the seeder to approver records.
- Added `context/SLACK_SETUP.md` with non-secret IDs and runtime handoff. No financial authority changes, purchases, or additional history-reading scopes.

### 2026-09-19 ~20:55 ET — Reviewer re-probe: four worst holes confirmed closed; second batch of findings fixed (Person A)

- The reviewer re-probed findings 1, 2, 4 and 5 against commit `15868e6` and reported each **closed** (the cash-booked
  write-off now rejects on F8, and the same trick on a credit memo too; a twin proposal returns `not_pending`; the
  stored route is returned; a second approval of a dispute hold does nothing and a used one-time fact is refused).
  No style-rule violations found (no function over 50 lines, no nesting past 4, no `console.log`).
- Second batch, reported as plausible rather than reproduced, fixed anyway with regression tests:
  - **E5 counted evidence, not relevance.** One resolvable trace used to satisfy it. Now a judgment amount needs either
    a cited policy or fact (checked at J1 and J2) or at least one **quoted** source filed under this party or under
    nobody. A quote from another customer's mail no longer carries it. Whether the quote *means* what is claimed
    remains judgment, which is the controller's job.
  - **F2 ignored payment direction.** A cash application needs money in; a payment out needs a debit; a kind that moves
    no cash may not cite a bank line.
  - **A standing answer could cover a much larger case.** An answer now carries the answerer's approval limit and never
    covers a later case above it.
  - **Only the first proposal in a run was scored.** The judgment route is now the most restrictive outcome of
    everything the agent proposed for the intent (BLOCK > ESCALATE > REFUSE > PROPOSE > AUTO).
  - The LIKE-wildcard finding no longer applies: ranked search matches terms in code, not in SQL patterns.
- One behaviour change the reviewer flagged, reversed on purpose: a dispute hold reduces nothing, so it carries no
  adjustment and needs no approver with authority over the disputed amount. It is the safe default when nobody answers.
- `pnpm test` → 25 files, **273 passing**.

### 2026-09-19 ~21:05 ET — Phase 1, Person B: world, ingestion, drift, bus, console; walking skeleton runs; QuickBooks and Gmail verified live (AthM23 + Claude Code session)

- **Contract: Person A's wins. Superseded:** a Phase 0 contract was also written on `atharv-branch` (commit `3b750a3`,
  ~20:15, never on `main`). Person A's `src/contract/` already had the kernel, runtime, agents and eval built on it and
  nothing was built on B's, so `main` was merged into `atharv-branch` with every conflict resolved to `main`. B's Phase 0
  decisions matched A's proposals on all four points (AUTO above $500 only through a ceiling or an exact cash match; GPT
  controller is a reviewer; bank feed is a file; processor payout is a file, stretch). **`src/contract/` was not edited.**
  Tables B needs that the contract lacks live in `src/ledger/schema-b.sql` (additive, never read by the kernel or a
  tool): `event_cursor`, `seed_manifest`, `bank_match_seed`, `drift_case` (intent dedupe; `intent` has no dedupe column).
- **Landed (all of B's Phase 1 column):**
  - `world/northwind.json` v0 from an integer seed (`src/seed/generate.ts`, byte-identical per seed): 12 customers plus
    the Globex parent, 10 vendors, Q2 + July invoices and bills, 78 bank lines, 16 emails, 5 chat messages, CRM deals and
    notes, contracts, a policy memo. Plants: Initech ($10,800 on INV-1042, CEO email of 28 Jun), Wayne ($3,300 short,
    nothing explains it, and a test asserts that), parent pays for subsidiary, a late payer, two July wire-fee
    short-pays, and six Q2 wire-fee write-offs as `decision_point` rows with `case_json` + `human_outcome_json` (one
    booked to the wrong account, for replay's `human_inconsistent`). The answer key is `world/answer-key.json`,
    gitignored. **The 12 customers bill $172k a month, not $60M a year: they are the modelled slice, not the company.**
  - Local seeder: parties, aliases, approvers (incl. `controller:gpt` at 49,999, as A asked), contracts, documents and
    the human-closed Q2 books. Kernel F3 holds before any proposal: GL 1200 = open invoices, GL 2000 = approved bills,
    the trial balance foots, GL cash at 30 Jun = the bank's running balance.
  - Ingestion (`src/ingest/`): the only writer of `trace` and `bank_txn`; idempotent on `(source, external_id)`, sha256
    content hash, changed content becomes version n+1 with `evidence.reversioned`; three clocks kept apart; entity
    resolution from the alias table only. The bank file is validated before content (field count, two-place decimals,
    running balance as the control total) and refused whole on failure (`ingest.refused`).
  - Event bus (`src/bus/`): `emit` (refuses a topic outside the 50) · `poll` with a per-subscriber cursor,
    at-least-once · `subscribe`.
  - Drift comparator C2, invoice vs cash received: one intent per unmatched credit with a `CaseFile` in
    `intent.case_json`; emits `bankrec.unmatched` (side credit), and `drift.explained` when an active fact explains the
    shortfall. Intents close from the ledger (bank line applied, documents settled), not on an agent's say-so.
  - Ledger reads, plus `LEDGER_TOOL_SPECS` in A's `ToolSpec` shape for `ledger.get_invoice`, `bank.unmatched` and
    `ledger.trial_balance`. **For Karan:** spread them into `READ_TOOL_SPECS` to give them to the agent; B did not edit
    `src/agents/`. `ledger.open_invoices` and `bank.get_transaction` already exist in A's tool layer.
  - Console v0 (`pnpm console`, port 4317): drift board, intent detail with tick marks, the entry, evidence with its
    three clocks, ripple, event feed, trial balance.
- **Walking skeleton, measured** (`pnpm seed --target=local --reset && pnpm skeleton`, no model key): 11 July credits →
  11 intents → router tier 0 → `propose_entry` → kernel → ledger. 6 clean payments post AUTO (kernel 19 of 19 marks, 0
  model calls) and their intents resolve; Initech, Wayne and the two wire short-pays get their cash applied AUTO and stay
  open for judgment; the parent's payment is rejected by the kernel's party tie and waits for an agent; AR stays tied; a
  second pass does nothing. `pnpm test` → 26 files, **318 passing**; typecheck clean.
- **Deviation from spec §6, proposed:** the console is a zero-dependency Node server plus one HTML page, not Next.js.
  Reason: no build step, no second package, runs wherever the database is. Revisit in Phase 2 if the ripple view needs
  more. **Not checked:** the page in a browser (the API responses and the page script's syntax were checked).
- **Verified live tonight:**
  - *QuickBooks sandbox:* 13 customers, 10 vendors, 1 item and 12 July invoices created; read back INV-1042 = Initech,
    TxnDate 2026-07-01 (backdating works), $12,000; the 12 sum to $172,100.00, equal to the world. A re-run creates
    nothing; after a local reset the records are adopted, not duplicated. This confirms points the code marks
    UNVERIFIED: `DocNumber` is honoured, no `TaxCodeRef` is needed, minorversion 75 is accepted, vendor `AcctNum` takes
    the `fn:` id. **Not exercised:** `--reset` against QuickBooks (delete and deactivate).
  - *Gmail:* seeded, then read back through live ingestion (`pnpm skeleton --live=gmail`);
    `internalDateSource=dateHeader` backdates correctly; the CEO email arrives with `recorded_time` 2026-06-28 and
    resolves to Initech. Two findings. (1) **`messages.insert` replaces a `Message-ID: <fn:...>` header with Gmail's
    own**, so the first idempotency check failed and a second run inserted 16 duplicates. The world id now travels in
    `X-Footnote-Id`, existing mail is recognised by content, and the reader collapses copies (32 in the mailbox → 16
    traces). (2) This token cannot create labels or trash mail (HTTP 403), so the label is optional and reads use the
    seeded domain. **The 16 duplicates are still in the mailbox**; removing them needs `gmail.modify` or a hand delete.
    They do not affect ingestion.
  - *Found while testing:* `--reset` could not delete the database while the console held it open (Windows file lock).
    It now falls back to dropping every table in place.
- **Blocked on a human:**
  - **Slack reads and seeding.** The bot token works, but the 20:53 entry above records that it was given
    `chat:write` and `im:write` only, with no history-reading scopes, on purpose. So `pnpm seed --target=slack` and
    `--live=slack` stop with `missing_scope`, and chat stays on the local store. To turn them on the app needs
    `channels:read`, `channels:history`, `channels:join`, `channels:manage`, `users:read`, `users:read.email` and a
    reinstall: a decision for Atharv and Karan. Separately, `party.owner_user` and `approver.slack_user` still hold
    placeholders such as `U_DANA`; `slackUserMap()` (needs `users:read.email`) is written but not wired, so A's
    escalations cannot reach a real person yet.
  - **Karan:** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are empty in B's `.env`, so no model tier ran here.
  - HubSpot: the token is set, but no HubSpot connector exists yet (CRM is a local store). Not in Phase 1.
- Commands: `pnpm seed --target=<world|local|quickbooks|gmail|slack|all> [--reset]` · `pnpm ingest [--live=gmail,slack]`
  · `pnpm skeleton [--live=gmail]` · `pnpm console`.

### 2026-09-19 — Slack connector/seeder scope expansion

- Supersedes the initial two-scope Slack setup for connector use. Newly implemented `src/connectors/slack.ts` needs channels:read, channels:history, channels:join, channels:manage, users:read, and users:read.email in addition to chat:write/im:write.
- User explicitly approved all six additional scopes and reinstallation terms. Added them to Northwind Finance Ops, reinstalled in Northwind Systems, and saved the installed bot token to ignored `.env`. App-level Socket Mode token unchanged.
- Automatic approval review rejected verification that would read messages/member data; used auth.test scope-only verification instead. No seeding or workspace-content read performed by this task.

### 2026-09-19 ~21:20 ET — Slack seeding and live reads verified; Slack user mapping added (AthM23 + Claude Code session)

- **Supersedes the "Slack reads and seeding" blocker in the 21:05 entry.** AthM23 added the six missing bot scopes
  (`channels:read`, `channels:history`, `channels:join`, `channels:manage`, `users:read`, `users:read.email`) and
  reinstalled the app. This also supersedes the 20:53 entry's "no additional history-reading scopes" and the line in
  `SLACK_SETUP.md` saying the bot cannot read channel history: it now can, in public channels it has joined.
- **Verified live:** `pnpm seed --target=slack` created `#finance`, `#deals`, `#cs-escalations` and posted the world's 5
  messages; a re-run posted nothing (5 skipped). So message `metadata` posted by the bot **does** round-trip through
  `conversations.history`, which the code had marked UNVERIFIED. `pnpm skeleton --live=gmail,slack` from a clean
  database: Slack traces carry the world ids, the **world's** timestamps (Slack cannot backdate; the world time rides
  in the metadata), the speaker and the original text, identical to the local store. Same 11 cases and routes as the
  local run; AR tied. `pnpm test` → 27 files, **322 passing**.
- **Landed:** `src/seed/slackUsers.ts`. Person A's transport DMs `party.owner_user` and finds an approver by
  `approver.slack_user`; both held placeholders (`U_DANA`). They are now rewritten at seed time from `SLACK_USER_MAP`
  (JSON, world person id → real Slack id), then an email match against the workspace, then `SLACK_DEFAULT_USER`.
  `approver.id` stays the world id, because that is the identity the kernel checks. With neither variable set nothing
  changes and the seeder says so.
- **Found:** the workspace has one human member (`U0C3415MFJ6`, "Sam", admin) and nobody's email is `@northwind.test`,
  so the email match maps no one. Applied once to the local database with that user as the default, to test: 13
  account owners and 3 approvers. **Not persisted: `.env` was not edited, so the next `--reset` goes back to
  placeholders.** Known consequence of one person holding every role: A's `approverFor` takes the first approver row
  for a Slack id, which is the CFO ($100,000 limit).
- **Blocked on a human (Atharv or Karan):** decide who plays which role and put it in `.env`, either
  `SLACK_DEFAULT_USER=U0C3415MFJ6` or a `SLACK_USER_MAP`. Until then an escalation has nobody real to reach.
  **Still untested:** a full escalation or approval round trip in Slack (needs A's runtime running and a model key).

### 2026-09-19 21:25 ET — The hand-off worker, earned autonomy per kind of entry, and two real defects it exposed (Person A)

- **Lane C (Preet, fine-tune on the GX10) is agreed.** It is on `main` and Karan confirmed it; nothing in lanes A or B
  waits on it.
- **The worker** (`src/worker/`): one pass over `intent` rows with `status = 'open'` and a `case_json`, oldest first,
  each through the router at the autonomy its kind of entry has earned. This is the seam with lane B: the drift
  monitor writes the intent and the case file, the worker takes it from there. A case file that does not parse, or
  that names another intent, goes to a person with the reason. A run that throws (a model outage) leaves the case
  open for the next pass, three times, then hands it to a person. One failing case never stops the pass. The worker
  also stores the document balances as they stood before anything posted (`docs_snapshot`), which is what lets a
  live case be replayed later.
- **Autonomy is resolved per proposed entry, not per case** (`src/runtime/autonomy.ts`, setting `"earned"`). One case
  applies cash (routine) and then concedes revenue (judgment); they do not share a level. Two rules on top:
  1. **Free inference never posts alone.** Even on a kind that has earned auto, an entry from a model tier that cites
     no approved policy and no active fact is held for review. Only compiled judgment auto-posts.
  2. **The controller agent cannot approve a kind still in shadow** (kernel P2). Two models agreeing is not a track
     record; a person clicks until the kind has one.
- **The ladder was keyed on the wrong thing.** It grouped by the seeder's case label (`short_pay`) while a live entry
  is looked up by its proposal kind (`write_off`), so an earned level would never have been found. It is now keyed on
  the kind the agent proposed, which is also the honest measure: precision, "of the times it proposed this, how often
  had the humans booked the same". Auto needs 95% on at least five **covered** decisions (code, policy or fact);
  twenty agreements by free inference plus one by policy used to read as covered, and no longer do.
- **Defect found by the worker's tests: a policy-driven entry that parked could never be approved.** The approval gate
  re-ran the kernel without the case features, so J1 ("the cited policy's condition holds on this case") failed for
  every such entry. It had never shown because policy-driven entries had always auto-posted. The workpaper now stores
  the features the kernel judged against (`marks_json` is `{stage, marks, features}`), and the approval gate re-tests
  on the same facts. **Lane B: if the console parses `marks_json`, there is one more key.**
- **Defect found by the worker's tests: "cash applied" read as "case resolved".** Tier 0 applies the cash, nobody
  explains the shortfall, and the newest decision on the intent is a posted one. Intent status is now derived in one
  place from what happened (`src/runtime/intentStatus.ts`): resolved only when the newest live decision took effect and
  nothing is parked or unanswered; anything attempted and unsettled waits on a person, with the reasons on record.
  Approvals and answers re-settle the intent, and a replayed historical case is filed as resolved so the worker can
  never pick it up.
- **First corpus cases run against the real system** (`pnpm eval --sut kernel-pack`): 11 of 110 routed cases (G-01 to
  G-08, B-24, F-09, H-1), each a fixture driven through the real `proposeEntry`, `approveDecision`, memory and compile
  code with no model call. 11 of 11 routes correct, 0 false auto-posts. For the learning-layer cases the route is the
  harness's mapping of what the compile step did (a refused draft reads as BLOCK). The other 99 report NOT_RUN.
- `pnpm test` → 27 files, **306 passing**. In progress: audit pack, AP pack, run 1 → learn → run 2.

### 2026-09-19 ~21:35 ET — Second round of judge feedback recorded; direction change proposed (AthM23 + Claude Code session)

- Added [`judge-feedback-v2-2026-09-19.md`](./judge-feedback-v2-2026-09-19.md), relayed by AthM23 from memory, his
  note kept verbatim at the bottom. What the judges said: **do not be generic**; the demo is a story from start to
  finish about a pain point people really face; **two or three finance processes done well** beat all of them done
  thinly (the rest can be a closing line); fake data is fine if it is realistic; take the pain points from
  **Maximor's actual customers** and walk through those in the recording; they **liked the fine-tune** and recommended
  **our own benchmark**, in the spirit of AccountingBench, showing our fine-tuned model against open-source base models.
- **Proposed, not agreed** (sections 5-8 of that file are our reading, not the judges' words): breadth becomes a
  closing line and the five minutes go to 2-3 processes told as one customer-shaped story · the fine-tune plus a named
  benchmark moves from fourth on the cut list to a headline result · candidates for the three: cash application that
  knows when it does not know, the reason that lives in somebody's inbox, an entry you can defend at audit. This does
  **not** reopen "Order-to-cash only" from Tried & rejected: the build stays cross-function on one ledger; what
  changes is what the demo spends its time on. New evidence since that row was written: this feedback.
- Not changed by it: full autonomy, ask once and remember with scope, the kernel, one ledger.
- In progress: `research/customer-pain-points-and-accountingbench.md` (a research agent is writing it; unreviewed).
- Also this session: `SLACK_DEFAULT_USER` set in B's `.env`, which clears the "who plays which role" blocker from the
  21:20 entry for a one-person workspace (every role is `U0C3415MFJ6`); `atharv-branch` pushed to `origin`. `main` has
  four commits that are not merged into `atharv-branch` yet (`fdc01c1`, `575be9e`, `3a962ef`, `3356c85`).
- **Blocked on humans (both):** choose the two or three processes and the customer the story is about; decide whether
  Lane C's harness is the benchmark or feeds it; re-order the roadmap's cut list accordingly.

### 2026-09-19 ~21:35 ET — `atharv-branch` merged into `main`; Phase 1 lifecycle re-run on the merged code (AthM23 + Claude Code session)

- **Supersedes** the last line of the entry above ("`main` has four commits that are not merged"): it was five by merge
  time (`fdc01c1`, `575be9e`, `3a962ef`, `3356c85`, `1e752cd`), and lane B's Phase 1 is now on `main`. Merge commit on
  `main`, first parent `1e752cd`, second `9d5ac32`. The "At a glance" rows for phase and repo state still said
  "pre-build" and "empty"; they now say what is on `main`.
- Textual conflicts, two, both resolved as a **union**: `package.json` scripts (A's `demo`, `inbox` + B's `seed`,
  `skeleton`, `console`, `ingest`) and this file's Log (both sides had only appended; entries interleaved by their
  stated times, nothing dropped from either side). `.env.example` merged by itself. `src/contract/` untouched.
- **One semantic conflict the text merge did not show.** A's `src/runtime/intentStatus.ts` (21:25 entry) settles an
  intent that was attempted and not resolved as `waiting_on_human`; B's skeleton test expected `open` for Initech, Wayne
  and the parent's payment, so 2 of 365 tests failed after the merge. **A's semantics were kept** (it is A's recorded fix
  for "cash applied read as case resolved"). Changed on B's side only: the two expectations in
  `src/skeleton/__tests__/skeleton.test.ts`, which now also assert the record behind the status (a `router:unsettled`
  decision for the short-pays; the kernel's `reject` workpaper and nothing posted for the parent's payment), one message
  in `src/skeleton/run.ts`, one comment in `src/drift/monitor.ts`. B's `closeSettledIntents` only touches `open` intents,
  so it never overrides A's status.
- **Measured on the merged tree**, local stores, no model key, no live source, no external write:
  - `pnpm typecheck` clean. `pnpm test` → 32 files, **365 passing**.
  - `pnpm seed --target=world` regenerates `world/northwind.json` identical to the committed file.
  - `pnpm seed --target=local --reset && pnpm skeleton`: 11 July credits → 11 intents; 6 clean payments AUTO at tier 0
    and `resolved`; Initech ($1,200), Wayne ($3,300) and the two wire short-pays ($35, $25) get their cash applied AUTO
    and are `waiting_on_human`; the parent's $15,000 is rejected by the kernel and is the one unmatched bank line; AR GL
    = subledger. A second `pnpm skeleton` works 0 cases; a second `pnpm ingest` commits 0 rows and opens 0 intents.
  - Console against that database: `/api/state` and `/api/intent` answer; A's new `marks_json` shape
    (`{stage, marks, features}`, 20 marks now that J4 exists) reads correctly; `waiting_on_human` is counted as open.
    **Still not checked:** the page in a browser.
  - `pnpm eval --sut kernel-pack`: 11 of 110 ran, 11 routes correct, 0 false auto-posts (same as A's entry).
  - **The A↔B seam, first time run:** fresh database, `pnpm ingest` (B: ingestion + drift, 11 intents), then A's
    `runOpenIntents` with no investigators. 11 worked, 0 skipped, 0 errors; second pass works 0; books tied.
- **Two findings from that, recorded, not fixed (Phase 2, needs A and B):**
  1. The worker defaults to `earned` autonomy and B's seed writes no `autonomy` rows, so on a fresh database every kind
     is in shadow: all 10 exact-match cash applications **park as PROPOSE** (`pnpm inbox <db> list` shows 10 pending
     approvals) and nothing posts. The skeleton posts them only because it passes a fixed `auto`. Whether exact-match
     cash application should have to earn auto, and what populates the ladder before run 1 (B's Q2 seed has decision
     points for wire-fee write-offs only), is undecided.
  2. After a key-less skeleton run, 5 intents are `waiting_on_human` but the inbox lists 0 escalations and 0 approvals:
     the reason is on the record (`router:unsettled`) and nothing surfaces it to a person. They are also no longer
     `open`, so a later pass with a model key will not pick them up; today that needs `pnpm seed --target=local --reset`.
- **Not run:** any model tier, `pnpm demo` (needs `ANTHROPIC_API_KEY`, empty here), live QuickBooks, Gmail or Slack, and
  Lane C's `ft/` Python (no test covers it; merged as it was on `main`).
- **While this was being validated, `main` moved** (`5fde82a`, `c930480`: Lane C benchmark rows, Python only, plus a
  `__pycache__/` ignore rule), so the first push was refused. Merged rather than forced; one conflict, `.gitignore`,
  resolved as a union (B's `data/` and answer-key rules + C's `__pycache__/`). Re-measured after it: typecheck clean,
  365 passing, seed → skeleton → second pass unchanged. `ft/benchmark.py` and its F1 numbers were not run or checked here.

### 2026-09-19 21:45 ET — Run 1 → learn → run 2 works end to end; audit pack and AP pack landed; one approval-gate hole closed (Person A)

- **The same month twice, only memory changed** (`src/learn/harvest.ts`, `carry.ts`, `scoreboard.ts`, test
  `src/learn/__tests__/cycle.test.ts`). Six customers short-pay a wire by a bank fee; nothing on file explains it.
  - Run 1, cold: a model tier settles all six (24 model calls), nothing auto-posts, a person clicks 12 approvals.
  - Learn: six decision points are cut from what the **person** approved (entries the agents posted alone, or the
    controller agent approved, are never learned from: that would be the system agreeing with itself). Compile drafts
    one rule, backtest 6 of 6, a person approves it. Ladder: `apply_payment` earns auto (six covered agreements);
    `write_off` earns **review only**, because all six agreements were free inference by a model.
  - Run 2, from a cold copy of the same month plus only the carried memory (approved policies, active facts with
    their sources, the ladder): **0 model calls, $0, 12 of 12 decisions settled by code**, cash auto-posts, the six
    write-offs park for review. Once a person approves the rule's own entries, `write_off` earns auto, and run 3
    auto-posts 12 of 12 with zero approvals and the AR control account tied at zero.
  - The ladder now reads two kinds of evidence: replay of closed periods, and a person approving or rejecting what
    the agent proposed in the live month. Replays of points cut from the live month are left out (double counting).
- **Commands** (all code-only unless told otherwise, so they cost nothing): `pnpm demo:seed <db>`,
  `pnpm worker <db> [--code-only] [--review]` (keeps `<db>.cold` before its first pass), `pnpm inbox <db> list |
  approve | reject | answer | approve-policy | reopen`, `pnpm learn <db> [--replay] [--approve-as U]`,
  `pnpm rerun <db> [--models]` (prints run 1 against run 2), `pnpm auditpack <db> <period> [seed] [size]`.
- **Audit pack** (`src/audit/`, 31 tests, code only): a seeded, reproducible, risk-weighted sample (always tests
  material entries, entries with judgment marks, agent-approved entries, and model-tier auto-posts); independent
  re-performance of each sampled entry through the kernel as of its posting, plus ledger tie-out, evidence integrity
  (hash and quoted spans) and the approval on file; six control tests (duplicate vendors, round-number payments,
  entries after period lock, self-approval, just-under-the-line and split adjustments, agent-approved share); and the
  independence fence in the tool layer (the auditor cannot read preparer memory and cannot write).
  Editing one character of a quoted email after posting raises `evidence_invalidated`.
- **AP pack** (`src/agents/ap/`, 26 tests): three-way match as kernel mark E4 (partial receipts, split deliveries,
  tolerance, wrong vendor's PO, malformed lines fail closed), duplicate **obligation** as P7 (vendor + service period
  + amount + PO, so a re-numbered invoice is caught), a code tier that approves what ties and holds what does not,
  and an AP prompt. Limits: every expense lands in 6990, no PO consumption across bills, no freight, tax or FX.
- **Packs are now a registry** (`src/packs/`): the function on the case file picks the code tier, the case features,
  the prompt and the kernel's extra checks. A function with no pack is never worked on another function's prompt; it
  goes to a person.
- **Hole closed (corpus H-1), found by the AP build:** pack checks ran when an entry was proposed but not when a
  person approved it, so a bill parked for approval could be approved after a duplicate of it had been taken on.
  Pack checks now come from the configuration (`APP_CONFIG`) and are rebuilt from the database at **every** gate.
  For AP their absence fails the entry (mark X2): a forgotten configuration must never read as a pass.
- **Kernel:** any mark with status `judgment`, the kernel's own or a pack's, now forces approval. Before, only J3
  did, so a bill with no purchase order auto-posted.
- Notes for lane B from the audit build: `period.locked_at` should be set whenever `status = 'locked'`; trace
  `content_hash` must be the sha256 of `payload_json` or every entry citing it reads as tampered in the audit pack.
- `pnpm test` → 38 files, **373 passing**; typecheck clean. Not yet reviewed by the independent reviewer.

### 2026-09-19 ~21:50 ET — Lane B merge pushed to `main` on top of A's Phase 2; one more seam moved (AthM23 + Claude Code session)

- `main` moved three times while the ~21:35 merge was being validated (`c930480` and `d76b963` from Lane C, then A's
  Phase 2, `2afe6ac`), so each push was refused and each was merged, never forced. Conflicts: `package.json` scripts and
  this Log again (unions; 26 entries checked present, none duplicated), and `judge-feedback-v2-2026-09-19.md`, added on
  both sides with identical text and different line endings (LF copy kept).
- **Seam that moved:** Phase 2's `runCase` now always writes a `router:unsettled` decision when no tier reaches a route
  (before, only when the intent was not already waiting). The skeleton test written at ~21:35 asserted 0 of them for the
  parent's rejected payment; it now asserts 1. No other lane B code changed. **Numbers in the ~21:35 entry (365 tests, 20
  marks) were measured before Phase 2 and are superseded by this entry.**
- **Re-measured on the pushed tree**, local stores, no model key: typecheck clean; `pnpm test` → 43 files, **432
  passing**; world regenerates identical; seed → skeleton gives the same 11 cases as the ~21:35 entry (6 `resolved`, 5
  `waiting_on_human`, 1 unmatched bank line, AR tied); second skeleton pass 0 cases; re-ingest 0 rows; `pnpm eval --sut
  kernel-pack` 0 false auto-posts. **Not re-run on Phase 2:** the console API check and the ingest → worker hand-off from
  the ~21:35 entry, and none of Phase 2's own commands (`worker`, `learn`, `rerun`, `auditpack`, `demo:seed`) beyond
  their unit tests. The two findings in the ~21:35 entry were not re-checked against Phase 2 and may be answered by it.

### 2026-09-19 ~23:15 ET — Phase 2, Person B: the spine runs across AR → revenue → forecast → close on one ledger; two independent reviews, 22 findings fixed (AthM23 + Claude Code session)

- **Landed (all of B's Phase 2 column).** Conventions and event payloads: [`src/engines/README.md`](../src/engines/README.md).
  `src/contract/` and every Person A directory were **not edited**. New lane-B tables are in `src/ledger/schema-b.sql`
  (`rev_schedule`, `rev_schedule_line`, `rev_recognition`, `contract_modification`, `forecast_version`, `mirror_log`, `ripple`).
  - *Revenue schedule engine* (`src/engines/revenue/`): ratable in integer cents by cumulative floor differencing, so
    lines sum exactly to contract value (a reviewer's 20,000-case fuzz held). On `ar.credit_memo.posted`: prospective
    revision, `rev.schedule.revised`, month-end `rev_recognition` through `proposeEntry`, deferred-revenue tie-out.
    **Double-hit guard:** a memo that debited 4000/4900 already cut that month's revenue, so that month's line never
    moves too; one decision can revise a schedule once (`cause_decision_id` UNIQUE).
  - *13-week forecast* (`src/engines/forecast/`): direct method, one new version per change (`<date>/v<n>`), opening
    cash asserted equal to GL 1000, scheduled billing priced from the active revenue schedule, recurring AP projected
    from history, `forecast.updated` with a per-week diff and `beyond_horizon {monthly_delta_cents, through}`.
    **Payroll is not modelled** (the world has none) and the summary says so.
  - *Close conductor* (`src/close/`): an 11-item `checklist_item` DAG for the open period. An item is done when its
    condition holds in the ledger; events only trigger re-evaluation, and a done item can go back. It never locks.
  - *Drift comparator C1* (`src/drift/crmVsSchedule.ts`): CRM deal value vs the active schedule. Opens a revenue intent
    (no `case_json`, so A's worker ignores it) and resolves it, with one `drift.explained`, once an **active** fact in
    force on the world's date explains the difference.
  - *QuickBooks mirror* (`src/mirror/`, `pnpm mirror [--live]`): Payment, CreditMemo, the zero-amount Payment that
    applies it, workpaper and source email as attachments; everything else is logged `skipped` (JournalEntry is Phase 3).
    Dry run by default. Identity in QuickBooks is the natural key (PaymentRefNum, `CM-<invoice>[-n]` + customer), so a
    local `--reset` adopts what is there instead of duplicating it.
  - *Console v0* (still the zero-dependency server): drift board incl. C1, close checklist, forecast board, and the
    intent ripple view (lanes AR → Revenue → Forecast → Close → Drift → QuickBooks, v1/v2 schedule table, weekly forecast
    delta, F/E/P/J workpaper with the quote highlighted). Opens directly at `#intent=<id>`. Never 500s on an empty db.
  - *Spine runner* (`pnpm spine [--approve-as U] [--recognise [--recognise-as U]] [--qbo-live]`, `src/spine/`): the
    walking skeleton, then every subscriber drains the bus until a full round does nothing. Idempotent: re-running
    continues from wherever a person's approval left it. `src/engines/ripple.ts` records what each intent changed per
    function with the amounts.
- **Measured** (local stores, no model key, no external write): `pnpm typecheck` clean; `pnpm test` → 58 files, **584
  passing** (was 43 / 432). From a clean database, `pnpm seed --target=local --reset && pnpm spine --approve-as U_CTRL
  --recognise --recognise-as U_CFO`: 11 cases; Initech's $1,200 credit memo is Dr 2400 / Cr 1200, approved by U_CTRL;
  schedule v2 = 12 × $10,800 = $129,600 exactly; July Initech revenue $10,800 (not $12,000, not $9,600) and its deferred
  revenue 0; forecast v2 −$2,400 in the horizon and −$1,200 a month through 2027-06-30; "AR concessions reviewed",
  "Revenue schedules revised" and "Revenue recognised per schedule" tick; CRM $144,000 vs schedule $129,600 is open
  until the fact is approved, then explained with nobody asked; AR tied, deferred revenue tied, trial balance foots; a
  second run works 0 cases and changes nothing. The period is correctly **not** ready to lock: BTX-0072 ($15,000, parent
  pays for subsidiary) is unapplied, 4 cases wait on a person, accruals are Phase 3. The console was checked in headless
  Chrome (main page and the INV-1042 ripple), **superseding the two earlier "not checked in a browser" notes**.
- **The Initech investigation in those runs is a scripted stand-in** (`src/spine/scripted.ts`), used only when
  `ANTHROPIC_API_KEY` is unset (it is empty on this machine). It acts only through A's tools, so search, the kernel's
  quote check, materiality and the approval gate apply, but it knows the answer. **Not run: the spine with a real model
  tier.**
- **Two independent adversarial reviews (read-only, each finding reproduced with a probe) found 22 defects in the first
  version, 6 of them wrong-money or duplicate-write paths. All 22 are fixed; 20 have a regression test (the two without are wording in the AR ripple summary and a tighter guard in the scripted stand-in).** The worst:
  a repeated concession compounded ($10,800 → $9,720; the percentage is now applied to the version-1 line) · a
  recognition parked at $12,000 before the schedule moved could still be approved (now withdrawn by the revision, and
  the spine refuses to approve an amount the active schedule no longer says) · a memo arriving after its month had
  posted left deferred revenue at −$1,200 with the tie-out green (now red, plus a true-up intent for a person) ·
  future months could be recognised against this month's billing · the close item read done on the wrong amount · after
  a local reset the mirror would have created a second Payment and CreditMemo in QuickBooks · a POST was retried after
  a 5xx (creates now carry a deterministic `requestid`; a POST without one is never retried) · `--approve-as` activated
  every candidate fact in the database (now only the fact the approved memo rests on). Say this in the limitations
  section, as with A's review: the happy path was green before any of these were found.
- **Findings for Karan (Person A's lane; not changed here):**
  1. **`approveDecision` does not treat an earlier `rejected` approval as final.** A decision that was declined can be
     approved later by id and posts. Reproduced in `src/engines/revenue/__tests__/regressions.test.ts` ("a recognition
     parked at the old amount…"): the withdrawn $12,000 recognition still posts, July revenue becomes $22,800 and
     deferred revenue −$12,000. Lane B makes it loud (tie-out red, close item not done) but cannot prevent it. Two lines
     in `src/runtime/approve.ts` would. Not fixed on `main` as of `c205715`.
  2. A `rev_recognition` at or above $500 always parks (materiality applies to the whole amount), so month-end
     recognition is one click per contract, and **Initech's $10,800 is above the controller's $10,000 limit, so it
     needs the CFO**; a wrong approver is a terminal BLOCK. Decide whether recognition off an approved schedule should
     count as adjustment 0 like an exact cash match. A revenue pack check at the post gate ("amount equals the active
     schedule line and does not exceed deferred") would also close finding 1 for this kind.
  3. To give agents the new reads, spread `REVENUE_TOOL_SPECS`, `FORECAST_TOOL_SPECS` and `CLOSE_TOOL_SPECS` into
     `READ_TOOL_SPECS` (`rev.schedule`, `forecast.get`, `close.checklist`). B did not edit `src/agents/`.
  4. Lane B writes `artifact` rows for schedule versions, forecast versions, checklist ticks and QuickBooks objects
     (through `recordRipple`), and the revenue engine records its own withdrawal as an `approval` row with
     `approver_kind = 'controller_agent'`, `approver_id = 'engine:revenue'`, because the contract has no third kind.
- **UNVERIFIED, QuickBooks mirror live.** No create, upload or delete was sent to the sandbox in this session, on
  purpose: creating the Initech CreditMemo now would make the demo's live run *adopt* it rather than show it appear,
  and `--reset` against QuickBooks is still unexercised. Verified read-only: INV-1042 is Invoice 150, Initech is
  Customer 64, the item is 19; QuickBooks' own credit applications are TotalAmt-0 Payments with two linked lines, which
  is the shape the mirror sends; PaymentRefNum and DocNumber filters work. **Not verified:** the `/upload` part names
  and response, `requestid` replay, the sandbox's `AutoApplyCredit: true` applying the memo by itself (the mirror looks
  for that and adopts it), and omitting `DepositToAccountRef`. First live run: `pnpm seed --target=quickbooks`, then
  `pnpm mirror --live --verbose` on a database where the spine has run; expect up to 10 Payments, 1 CreditMemo, 1
  application and 2 attachments. **Blocked on a human (Atharv): when to spend that first live run.**
- Not built (not in B's Phase 2 column, noted so nobody assumes it): billing lowering future invoices, flux note,
  accruals, bank rec pack, JournalEntry mirror, a long-running process (everything here is one pass per command).
- This working tree also holds another session's uncommitted research (`context/research/storytelling/`, a sponsor PDF,
  and the two entries above this one). They were left uncommitted and untouched by this commit.
