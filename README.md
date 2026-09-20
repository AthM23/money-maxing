# Footnote

An agent finance team for the office of the CFO, built at HackMIT 2026 for the Maximor track. It closes a simulated
July for Northwind Systems, a mid-market software company. Agents do the investigating. **No agent is trusted**: every
entry is re-performed by a small deterministic kernel before it can post, a person is asked only when the agents are
genuinely blocked, and the answer is remembered with its scope so it is not asked twice.

> Written by lane A on 19 Sep; checked claim by claim against the repository on 20 Sep
> ([`context/CLAIMS_AUDIT.md`](context/CLAIMS_AUDIT.md)). Numbers below were measured on this repository on a
> **seeded, simulated month**, or asserted by a named test. They are not a percentage of any real workload. The team
> log, `context/PROJECT_STATUS.md`, has every measurement with its time and what was not run.

## The loop, in the order Maximor's own home page tells it

1. **Learns.** Before touching the live month, replay the closed quarter with the humans' entries hidden, score the
   result in code, and compile repeated human judgment into a rule a person approves like a pull request:
   `SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150`. No model is involved. The rule names the customers it
   was seen on, so a customer it never saw cannot inherit it.
2. **Runs.** The bank feed is cleared by code: exact matches, one payment covering three invoices, small wire
   shortfalls on the compiled rule. A receipt the bank converted from a foreign currency is split by code into the
   bank's fee, the rate effect and what the customer held back; only the last is a judgment. When a payment names no
   invoice, a small model may read the customer's remittance advice, and **code decides whether to believe the
   reading**: the total must be the bank line to the cent and every invoice and amount must be in the customer's own
   words. Each entry carries a workpaper of tick marks in four classes (formal, evidence, process, judgment) that the
   kernel re-performs: totals, open balances, the party tie, every quote character by character against the stored
   source.
3. **Escalates.** What code cannot settle goes to model tiers, cheapest first, which can only act through one write
   path. Three kinds of not knowing: the reason is in somebody's inbox (a CEO's email grants 10% off); it is not a
   short-pay at all (a customer withheld 10% tax at source, which is a tax receivable, never a discount, and booking
   it opens a follow-up for the tax certificate that stays with the account owner); nothing explains it (the agent
   says where it looked and asks the account owner one question in Slack).
4. **Improves.** A person approves something beyond the rule; the next compile drafts `SHORT-PAY-01 v2`, re-backtested
   on all history, and approving it retires v1. A fact an agent proposes to remember applies to nothing until a person
   approves it (`pnpm inbox <db> approve-fact`, or a "Remember this?" message in Slack). The same month run again from
   a cold copy with only memory carried over needs no model for what the rule and the approved facts now cover.
5. **Defends.** An auditor pack draws a seeded, risk-weighted sample, re-performs every sampled entry independently as
   of its posting (a cited rule is tested as it stood then, not as it stands today), ties it to the ledger, re-hashes
   its evidence, and runs control tests. It cannot read the preparer's memory and cannot write.

## The main scene: one wire, $4,200 short for three reasons

Vossberg Logistik GmbH (fictional) is invoiced EUR 100,000.00, booked at 1.1000 = USD 110,000.00. It pays
EUR 98,000.00; the bank converts at 1.0800 and takes USD 40.00, so USD 105,800.00 arrives. A matcher that sees one
number calls the $4,200 a short-pay. The harness splits it (`src/demo/scenario/mainScene.ts`, asserted in
`__tests__/mainScene.test.ts`; scripted stand-ins play the model tiers, no model call):

| Cause | USD | Who settles it | Entry |
|---|---|---|---|
| Cash that arrived | 105,800.00 | code, posts alone | Dr 1000 / Cr 1200 |
| The bank's fee | 40.00 | code, under `SHORT-PAY-01` tested on the fee alone | Dr 6150 / Cr 1200 |
| The rate moved | 1,960.00 | code; kernel check F9 re-performs EUR 98,000 × (1.1000 − 1.0800) | Dr 7100 Realized FX / Cr 1200 |
| The customer held back EUR 2,000 | 2,200.00 | judgment: one Slack question, the CFO answers a standing 2% to 30 September, a person approves | Dr 2400 / Cr 1200 |

