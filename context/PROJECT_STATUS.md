# Project Status — money-maxing

**Source of truth.** Read this before starting work. Append to it after anything
notable. See [`README.md`](./README.md) for the rules.

---

## At a glance

| | |
|---|---|
| **Last updated** | 2026-09-19 ~17:10 ET |
| **Phase** | Pre-build — direction **proposed** (see "Proposed decision" below), waiting for team sign-off |
| **Repo state** | Empty. No code committed yet. |
| **Deadline** | 24h hackathon build |
| **Design brief** | [`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md) |
| **Proposed spec** | [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) |
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
