# Demo runbook: the 10:30 run of show

Written 20 Sep 2026, 00:32 EDT. Every code-only command below was run between 00:24 and 00:31 EDT with the keys
blanked, on databases under `runs/demo-runbook/`. Nothing live or paid was run for this document. Northwind and
Vossberg are fictional and the July is simulated: say so in the first ten seconds.

**One rule on stage: if a live step hangs for five seconds, move to Terminal B and keep talking. Never debug live.**

## 1. Pre-flight (finish by 10:15)

| # | Check | How |
|---|---|---|
| 1 | Two terminals in the repo root. **A = live** (keys from `.env`). **B = code-only**, keys blanked | In B: `export ANTHROPIC_API_KEY= OPENAI_API_KEY= FOOTNOTE_READER_URL= FT_ENDPOINT_URL=` (a value set in the shell wins over `.env`: `src/env.ts`) |
| 2 | Fresh stage database | `rm -rf runs/stage` (this also clears the `.cold`, `.run2` and `tamper.db` copies; do not use a `*` glob, zsh stops on one that matches nothing) then `DB=runs/stage/july.db` and `pnpm exec tsx src/demo/scenario/cli.ts $DB` (becomes `pnpm demo:scenario $DB` once the script line is added). Prints `12 open intent(s)`. It refuses an existing file |
| 3 | A second database, seeded and taken through both `pnpm learn` commands and no further, for the ninety-second version and for when seeding fails | Same seed command with `runs/stage/done.db`, then the two commands of beat 0:25 |
| 4 | Console up, in a browser you have looked at | `FOOTNOTE_DB=$DB pnpm console` → http://localhost:4317 (loopback only) |
| 5 | Keys, live path only | `ANTHROPIC_API_KEY` (one key is enough, status 19 Sep 20:52; the controller runs on Claude without `OPENAI_API_KEY`). `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` (`SLACK_SETUP.md`). Leave `FOOTNOTE_READER_URL` unset: that endpoint is tailnet only |
| 6 | Slack people | Personas `U_CFO`, `U_CTRL`, `U_SAM`, `U_DANA`. Map them to different real users if you can. As of the 23:39 status entry all personas map to one real user: if so, do not claim two people signed. See rough edge 3 before relying on `pnpm desk` |
| 7 | `pnpm desk $DB` is started only in A and only when you mean it | It sends real Slack DMs and must stay running to receive clicks |
| 8 | Recordings from section 6 are on the desktop, tested with sound off | |
| 9 | **The model's question is prepared before you go on, never on stage.** Measured on 20 Sep 00:22 to 00:32: `pnpm worker $DB --intent int_main` took **9 min 50 s, 52 model calls, $1.07** and ended in the right place (one question to the account owner, nothing booked). Haiku reached that conclusion in about 50 s but may not ask a person while a stronger tier exists; Sonnet hit its 240 s limit; Opus asked | A, by 10:05, after both `pnpm learn` commands: `pnpm worker $DB --code-only --intent int_main` is NOT run first (the paid pass does the code tier itself). Then `pnpm inbox $DB list` must show one open escalation for vossberg. A prepared database from that measured run is at `runs/real-main/july.db` on Karan's laptop (git-ignored) |

## 2. The five-minute script

`$DB` is the stage database. Commands marked B were verified code-only; A is live and was **not** run for this document.