A week later the add-on invoice arrives short the same way: code books cash, fee and FX, and prepares the 2% credit
from the remembered answer without asking anyone; it parks only because $550 is over the $500 approval threshold.
Another customer citing "the outage" gets nothing from Vossberg's answer. Running everything again posts nothing twice
and asks nothing twice, and the auditor pack finds nothing over the posted entries, the FX ones included.

Run once on real models (20 Sep 00:22, `pnpm worker <db> --intent int_main`): code posted the first three rows in
15 ms; the model tiers found the customer's remittance advice, the Slack note, order form section 7 and the $500
approval rule, booked nothing, and asked the account owner one question with the $2,200 exactly explained. It took
52 model calls, $1.07 and 9 min 50 s, which is why the demo prepares that question beforehand
(`context/DEMO_RUNBOOK.md`). The CFO's standing 2% was then given from the terminal on that database
(`pnpm inbox <db> answer … --pct-off 2 --uses standing --valid-to 2026-09-30`), and the add-on invoice's $550 credit
was prepared by code with no question and no further model call.

## What stops a wrong entry from posting

- **One write path.** `propose_entry` validates, records the decision, runs the kernel, and then posts, parks for
  approval, or persists a block. Agents have no other way to change the ledger.
- **Trust is earned only where there is judgment.** A cash application planned by code that touches only control
  accounts posts from day one. Everything else runs at the level its *kind of entry* has earned from evidence (replay
  of closed periods, and people approving or rejecting what the agent proposed): shadow, review, then auto at 95%
  agreement on at least five covered decisions.
- **Free inference never posts alone.** An entry a model reached without an approved rule or an active fact is held
  for a person even on a kind that has earned auto, and the controller agent may not sign it either. A cited rule must
  be a rule *for that entry*: same function, same kind, same account.
- **Realized FX is re-performed, not believed.** Kind `fx_realized` books only to account `7100`, and kernel check F9
  recomputes the amount from two records (`invoice_fx`: the booked rate; `bank_txn_fx`: the foreign amount, the
  settlement rate and the fee) and requires the bank's credit advice to be cited and to state that amount and that
  rate. Refused, each tested: the whole shortfall called FX, the right amount booked to misc expense, FX without the
  advice cited, FX twice on one receipt.
- **Six hard blocks hold even when a person clicks approve**: duplicate payment, preparer equals approver, locked
  period, rule above its approver's authority, vendor bank details changed and unverified, approver over limit.
- **Materiality.** An adjustment of $500 or more needs a person in the approval matrix. Realized FX is arithmetic the
  kernel re-performs to the cent, not an amount anyone judged, so it does not park at $500.

## Measured (seeded month, 19 and 20 Sep 2026)

