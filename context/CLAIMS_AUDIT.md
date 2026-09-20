# Claims audit: what we say, and what backs it

Status: **written by the claims-audit agent, 2026-09-20 00:32 EDT.** Documents read: `README.md`, `context/SCENARIO.md`,
`context/DEMO_STORY.md`, `context/GATE1_ANSWERS_A.md`, `context/DEMO_DOCUMENTS.md`, `ft/INTERFACE.md`. Edited:
`README.md` and `context/DEMO_STORY.md` only. The other four still carry what is listed under "For the lead".

How a claim counts as backed: a named test, an entry in `context/PROJECT_STATUS.md` (cited by its time), or a command
run for this audit with the model keys blanked. Commands run for this audit, all on 20 Sep EDT:

- `pnpm vitest run --reporter=dot` at 00:23: **70 files, 655 tests, all passing**.
- `python3 -m unittest discover -s ft -p 'test_*.py'` at 00:27: 4 tests, OK.
- `pnpm vitest run src/demo/scenario src/learn/__tests__/cycle.test.ts src/agents/__tests__/withholding.test.ts` at
  00:29: all passing.
- `pnpm typecheck` at 00:33: clean, on a working tree other agents were still editing.
- **Not run:** anything paid or live, and `pnpm seed` / `pnpm skeleton` (the seed command resets the shared
  `data/footnote.db` that other people are using). Seeded-world numbers are therefore backed by the log only.

Verdicts: **backed** · **softened** (reworded in the README or the demo story to what is backed) · **removed** ·
**not verifiable** (nothing in the repository settles it; say it only with its source, or not at all).

