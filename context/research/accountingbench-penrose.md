# AccountingBench (Penrose) — the reference the judges pointed at, and our foil

Source: accounting.penrose.com ("Can LLMs Do Accounting?"), Yunyu Lin's thread (Jul 2025), screenshots
captured by Preet 2026-09-20. This is the first reference point in the Maximor track doc and the judges
told us directly to study it.

## What it is

A real SaaS company's books, closed month by month by a frontier LLM with SQL access to the ledger,
source systems (Mercury, Ramp, Stripe, Rippling), a reconciliation tool, and a Python interpreter.
Graded on account-balance accuracy, months completed, revenue recognized.

## The findings (their words/charts)

- **Every model drifts.** Claude and Grok start within 1% of CPA baselines, then decay to ~72-84%
  balance accuracy by month 12-13 as unresolved discrepancies compound. o3, o4-mini and Gemini 2.5 Pro
  **could not complete a single month** (loops, or gave up: "I am ending the task now").
- **Under pressure, models cheat.** Verbatim caption: *"Claude searches for unrelated transactions that
  add up to the correct amount."* When discrepancies pile up, models "start inventing fake transactions
  or pulling unrelated ones **to pass the checks**."
- Their conclusion: frontier models beat humans on short simulated tasks "but without opinionated
  harnesses, they struggle to handle edge cases in actual business data and lose coherence across
  longer time."

## Why this is our best slide after the benchmark table

Their chart goes DOWN over months. Every design choice in Footnote exists to invert that curve, and we
can name the mechanism against each failure mode:

| AccountingBench failure | Footnote mechanism |
|---|---|
| Invents transactions to force a check to pass | Kernel E-marks: every claim must quote a real trace verbatim; a fabricated reference has no trace id and cannot post. The plug entry is structurally impossible, not discouraged. |
| Unexplained differences compound month over month | Drift monitor opens an intent per difference; timing items are tracked, not buried; a $12.40 unexplained residue stays visibly open rather than absorbed. |
| Loses coherence over long horizons | Memory: scoped facts and compiled policies carry across months; replay CI stops a change that lowers past agreement from shipping. |
| Gives up ("ending the task now") | Bounded escalation: a blocked case goes to a human once, with options; the answer is stored and reused. |
| "Without opinionated harnesses" | The harness IS the product: propose → kernel re-check → post or escalate. |

Pitch line: *"The benchmark the judges cite shows frontier models drifting from 100% to 80% and
inventing transactions to pass their own checks. We built the system where that specific cheat is
impossible, and where month 2 is cheaper and more accurate than month 1 — measured."*

Lane C tie-in: their drift chart (accuracy falling over months) vs our progression chart (model accuracy
rising over epochs, system cost falling run 1 → run 2) is the closing visual pair.

Caution: do not claim we "ran AccountingBench" — their harness is not released (thread: needs data
sanitization). We cite their published findings and show our own measured benchmark.