| Time | Say | Command or click | What appears | If it fails |
|---|---|---|---|---|
| 0:00 | "Finance teams lose their week on the payment that arrives short with the reason in someone's inbox. Northwind is fictional and this July is simulated." | Console open | Twelve receipts, all open | Slide |
| 0:25 | "Before July it replays last quarter with the humans' answers hidden, drafts a rule from what the team booked, and a controller approves it like a pull request. No model in this step." | B: `pnpm learn $DB --replay --approve-as U_CTRL` then `pnpm learn $DB --replay` | `0 agree` → `draft: SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150`, `matched 9, humans did exactly this 8, other account 1`, `leave-one-out … 6 of 8` → `8 agree`, `ar/write_off: 9/9 … → auto` | Recording 1 |
| 1:05 | "Vossberg owes EUR 100,000, booked at 1.10. EUR 98,000 arrives at 1.08 less a $40 bank fee: $105,800. A matcher that sees one number calls the $4,200 a short-pay." | B: `pnpm worker $DB --code-only` | `int_main: AUTO → AUTO → AUTO`; `decisions 15 · reached by code 15 · by a model 0 · posted with no person 14 · parked 1`; `model calls 0 · cost $0.0000` | Recording 1 |
| 1:50 | "Three causes. Code booked the cash, the bank's $40 fee, and $1,960 of rate movement, re-performed from the two rates and the bank's advice. $2,200 is left: the EUR 2,000 the customer held back." | Console → `int_main`, or the query in section 7 | Dr 1000 105,800.00 · Dr 6150 40.00 · Dr 7100 1,960.00 · INV-3201 open 2,200.00 | Query in B |
| 2:30 | "Slack proves the outage. The contract says a credit needs an officer in writing. Nobody gave it, so it asks once, with what it checked." | The question is already waiting (pre-flight 9). Show it: `pnpm inbox $DB list`, or Slack if `pnpm desk $DB` is running. Answer as the CFO, in the Slack form or: `pnpm inbox $DB answer <esc_id> --as U_CFO --treatment credit_memo --uses standing --valid-to 2026-09-30 --pct-off 2 --text "Agreed with their ops director: a 2% SLA credit for the June outage, June to September service. Avery (CFO)."` then `pnpm inbox $DB approve <dec_id> --as U_CTRL` | One question covering both Vossberg receipts; the answer saved with scope and end date; INV-3201 open 0.00 | B: `pnpm exec tsx runs/demo-runbook/standin-pass.ts $DB` then `pnpm inbox $DB list`. **Say "a scripted stand-in plays the model here".** Then recording 2 |
| 3:20 | "A week later the add-on invoice arrives net of the same 2%. Code prepares the $550 credit from the remembered answer and asks nobody. It waits only because it is over $500. Another customer citing the outage gets nothing." | B: `pnpm worker $DB --code-only --intent int_addon`, `pnpm inbox $DB list` (works only after a rate was saved, rough edge 2) | A `credit_memo` for vossberg, 550.00, pending; no new question | `pnpm vitest run src/demo/scenario/__tests__/mainScene.test.ts` (third test asserts it) |
| 4:00 | "The auditor re-performs every posted entry without the preparer's memory. Change one digit of the bank's advice and the entries that cite it fail." | B: `pnpm auditpack $DB 2026-07 stage 50`; `sqlite3 $DB "VACUUM INTO 'runs/stage/tamper.db'"`; `sqlite3 runs/stage/tamper.db "UPDATE trace SET payload_json = replace(payload_json,'1.0800','1.0900') WHERE id='tr_advice_BTX-320'"`; `pnpm auditpack runs/stage/tamper.db 2026-07 tamper 50` | `re-performed clean 14/14 · findings 0` (read the count off the screen; 14 is the code-only state) → `12/14 · findings 5 · kernel_disagrees 2 · evidence_invalidated 3` | Recording 3 |
| 4:35 | "The other ten receipts are a global July: six countries, four accounts, three banks, all in dollars. In the rehearsal, run 2 from cold with only memory carried made 0 model calls and asked 0 questions." One line on AP. Stop. | `pnpm vitest run src/demo/scenario` pre-run and left on screen | All passing (3 files, 7 tests when run at 00:31) | Say it from section 4 |

## 3. The ninety-second version

Set `DB=runs/stage/done.db`: it is already past the learn step, so the worker's first pass still has everything to post.

