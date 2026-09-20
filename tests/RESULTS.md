# Test Results

Scoreboard for the edge-case corpus. Update this as cases move from `todo` to
`passing`. Per-case status lives in [`cases.csv`](./cases.csv); this file is the
summary and the history.

**20 September 2026, 04:22 EDT:** the runtime corpus adapter runs **20 of 110 routed cases** (`pnpm eval --sut
kernel-pack`). 16 routes match the corpus; 4 differ, and all 4 are more conservative than the corpus asks (A-14
refused where AUTO was expected, B-01 and B-02 escalated where PROPOSE was expected, B-13 refused where BLOCK was
expected). **0 false auto-posts**, and 0 AUTO results whose posted journal went unchecked against the answer key.
The remaining 90 routed cases are `NOT_RUN`; the other five corpus rows describe engineering invariants. This is
limited fixture coverage, not evidence that the entire corpus passes.

Separately: **752 TypeScript tests across 88 files**, clean typecheck, and **4 Python scoring tests**. The demo
month (`scripts/demo-build.sh`) posts 14 entries from code with zero model calls, parks 1, re-performs 324 of 324
tick marks, and the auditor's pack re-performs the posted entries clean; one real model pass (Haiku, $0.10) settles
the month's one judgment case as a dispute hold for a person to decide. Earlier history is in
[the 19 September audit](../context/AUDIT_2026-09-19.md).

---

## Headline numbers

The five from the corpus's rubric (section J). These are what go on the slide.

| Metric | Target | Current |
|---|---|---|
| Auto-clear rate | 70–85% (whole-corpus target) | 1/20 (5.0%, executed safety subset only) |
| **Auto-clear precision** | **100% — the number that must not move** | 1/1 (one observed auto) |
| **False auto-posts** | **0 — eval exits non-zero on any** | 0 among 20 executed |
| Exception recall | 100% | 18/18 executed exceptions |
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