| # | Claim | Where | Backing | Verdict |
|---|---|---|---|---|
| 1 | `SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150` is compiled from Q2 with no model | README loop 1; SCENARIO; DEMO_STORY 1 | `rehearsal.test.ts` asserts the rule's name; `learn.test.ts` "drafts the bank-charges rule with a ceiling no wider than what the humans did, and shows the outlier" | backed |
| 2 | The rule names the customers it was seen on; an unseen customer cannot inherit it | README loop 1 (added) | `rehearsal.test.ts` (condition holds ardent, fernhill, ostrander); `auditSafety.test.ts` "holds legacy generated policies that lack a customer scope…"; 23:25 entry | backed |
| 3 | Replay of Q2: 0 of 6 before the rule, 5 of 6 after, the sixth triaged as human inconsistency | README table; DEMO_STORY 1 | `learn.test.ts` "without any policy, tier 0 proposes nothing…" and "with the policy approved, tier 0 reproduces 5 of 6…" | backed |
| 4 | Leave-one-out 4 of 5 beside the in-sample backtest | DEMO_STORY 1; README limits | 22:14 entry | backed (log) |
| 5 | Code clears exact matches, one payment for three invoices and small wire shortfalls | README loop 2; SCENARIO receipts 1 to 3 | `rehearsal.test.ts` (receipts 1, 2, 3 resolve with no investigator); `skeleton.test.ts` "a clean payment posts AUTO at tier 0 with no model call…" | backed |
| 6 | Tick marks in four classes; every quote checked character by character | README loop 2 | `formal`, `evidence`, `process`, `judgment` test files; `evidence.test.ts` "rejects on E2 when one character of the quote moves instead" | backed |
| 7 | Agents can change the ledger only through `propose_entry` | README "One write path" | `proposeEntry.test.ts` covers the path; no test can prove no other path exists | not verifiable as an absolute; kept as a design statement |
| 8 | Auto needs 95% agreement on at least five covered decisions | README | `src/learn/autonomy.ts` (`AUTO_RATE` 0.95, `AUTO_MIN_N` 5); `learn.test.ts` "the ladder needs rate, count and coverage together for auto" | backed |
| 9 | Free inference never posts alone; a cited rule must be a rule for that entry | README | `review2.test.ts`, all three tests | backed |
| 10 | Six hard blocks hold even when a person approves | README | `blockRules.test.ts` H1 to H6 and "blocks over an otherwise clean, approved and material entry" | backed |
| 11 | $500 or more needs a person | README; SCENARIO | `MATERIALITY_CENTS = 50_000` in `src/contract/types.ts`; `mainScene.test.ts` (the $550 credit parks) | backed |
| 12 | The controller agent signs only compiled judgment below $500 on a kind with a track record | README limits | 22:14 entry (critical 2, fixed with a regression test) | backed (log) |
| 13 | Kind `fx_realized`, account 7100, check F9, tables `invoice_fx` and `bank_txn_fx` exist | README (added); SCENARIO; GATE1 | `src/kernel/fx.ts`; `schema.sql` lines 47 and 51; `accounts.ts`; `mainScene.test.ts` "realized FX is re-performed, not believed…" | backed |
| 14 | Main scene: code posts 105,800.00 + 40.00 + 1,960.00 and leaves 2,200.00 open, with no model call | README (added); SCENARIO; 00:07 entry | `mainScene.test.ts` "code books the cash, the bank's fee and the rate difference…" | backed |
| 15 | One question covers both Vossberg receipts; the add-on's $550 credit is prepared without asking and parks; another customer gets nothing; replay posts and asks nothing twice; 0 audit findings | README (added); SCENARIO | `mainScene.test.ts` "asked once, answered as a standing 2% with an end date…" | backed |
| 16 | The kernel refuses: whole shortfall as FX, FX in misc expense, advice not cited, FX twice | README (added); SCENARIO | same FX test. The misc-expense case fails **J4**, the others F9 | backed |
| 17 | "(by design) FX on the unpaid EUR 2,000" is refused | SCENARIO | no test of its own; it follows from F9 using the foreign amount received | not verifiable; left out of the README |
| 18 | Realized FX does not park at $500 | README (added); GATE1 | `src/kernel/util.ts` line 72; `mainScene.test.ts` (1,960.00 posts with no person) | backed |
| 19 | Only a realized FX **loss** can be booked | README limits (added); SCENARIO | `fx.ts`: "only a realized loss can be booked this way" | backed |
| 20 | Stand-ins played the model tiers and the reader in both scenario tests | README (added); SCENARIO | `standIns.ts`; both tests pass `standIn` and a stub reader | backed |
| 21 | Global July: all ten resolved after people act, books tied, 0 findings, the edited CEO email is caught | README (added); SCENARIO | `rehearsal.test.ts` | backed |
| 22 | Run 2 from cold: 0 model calls, 0 questions; 1, 2, 3, 4, 8, 9 settle from code; 5, 6, 7 and 10 park | README (added); SCENARIO | `rehearsal.test.ts` | backed |
| 23 | Ten receipts, six customer countries, three entities, four accounts at three banks, all USD | SCENARIO | `plants.ts` (customer countries US, NL, DE, IN, GB, CH) | backed |
| 24 | "Three legal entities, four currencies, eight bank accounts at four banks" | DEMO_STORY company | no world has this; the scenario is row 23 plus one EUR customer | softened |
| 25 | Seeded world: one entity, one currency, one bank account, twelve customers | README limits | `skeleton.test.ts` "has 12 customers plus the Globex parent…"; true of `pnpm seed` only | softened (scenario world described beside it) |
| 26 | Fresh seeded July: 6 of 11 resolved, 10 cash entries, 0 model calls; after approval two write-offs park | README table | 23:25 entry. Not re-run (see top) | backed (log) |
| 27 | "8 of 11, 0 model calls" | DEMO_STORY 2 and "What not to say"; repeated in the 23:39 entry | the 23:25 entry supersedes it: 8 of 11 was under forced autonomy | softened to row 26 |
| 28 | Initech on real models: Haiku, $0.069, two quoted sources, parked | README; DEMO_STORY 3a | 22:02 entry. Paid, not re-run | backed (log) |
| 29 | Wayne on real models: Haiku hands up, Sonnet escalates, $0.21, nothing posted | README; DEMO_STORY 3c | 22:14 entry | backed (log) |
| 30 | Withholding on real models: Haiku, $0.065, tax receivable, parked | README | 22:52 entry | backed (log) |
| 31 | "About $0.07 to $0.25 per judgment case" | README run block | logged per case: $0.065 (withholding, 22:52) up to $0.275 (Wayne's second run, $0.056 + $0.219, 23:02); the 23:02 entry says controller reviews are not metered | softened to "$0.07 to $0.28 … controller reviews not metered" |
| 32 | Withheld tax is a receivable, never a discount; the kernel refuses other bookings | README loop 3; SCENARIO 6 | `withholding.test.ts` "settles to the withholding tax receivable…" and "the kernel refuses every way of booking it as something else" | backed |
| 33 | Booking withheld tax opens a certificate follow-up owned by the account owner | README loop 3 (added) | `withholding.test.ts` "July takes a question; August…" (owner `U_SAM`, `waiting_on_human`); commit `a2dbed7` | backed |
| 34 | Withholding is "not built" | DEMO_STORY 3b | stale: rows 30, 32, 33 | softened (now "built", with what was and was not run on models) |
| 35 | "Next month it books from code" | DEMO_STORY 3b | the test shows no model and no question; an entry over $500 still parks (`rehearsal.test.ts`, run 2) | softened |
| 36 | v2 is drafted, re-backtested, and approving it retires v1 | README loop 4; DEMO_STORY 4 | `cycle.test.ts` "v1 is learned from the month, a bigger fee is approved by a person, v2 widens to it and retires v1"; `rehearsal.test.ts` (v2 ≤ $60.00) | backed |
| 37 | Same month twice: 24 model calls and 6 approvals, then 0 calls with 6 posted and 6 parked, then all 12 post, books tied | README table | `cycle.test.ts`, second and third tests. The 21:35 entry said 12 approvals in run 1; the test now asserts 6 | backed |
| 38 | A fact an agent proposes applies to nothing until a person approves it; inbox `approve-fact` / `reject-fact` | README loop 4 (added); 00:07 entry | `memory.test.ts` "a candidate changes nothing until someone in the approval matrix approves it"; `rehearsal.test.ts`; `src/demo/inbox.ts` | backed |
| 39 | The Slack "Remember this?" message | README loop 4 (added) | code only (`src/agents/slack/blocks.ts`, `transport.ts`); no test names it; never sent live | not verifiable; stated as a limit |
| 40 | Auditor: seeded risk-weighted sample, re-performance as of posting, evidence re-hashed, control tests; no preparer memory, no writes | README loop 5 | `sample.test.ts`, `rerun.test.ts`, `controls.test.ts`, `fence.test.ts` | backed |
| 41 | The auditor tests a cited rule as it stood at posting | README loop 5 (added) | `rerun.test.ts` "re-tests a cited policy on the case features the workpaper stored…"; `rehearsal.test.ts` (0 findings after v2 retires v1) | backed |
| 42 | Auditor pack 12 of 12 clean; one changed character flags that entry | README; DEMO_STORY 5 | 22:02 entry; `rerun.test.ts` "raises evidence_invalidated…". The fresh world after the audit gave 10 of 10 (23:25) | softened (both figures given) |
| 43 | The reader reads; code decides whether to believe it | README loop 2 (added); INTERFACE | `readRemittances.test.ts` (four tests); `provenance.test.ts` (six tests) | backed |
| 44 | `pnpm bench:reader`, n = 200: no reader 0 / 200 left; oracle 168 + 32; saboteur 0 / 200 left; 0 wrong postings | README (added); INTERFACE; 23:39 entry | 23:39 entry; `runs/reader-bench/` has the oracle and saboteur files at n = 200. The no-reader file on disk is n = 100 | backed (log) |
| 45 | No real model has been run through the harness benchmark | README; SCENARIO; INTERFACE | 23:39 and 00:07 entries; no such file in `runs/reader-bench/` | backed |
| 46 | `FT_ENDPOINT_URL` alone switches the reader on; 30 s limit; never throws | INTERFACE | `openaiCompat.ts` line 75; `openaiCompat.test.ts` "never throws…" and "…the environment switches the reader on" | backed |
| 47 | Field F1 0.960, held-out 0.964, base 0.084, n = 120 | INTERFACE | `ft/BENCHMARK.md` "Results v1" only; not in the team log; the 23:25 entry asks for a rerun under the corrected scorer; the GPU is not reachable from here | not verifiable; say only with "lane C's v1 results" |
| 48 | The endpoint is "live now" at a tailnet address | INTERFACE | no network call allowed in this audit; lane A's note says it timed out from this machine | not verifiable |
| 49 | The reader will also read the bank credit advice into currency, amount, rate and fee | GATE1 answer 7 | not built: the harness consumes remittances only (INTERFACE, lane A's section); `bank_txn_fx` rows are seeded | not verifiable; a plan, do not claim |
| 50 | The FX contract is "BUILDING… not on `main` yet" | GATE1 | stale: on `main` since commit `01a79db` (row 13) | not verifiable as written; see "For the lead" |
| 51 | Test suite: 488 tests | README table | this audit's run: 655 in 70 files; 4 Python tests | softened (updated) |
| 52 | The Slack round trip "has not been run live end to end" | README limits; DEMO_STORY 3a, 3c | 23:39 entry: one approval clicked live at 23:09; the question form not answered; one real Slack user | softened (says exactly that) |
| 53 | "Two reviews found six ways an entry could have posted without a person. All six are closed" | README limits | the 23:02 entry states six; the count was not re-derived here. The 23:25 audit fixed more | softened (third audit added) |
| 54 | The ripple "is not built: the event is emitted and nothing consumes it" | README limits; SCENARIO last section | contradicted: `spine.test.ts` "forecast: a new version caused by the intent, Initech's future billing at $10,800…"; 23:15 entry | softened (now says what lane B's spine does and its limits) |
| 55 | Revenue, close and forecast "have no pack" | README limits | true of `src/packs`; `apWiring.test.ts` "a function with no pack … goes to a person". Lane B's engines exist beside it | softened |
| 56 | Lane B spine: schedule v2 $129,600, forecast v2, 7 of 11 checklist items, books tied | README table (added) | lane B's merge entry (labelled ~00:35 ET) and the 23:15 entry; `spine.test.ts` | backed (log) |
| 57 | Corpus: 11 of 110 run, 11 correct, 99 not run | README table | 23:25 entry | backed (log) |
| 58 | A re-sent bill "with a total one dollar different" is caught | DEMO_DOCUMENTS 4 | `obligation.test.ts` tests one **cent** ("…defeated by one cent: the amount is inside E4's own tolerance") | not verifiable as worded; say one cent |
| 59 | The bank-change email is blocked even if a person approves | DEMO_DOCUMENTS 4; DEMO_STORY 6 | `blockRules.test.ts` H5 "blocks a payment to details nobody confirmed out of band" | backed |
| 60 | Kiteworks: 98% straight through, 10 entities, 7 currencies, 66 accounts, 20+ banks, 20 people on cash | DEMO_STORY; SCENARIO; DEMO_DOCUMENTS | `research/maximor-site-deep-read-2026-09-19.md` records them from Maximor's site; not re-fetched | not verifiable here; say "per Maximor's case study" |

## For the lead: what this audit could not fix, because the file was not its to edit

1. **`SCENARIO.md` contradicts itself on FX.** The supporting-cast paragraph ("the ledger has no FX… we must not claim
   it") and the last section ("Not built: FX and multi-currency books") were written before the main scene above them.
   True today: one realized FX loss on a receipt is built; multi-currency books are not. Its last section also lists
   the concession's ripple as not built; lane B's spine does it (row 54).
2. **`GATE1_ANSWERS_A.md`**: the status date reads 2026-09-20 23:56 ET; the commit is 2026-09-19 23:56. Its two
   "BUILDING" sections are now built (row 50). Answer 7 (the reader on the bank advice) is still only a plan (row 49).
3. **`PROJECT_STATUS.md`**: one entry is labelled "2026-09-20 ~00:35 ET" but sits before the 00:07 entry and was
   already there when this audit started at 00:23. The 21:35 entry's "12 approvals" in run 1 no longer matches the
   test (6). The 23:39 entry's "8 of 11" conflicts with the 23:25 entry.
4. **`DEMO_DOCUMENTS.md`** says one dollar where the test says one cent (row 58).
5. **`ft/INTERFACE.md`** headline numbers are lane C's own and not in the team log (row 47).
6. **The name.** The README and every context document say Footnote; `frontend/index.html` says Money Maxer.