1. 0:00: the pain sentence, "fictional company, simulated month".
2. 0:15: `pnpm worker $DB --code-only`; read out the three entries and the $2,200 left.
3. 0:45: the Slack question (live or recording 2): asked once, answered as a standing 2% to 30 September; the add-on's $550 prepared without asking, parked over $500.
4. 1:10: audit pack clean, change one digit, two entries fail. Stop.

## 4. Numbers that may be said aloud

| Number | Source |
|---|---|
| EUR 100,000.00 at 1.1000 = $110,000.00; EUR 98,000.00 at 1.0800 less $40.00 = $105,800.00; $4,200 = $1,960 + $40 + $2,200 | `mainScene.test.ts`, "code books the cash, the bank's fee and the rate difference; only what the customer held back is left"; my code-only run, 00:25 |
| One question for both Vossberg receipts; standing 2% to 30 Sep; add-on credit $550 without asking, parked over $500; nothing for another customer; replay posts and asks nothing twice | `mainScene.test.ts`, "asked once, answered as a standing 2% with an end date; …"; status 20 Sep 00:07 |
| Refused: the whole $4,200 as FX, FX in 6990, FX without the advice cited, FX twice on one receipt | `mainScene.test.ts`, "realized FX is re-performed, not believed: …" |
| Twelve receipts: 15 decisions, all by code; 14 posted with nobody involved, 1 parked; 0 model calls, $0; 322 of 322 tick marks re-performed | `pnpm worker --code-only`, my run 00:25 |
| Replay 0 of 9 before the rule, 8 of 9 after; rule matched 9, 8 exact, 1 other account; leave-one-out 6 of 8 | `pnpm learn --replay`, my run 00:25 |
| Auditor 14 of 14 clean, 0 findings; after one changed digit 12 of 14, 5 findings | `pnpm auditpack`, my runs 00:25 and 00:27 (pack file times) |
| Global July: all ten resolved after people act; run 2: 0 model calls, 0 questions; six settle from code, three park over $500, the duplicate parks; `SHORT-PAY-01 v2` at $60 | `rehearsal.test.ts`, "Learns, Runs, the 2%, Improves, run 2, and the auditor" (stand-ins, no model) |
| Fourteen invoices, $13,505 applied, $495 left on INV-3001, 0 model calls | `pnpm demo:remittance`, my run 00:26; status 19 Sep 23:25 |
| One approval clicked in Slack and posted: Initech's $1,200 concession, 23:09 on 19 Sep | Status 19 Sep 23:39 |
| The main scene on real models, once: code posted the cash, $40 and $1,960 in 15 ms; the models found the remittance, the Slack note, order form section 7 and the $500 rule, booked nothing and asked one question; 52 model calls, $1.07, 9 min 50 s | `runs/real-main/worker-int_main.log`, status 20 Sep 00:36 |
| Then, from the terminal on that database: the CFO's standing 2% to 30 Sep, the controller's approval, INV-3201 paid; the add-on a week later: cash, $25 fee and $245 FX posted by code, $550 credit prepared with no question and 0 new model calls, parked over $500 | My run 20 Sep 00:39 on a copy of that database |
| Test count: read it off `pnpm test` on the day | 663 passing on the committed state at 00:35 |

## 5. What not to say

- Multi-currency books, subsidiary translation, FX gains (only a loss can be booked), intercompany entries, month-end remeasurement as an agent function, VAT reverse-charge short-pays: not built.
- Usage-based revenue; the concession rippling into future invoices or the forecast: not built.
- Any base or fine-tuned Qwen number through the harness: no real model has been run through `pnpm bench:reader`. Never "96% accounting accuracy". The fine-tune is a document reader; it makes no judgment calls.
- That the model tiers are fast or cheap on the main scene. One real run exists (20 Sep 00:22): right outcome, 52 model calls, $1.07, 9 min 50 s. Say "the code tier is instant and free; the question took the models about ten minutes and a dollar, once, and the answer is remembered so it is never asked again". The tests and the global July rehearsal use stand-ins for the model tiers: say so.
- Do not approve the fact the model itself proposed on that run (`vossberg · other`): it is the contract's 2% *ceiling* filed as a note. Reject it on stage if you want a beat: `pnpm inbox $DB reject-fact <fact_id> --as U_CTRL`. Code and the kernel refuse to size an entry from a note either way (tested).
- A percentage of any real workload. "Zero model calls" is not "zero approvals". Never "115 passing cases": 20 of 110 routed corpus cases were executed (16 match the corpus, 4 are more conservative than it asks, 0 false auto-posts).
- That a model can post unchecked, that this is a real Kiteworks incident, "unique in the market", or that two people signed if one Slack user played both.
- "Exactly one entry flagged" for the advice change: two entries cite that advice.