| What | Result |
|---|---|
| Fresh July run after the safety audit | 6 of 11 resolved; 10 cash entries posted; 0 model calls, books tied. After policy approval, two write-offs park for review under earned autonomy. |
| Replay of six Q2 decisions | 0 of 6 before the rule; 5 of 6 after, the sixth triaged as human inconsistency |
| Initech ($1,200, reason in a CEO email), real models | Haiku, $0.069, proposed with two verbatim quotes, parked for a person |
| Wayne ($3,300, nothing explains it), real models | handed up by Haiku, escalated by Sonnet to the account owner, $0.21, nothing posted |
| Customer paying net of 10% withholding tax, real models | Haiku, $0.065, booked to the tax receivable, parked for a person |
| Approval from Slack, live, once | Initech's $1,200 concession approved from Slack at 23:09 on 19 Sep: the click came back over Socket Mode, the kernel re-checked the entry at the post gate, and it posted |
| Auditor pack on the posted July entries | 12 of 12 re-performed clean (22:02 entry); one character changed in a cited bank line afterwards: that entry flagged. On the fresh world after the safety audit: 10 of 10 clean |
| Same month twice in the test world (six wire fees) | run 1: 24 model calls, 6 approvals; run 2: 0 model calls, 6 posted with no person, 6 parked; run 3: all 12 post, books tied |
| The main scene (test, stand-ins, no model call) | code posts 105,800.00 + 40.00 + 1,960.00 and leaves 2,200.00 open; one question covers both Vossberg receipts; the add-on's $550 credit is prepared without asking and parks; replay adds no decision; 0 audit findings |
| The global July rehearsal (test, stand-ins, no model call) | ten USD receipts: all ten resolved after people act, books tied, 0 audit findings, the edited CEO email is caught. Run 2 from a cold copy with only memory: 0 model calls, 0 questions, six settle from code, four park for a person |
| Reader benchmark, control rows only (`pnpm bench:reader`, n = 200 held-out remittances) | no reader: 0 settled, 200 left for judgment; oracle (the gold labels, not a model): 168 settled, 32 cash applied with the claimed deduction left open; saboteur (deliberately wrong, not a model): 0 settled, 200 left for judgment. Wrong postings: 0 in all three. **No real model has been run through it** |
| Lane B's spine on the seeded world (`pnpm spine`, no model key, scripted Initech stand-in) | revenue schedule v2 sums to $129,600, forecast v2, the CRM drift explained with nobody asked, 7 of 11 close checklist items done, AR and deferred revenue tied |
| Edge-case corpus (`tests/cases.csv`, scored by route) | 20 of 110 routed cases run against the real system (`pnpm eval --sut kernel-pack`, 20 Sep 00:41): 16 routes match the corpus; 4 differ and all 4 are more conservative than the corpus asks (A-14 refused where AUTO was expected, B-01 and B-02 escalated where PROPOSE was expected, B-13 refused where BLOCK was expected); **0 false auto-posts**; 90 not run |
| Test suite | 655 TypeScript tests in 70 files and 4 Python scoring tests, all passing (run 20 Sep, 00:23 EDT, model keys blanked); typecheck clean at 00:33 EDT |

The [19 September audit and decisions](context/AUDIT_2026-09-19.md) record the new safety fixes, remittance rehearsal, and remaining launch checks. The live-model rows above are historical observations from 19 Sep, not fresh runs; no model tier has been run on the main scene or the global July.

Lane C's fine-tune and benchmark (NorthwindBench: tasks, held-out entities and templates, contenders) are in
[`ft/BENCHMARK.md`](ft/BENCHMARK.md); the audit corrections there invalidate comparisons made with the old scorer and test-selected threshold until rerun. The fine-tuned model is a **document reader** whose readings code verifies. It does not make the judgment calls and does not decide whether a remembered answer applies.

## Limits, stated plainly

- **Independent reviews of this code on 19 Sep found six ways an entry could have posted without a person**, and a
  third audit at 23:25 fixed further safety defects (posting and approval in one transaction, terminal declines,
  signer identity). All are closed with regression tests. We expect there are more; "zero false auto-posts" is a
  property we keep attacking, not one we have proved.
- The month is simulated. The seeded world (`pnpm seed`) is one legal entity, one currency, one bank account, twelve
  customers. The scenario in `src/demo/scenario` labels three entities and four bank accounts at three banks, all in
  USD, and adds one EUR customer for the main scene; it runs in tests and is being seeded into the live world by
  lane B. Real cash application at a company like Maximor's customers spans many entities, currencies and banks
  (`context/DEMO_DOCUMENTS.md`).
- **Foreign currency is one narrow path.** Only a realized **loss** on a receipt can be booked; a gain is refused.
  There are no multi-currency books, no translation of a subsidiary, and no intercompany entries for a payment into
  the wrong Northwind entity's account. Month-end remeasurement is not an agent function: where it appears it is
  seeded history only.
