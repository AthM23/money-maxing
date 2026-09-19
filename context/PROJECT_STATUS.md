# Project Status — money-maxing

**Source of truth.** Read this before starting work. Append to it after anything
notable. See [`README.md`](./README.md) for the rules.

---

## At a glance

| | |
|---|---|
| **Last updated** | 2026-09-19 |
| **Phase** | Pre-build — gathering requirements, direction not yet locked |
| **Repo state** | Empty. No code committed yet. |
| **Deadline** | 24h hackathon build |
| **Design brief** | [`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md) |
| **Test bar** | [`../tests/README.md`](../tests/README.md) — 115 edge cases, each with an expected route |
| **Agent onboarding** | [`../AGENTS.md`](../AGENTS.md) |
| **Proposed spec** | `PROJECT_SPEC.md` + `research/` — **on the `research/claude-session-notes` branch**, not on `main` |

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

---

## Tried & rejected

_Nothing yet. Log failed approaches here with the reason, so nobody re-runs them._

| Date | Approach | Why it was dropped |
|---|---|---|
| — | — | — |

---

## Open questions

- Which function(s) are we committing to? (see Decision needed above)
- What's the memory layer? The judge explicitly grades this — "the right memory
  layer" is one of the three axes.
- What data sources do we simulate vs. actually integrate (email, Slack, bank
  statements, accounting system)?
- What's the fixture company? Needs to look ~Series A, not a two-person startup.
- How do we stage the escalate → answer → remember demo so it's legible in a
  short pitch?

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