## 6. Recordings to capture tonight, in priority order

1. Beats 0:25 to 1:50 in a terminal with the console beside it (offline-safe; the core).
2. The Slack question, the CFO's form with rate and end date, the approval click, then the add-on's $550 prepared without asking.
3. The audit pack clean, then the changed digit.
4. `pnpm vitest run src/demo/scenario` passing.
5. `pnpm rerun $DB` after a run 1 that included the judgment leg.
6. `pnpm demo:remittance`.
7. The console in a real browser: status entries record HTTP checks only.

## 7. Rough edges hit while verifying

1. **The second `pnpm learn $DB --replay` is not optional.** Skip it and write-offs have not earned auto, so the $40 fee parks: `resolved 2 · waiting on a person 4 · posted with no person 11 · parked 4` instead of `resolved 3 · … 1 · … 14 · parked 1`.
2. **Fixed 00:40:** `pnpm inbox … answer` now takes `--pct-off` and `--pct-withheld`; verified on the real run's database (answer, approve, INV-3201 paid, then the add-on's $550 credit prepared by code with no question). What follows describes the state before the fix. `pnpm inbox … answer` had no rate flag. With `--uses standing --valid-to 2026-09-30` the fact is stored as `{"amount_cents":420000}`, and the resumed $2,200 credit is rejected: `J2 … fact … explains 420000 cents, entry adjusts 220000`. The kernel holds, but `int_main` stays `waiting_on_human` and the add-on beat cannot be shown from the command line. The tested path passes `pct_off: 2`. Use the Slack form, or add the flag.
3. **Fixed 00:40:** `pnpm demo:scenario` now applies `SLACK_USER_MAP` / `SLACK_DEFAULT_USER` from `.env` to account owners and approvers, as `pnpm seed` does. What follows describes the state before the fix. The scenario seeder wrote placeholder Slack ids (`approver.slack_user` = `U_CFO`, `U_CTRL`, …). `SLACK_USER_MAP` and `SLACK_DEFAULT_USER` are applied only by `pnpm seed`, so `pnpm desk` on this database has nobody real to reach until those rows hold real ids.
4. A code-only pass asks nothing (`open escalations: 0`): the question comes from the model tiers, or from the stand-in script, which must be named as a stand-in.
5. `pnpm rerun` after a code-only run 1 prints two identical columns (15 and 15, 0 and 0). The contrast exists only after a judgment pass.
6. `pnpm auditpack` always writes `runs/audit/<period>-<seed>.json`, whatever the database path: use a distinct seed name or packs overwrite each other.
7. `DEMO_STORY.md` quotes 0 of 6, 5 of 6 and 4 of 5 for Learns; with Vossberg's three fee write-offs seeded it is 0 of 9, 8 of 9 and 6 of 8.
8. Query for beat 1:50: `sqlite3 -header -column $DB "SELECT d.kind, l.account, l.debit_cents, l.credit_cents FROM decision d JOIN gl_entry e ON e.source_decision_id = d.id JOIN gl_line l ON l.entry_id = e.id WHERE d.intent_id = 'int_main' ORDER BY d.rowid, l.line_no"`.
9. Console checked over HTTP only (page 200, `/api/state` with 12 intents, AR ledger = subledger = $38,104.98 after the code pass). Not checked in a browser.
