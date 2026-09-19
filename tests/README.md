# tests/

The bar the system has to clear. Seeded from a corpus of Office-of-the-CFO edge
cases — the hard tail, where naive matchers quietly get things wrong.

| File | What it is |
|---|---|
| [`edge-cases/office-of-the-cfo.md`](./edge-cases/office-of-the-cfo.md) | The corpus. Prose, verbatim. **Ground truth lives here** — the correct behaviour and expected route for every case. |
| [`cases.csv`](./cases.csv) | The same cases, machine-readable, mapped onto our function packs. Load this in the harness. |
| [`RESULTS.md`](./RESULTS.md) | Scoreboard. Update as cases start passing. |

115 cases: 109 numbered rows (`A-01`…`G-12`) plus 6 scripted demo scenarios
(`H-1`…`H-6`).

---

## The central idea

**Score the route, not the match.** A system that matches 99% of transactions and
can't tell you which 1% is wrong is worse than one that matches 85% and partitions
the rest correctly.

| Route | Meaning |
|---|---|
| `AUTO` | Cleared unattended. No human sees it. A wrong `AUTO` is the cardinal sin. |
| `PROPOSE` | High confidence, human clicks approve. Evidence attached. |
| `ESCALATE` | System does the investigation, hands over the decision, names what it doesn't know. |
| `REFUSE` | Declines to propose anything. "Here is everywhere I looked. You decide." |
| `BLOCK` | Prevents the action **even when a human approves it**. Persisted with the rule that caused it. |
| `INVARIANT` | Not a routed case — an engineering property that must hold everywhere (e.g. integer minor units). |

Difficulty: `T1` a decent matcher handles it · `T2` separates good from average ·
`T3` boss level, most systems fail.

---

## `cases.csv` columns

| Column | Notes |
|---|---|
| `id` | `A-01` … `G-12`, plus `H-1`…`H-6` for the scripted demo scenarios |
| `section` | corpus section: bank-rec, ap, revenue, close, intercompany, platform, control, boss |
| `expected_route` | the route above — **this is what we score** |
| `route_qualifier` | the condition attached to the route, where the corpus states one (e.g. `AUTO` *if immaterial*) |
| `tier` | T1 / T2 / T3 |
| `pack` | which of our function packs owns it (see below) |
| `min_fixture` | `yes` = part of the corpus's minimum viable fixture. **Seed these first.** |
| `in_spec_scope` | `no` = the case falls in the spec's declared out-of-scope area. See the gap list below. |
| `status` | `todo` → `seeded` → `passing` / `failing`. All `todo` right now. |

`pack` values are the function packs from `context/PROJECT_SPEC.md`: `ar`, `ap`,
`bank-rec`, `revenue`, `close`, `forecast`, `reporting`, `audit`, `equity` —
plus `platform` (ingestion and infrastructure) and `kernel` (the deterministic
checker and the learning loop), which are the shared layer rather than any one
pack.

Note that `pack` and `section` deliberately disagree in places. The corpus files a
duplicate *payment* under bank reconciliation (A-13); we own it in the AP pack.
The `pack` column is our routing, `section` is the corpus's.

---

## Case counts

| Pack | Cases | In min fixture |
|---|---|---|
| `ap` | 29 | 6 |
| `kernel` | 16 | 2 |
| `bank-rec` | 16 | 10 |
| `platform` | 14 | 1 |
| `close` | 13 | 2 |
| `ar` | 9 | 1 |
| `revenue` | 8 | 0 |
| `forecast` | 7 | 0 |
| `reporting` | 2 | 0 |
| `audit` | 1 | 0 |
| **Total** | **115** | **22** |

The minimum fixture is 20 rows in the corpus but 22 case IDs — two of its rows are
pairs (`B-01`+`B-02`, `D-01`+`D-02`).

By route: `ESCALATE` 39 · `PROPOSE` 26 · `AUTO` 18 · `BLOCK` 15 · `REFUSE` 12 ·
`INVARIANT` 5.

Two things worth reading off that distribution:

- **Only 18 of 115 cases are auto-clearable.** A system tuned to maximise
  auto-clear rate fails this suite by construction. The corpus is a test of
  partitioning, not of throughput.
- **`revenue` and `forecast` have zero minimum-fixture coverage**, and `audit` has
  one case total — while the demo spine runs through exactly those packs. The
  corpus is bank-rec and AP heavy because that's where the public failure modes
  are documented. If the pitch leans on revenue, that fixture has to come from
  the spec's own planted cases, not from here.

---

## Scope gaps — read before planning

19 cases sit in areas the spec explicitly rules out ("tax, FX, multi-entity,
Stripe, voice"). They're marked `in_spec_scope=no` and kept rather than deleted,
because two are load-bearing:

- **A-07 / H-2, the Stripe processor payout.** It's in the corpus's minimum viable
  fixture *and* a scripted demo moment — but Stripe is out of scope in the spec.
  It doesn't need the real Stripe API: a payout file with gross / fee / net
  columns is enough to make the case land. Either bring that shape in or accept
  losing a case the corpus calls "domain knowledge nobody else has".
  **Worth an explicit decision.**
- **H-6, evidence that changed underneath you.** Framed as intercompany, but the
  mechanism — version the evidence, invalidate downstream state, re-run — is
  general, and the spec already claims it via as-of traces. Restage it on a
  single-entity case (`A-24`, the amended bank statement) and it's back in scope
  with the demo beat intact.

The other 17 are genuinely out and should stay out for a 24h build: `E-01`…`E-10`
(multi-entity and treasury), `A-08` / `B-19` / `E-10` / `F-08` (FX), `B-12` (tax),
`C-07` (wrong legal entity), `H-5` (multi-entity treasury).

---

## How to use this

1. **Seed the 22 `min_fixture` cases first.** They cover every route and all six
   demo beats. Everything else is depth.
2. **Label ground truth from the corpus**, not from what the system happens to do.
3. **Seed each learnable case twice** — once before the human decides, once after —
   so the escalate → answer → remember loop is demonstrable rather than described.
4. **Score with the rubric in section J** of the corpus. Five numbers: auto-clear
   rate, auto-clear precision, false auto-posts, exception recall, cost per 1,000
   transactions.
5. **The eval must exit non-zero on any false auto-post.** Auto-clear precision is
   the number that must not move.
6. **Run a falsifiable baseline.** A flag that disables the deterministic tier and
   routes everything through the model. If the tiered architecture doesn't beat
   it, we have a diagram rather than a finding.

Log results in [`RESULTS.md`](./RESULTS.md) and anything that changes direction in
[`../context/PROJECT_STATUS.md`](../context/PROJECT_STATUS.md).