- **Stand-ins played the model tiers** in the main scene and the global July rehearsal, and a stand-in played the
  document reader. Those tests prove the harness, not a model. Real base and fine-tuned Qwen rows have not been run
  through `pnpm bench:reader`: the endpoint is only reachable on the tailnet (`ft/INTERFACE.md` has the commands).
- Only accounts receivable runs end to end through the judgment tiers. The accounts payable pack (three-way match,
  duplicate obligation, code tier) is built and tested but not seeded. Lane B's revenue schedule, 13-week forecast
  and close checklist are engines, not judgment packs: a revenue or close *case* goes to a person, never to another
  function's prompt. Bank reconciliation and reporting have nothing.
- The controller agent is the same model family as the preparer unless an OpenAI key is set, which weakens its
  independence. It can sign only compiled judgment below $500 on a kind with a track record.
- Slack: one approval click has been run live. The question form (what was agreed, one-time or standing) has not been
  answered live, the "Remember this?" message has not been sent live, and all personas map to one real Slack user, so
  a live run cannot show that the person who asked for a credit is not the one who signs it.
- The withholding-tax certificate follow-up is a task for the account owner. No agent works it, and nothing reads the
  certificate when it arrives.
- A rule's backtest is in-sample; a leave-one-out figure is reported beside it. History is six decisions.
- The concession's ripple is lane B's spine: a posted credit memo revises the revenue schedule and the forecast's
  future billing. It was measured with a scripted stand-in for the judgment, it is not part of the main scene or the
  global July rehearsal, and the QuickBooks mirror has never written to the sandbox.

## Run it

```bash
pnpm install
pnpm test && pnpm typecheck
python3 -m unittest discover -s ft -p 'test_*.py'
pnpm demo:remittance                       # isolated 14-invoice email-table rehearsal, no external calls
pnpm vitest run src/demo/scenario          # the main scene and the global July rehearsal, no model call

# Code only: costs nothing. Blank the keys so nothing paid can run.
export ANTHROPIC_API_KEY= OPENAI_API_KEY=
pnpm seed --target=local --reset            # the world (lane B); this resets data/footnote.db
pnpm skeleton                               # bank feed → drift → intents → code tier → kernel → ledger
pnpm learn data/footnote.db --replay --approve-as U_CTRL   # replay Q2, compile, approve, ladder
pnpm worker data/footnote.db --code-only    # what the compiled rule now settles
pnpm inbox data/footnote.db list            # parked entries, open questions, facts waiting for approval
pnpm inbox data/footnote.db approve-fact <fact id> --as U_CTRL
pnpm auditpack data/footnote.db 2026-07 demo 5
pnpm bench:reader --n 200 --oracle          # or --none, --saboteur: the three control rows, no model

# With models (paid; keys in a git-ignored .env): $0.07 to $0.28 per judgment case as logged on 19 Sep, controller reviews not metered
pnpm worker data/footnote.db --intent <intent id> --review
pnpm desk data/footnote.db                  # Slack, Socket Mode: this sends real messages
pnpm learn data/footnote.db && pnpm rerun data/footnote.db   # the same month again, only memory changed
```

## Where things are

`src/contract` shared types and schema · `src/kernel` the deterministic checker · `src/runtime` the write path,
approvals, intent status · `src/router` the code tier · `src/agents` model tiers, tools, controller, human loop, Slack ·
`src/memory` facts and questions · `src/learn` replay, compile, ladder, run 1 → run 2 · `src/worker` the hand-off from the
drift monitor · `src/reader` the document reader and its benchmark · `src/desk` questions and approvals to people ·
`src/audit` the auditor pack · `src/packs` per-function packs · `src/demo/scenario` the main scene and the global July ·
`eval` the corpus harness · lane B: `src/seed`, `src/ingest`, `src/drift`, `src/connectors`, `src/engines`, `src/close`,
`src/spine`, `src/mirror`, `console` · lane C: `ft`, `frontend` · `context` the spec, roadmap, research, scenario, demo
story, claims audit and the team log.

Team: Karan Singh Bisht (judgment and learning), Atharv (world, connectors, console), Preet (fine-tune and benchmark).
