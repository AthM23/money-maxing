# Test Results

Scoreboard for the edge-case corpus. Update this as cases move from `todo` to
`passing`. Per-case status lives in [`cases.csv`](./cases.csv); this file is the
summary and the history.

**Nothing has been run yet — no system exists to run it against.** All 115 cases
are `todo`.

---

## Headline numbers

The five from the corpus's rubric (section J). These are what go on the slide.

| Metric | Target | Current |
|---|---|---|
| Auto-clear rate | 70–85% (higher invites suspicion) | — |
| **Auto-clear precision** | **100% — the number that must not move** | — |
| **False auto-posts** | **0 — eval exits non-zero on any** | — |
| Exception recall | 100% | — |
| Cost per 1,000 transactions | beat the rules-disabled baseline | — |

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
| Minimum fixture (22) | 0 | 0 | 0 | 22 |
| All cases (115) | 0 | 0 | 0 | 115 |

By tier:

| Tier | Total | Passing |
|---|---|---|
| T1 | — | 0 |
| T2 | — | 0 |
| T3 | — | 0 |

---

## Known failures

Cases we have run and do not pass, with why. An empty table means nothing has been
run — it does not mean everything passes.

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
| — | — | — | — | — | — | — |
