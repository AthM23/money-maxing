# Test Results

Scoreboard for the edge-case corpus. Update this as cases move from `todo` to
`passing`. Per-case status lives in [`cases.csv`](./cases.csv); this file is the
summary and the history.

**19 September 2026 audit:** the runtime corpus adapter runs **11 of 110 routed cases**;
all 11 match their expected routes, with **0 false auto-posts**. The remaining 99 routed cases are
`NOT_RUN`; the other five corpus rows describe engineering invariants. This is limited fixture
coverage, not evidence that the entire corpus passes.

Separately: **488 TypeScript tests across 50 files**, clean typecheck, and **4 Python scoring tests**.
A fresh eleven-receipt seeded run resolves six cases with zero model calls; ten posted entries
re-perform cleanly. After approving the learned policy in the isolated fixture, two write-offs park
for review rather than silently posting. The fourteen-invoice remittance rehearsal applies $13,505
and leaves the stated $495 dispute open. See [the audit](../context/AUDIT_2026-09-19.md).

---

## Headline numbers

The five from the corpus's rubric (section J). These are what go on the slide.

| Metric | Target | Current |
|---|---|---|
| Auto-clear rate | 70–85% (whole-corpus target) | 1/11 (9.1%, executed safety subset only) |
| **Auto-clear precision** | **100% — the number that must not move** | 1/1 (one observed auto) |
| **False auto-posts** | **0 — eval exits non-zero on any** | 0 among 11 executed |
| Exception recall | 100% | 10/10 executed exceptions |
| Cost per 1,000 transactions | beat the rules-disabled baseline | $0 for these code-only fixtures; model baseline unmeasured |

Baseline comparison (deterministic tier disabled, everything through the model):

| | Auto-clear rate | Precision | Cost / 1k |
|---|---|---|---|
| Tiered | — | — | — |
| Model-only baseline | — | — | — |

If the tiered architecture doesn't beat the baseline, say so. A finding that
contradicts the design is still a finding; a diagram that was never tested isn't.

---

## Coverage

| | Seeded | Passing | Failing | Todo |
|---|---|---|---|---|
| All routed cases (110) | 11 | 11 | 0 | 99 |
| Engineering invariant rows (5) | — | not scored by route | — | — |

By tier:

| Tier | Total | Passing |
|---|---|---|
| T1 | — | 1 |
| T2 | — | 4 |
| T3 | — | 6 |

---

## Known failures

Cases we have run and do not pass, with why. No failing routed case was observed in the executed subset; the unexecuted cases remain unknown.

| Case | Expected route | Actual route | Why it fails | Fixing? |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Deliberately out of scope

Cases we are choosing not to make pass, so a reader doesn't mistake them for
regressions. Full reasoning in [`README.md`](./README.md#scope-gaps--read-before-planning).

| Cases | Reason |
|---|---|
| `E-01`…`E-10`, `H-5` | Multi-entity and treasury — out of spec scope |
| `A-08`, `B-19`, `E-10`, `F-08` | FX — out of spec scope |
| `B-12` | Tax — out of spec scope |
| `C-07` | Wrong legal entity — multi-entity |
| `A-07`, `H-2` | Stripe payout — **undecided**, see README. In the corpus's minimum fixture. |
| `H-6` | Intercompany framing — **restageable** on `A-24` and probably should be |

---

## Run log

Append a row per meaningful run. Keep the unflattering ones.

| When | Commit | What changed | Auto-clear | Precision | False auto-posts | Notes |
|---|---|---|---|---|---|---|
| 2026-09-19 | d602757 + audit changes | kernel-pack | 1/11 | 1/1 | 0 | 99 routed cases not run; no model baseline |
