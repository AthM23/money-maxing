# Footnote

An agent finance team for the office of the CFO, built at HackMIT 2026 for the Maximor track. It closes a simulated
July for Northwind Systems, a mid-market software company. Agents do the investigating. **No agent is trusted**: every
entry is re-performed by a small deterministic kernel before it can post, a person is asked only when the agents are
genuinely blocked, and the answer is remembered with its scope so it is not asked twice.

> Draft written by lane A on 19 Sep. Numbers below were measured on this repository on a **seeded, simulated month**.
> They are not a percentage of any real workload. The team log, `context/PROJECT_STATUS.md`, has every measurement with
> its time and what was not run.

## The loop, in the order Maximor's own home page tells it

1. **Learns.** Before touching the live month, replay the closed quarter with the humans' entries hidden, score the
   result in code, and compile repeated human judgment into a rule a person approves like a pull request:
   `SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150`. No model is involved.
2. **Runs.** The bank feed is cleared by code: exact matches, one payment covering three invoices, small wire
   shortfalls on the compiled rule. Each entry carries a workpaper of tick marks in four classes (formal, evidence,
   process, judgment) that the kernel re-performs: totals, open balances, the party tie, every quote character by
   character against the stored source.
3. **Escalates.** What code cannot settle goes to model tiers, cheapest first, which can only act through one write
   path. Three kinds of not knowing: the reason is in somebody's inbox (a CEO's email grants 10% off); it is not a
   short-pay at all (a customer withheld 10% tax at source, which is a tax receivable, never a discount); nothing
   explains it (the agent says where it looked and asks the account owner one question in Slack).
4. **Improves.** A person approves something beyond the rule; the next compile drafts `SHORT-PAY-01 v2`, re-backtested
   on all history, and approving it retires v1. The same month run again from a cold copy with only memory carried
   over needs no model for what the rule now covers.
5. **Defends.** An auditor pack draws a seeded, risk-weighted sample, re-performs every sampled entry independently as
   of its posting, ties it to the ledger, re-hashes its evidence, and runs control tests. It cannot read the
   preparer's memory and cannot write.

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
- **Six hard blocks hold even when a person clicks approve**: duplicate payment, preparer equals approver, locked
  period, rule above its approver's authority, vendor bank details changed and unverified, approver over limit.
- **Materiality.** An adjustment of $500 or more needs a person in the approval matrix.

## Measured (seeded month, 19 Sep 2026)

| What | Result |
|---|---|
| Fresh July run after the safety audit | 6 of 11 resolved; 10 cash entries posted; 0 model calls, books tied. After policy approval, two write-offs park for review under earned autonomy. |
| Replay of six Q2 decisions | 0 of 6 before the rule; 5 of 6 after, the sixth triaged as human inconsistency |
| Initech ($1,200, reason in a CEO email), real models | Haiku, $0.069, proposed with two verbatim quotes, parked for a person |
| Wayne ($3,300, nothing explains it), real models | handed up by Haiku, escalated by Sonnet to the account owner, $0.21, nothing posted |
| Customer paying net of 10% withholding tax, real models | Haiku, $0.065, booked to the tax receivable, parked for a person |
| Auditor pack on the posted July entries | 12 of 12 re-performed clean; one character changed in a cited bank line afterwards: that entry flagged |
| Same month twice in the test world (six wire fees) | run 1: 24 model calls, 6 approvals; run 2: 0 model calls, 6 posted with no person, 6 parked; run 3: all 12 post, books tied |
| Edge-case corpus (`tests/cases.csv`, scored by route) | 11 of 110 routed cases run against the real system, 11 correct, 0 false auto-posts; 99 not run |
| Test suite (audit revision) | 488 TypeScript tests; 4 Python scoring tests; clean typecheck |

The [19 September audit and decisions](context/AUDIT_2026-09-19.md) record the new safety fixes, remittance rehearsal, and remaining launch checks. Earlier live-model rows above are historical observations, not fresh audit runs.

Lane C's fine-tune and benchmark (NorthwindBench: tasks, held-out entities and templates, contenders) are in
[`ft/BENCHMARK.md`](ft/BENCHMARK.md); the audit corrections there invalidate comparisons made with the old scorer and test-selected threshold until rerun.

## Limits, stated plainly

- **Two independent reviews of this code tonight found six ways an entry could have posted without a person.** All six
  are closed with regression tests. We expect there are more; "zero false auto-posts" is a property we keep attacking,
  not one we have proved.
- The month is simulated: one legal entity, one currency, one bank account, twelve customers. Real cash application
  at a company like Maximor's customers spans many entities, currencies and banks (`context/DEMO_DOCUMENTS.md`).
- Only accounts receivable runs end to end on the seeded world. The accounts payable pack (three-way match,
  duplicate obligation, code tier) is built and tested but not seeded. Bank reconciliation, revenue, close, forecast
  and reporting have no pack; a case for a function with no pack goes to a person, never to another function's prompt.
- The controller agent is the same model family as the preparer unless an OpenAI key is set, which weakens its
  independence. It can sign only compiled judgment below $500 on a kind with a track record.
- The Slack round trip (question out, click back) is built and unit-tested; it has not been run live end to end.
- A rule's backtest is in-sample; a leave-one-out figure is reported beside it. History is six decisions.
- "The concession ripples to future invoices and the forecast" is not built: the event is emitted and nothing consumes it.

## Run it

```bash
pnpm install
pnpm test && pnpm typecheck
python3 -m unittest discover -s ft -p 'test_*.py'
pnpm demo:remittance                       # isolated 14-invoice email-table rehearsal, no external calls

# Code only: costs nothing. Blank the keys so nothing paid can run.
export ANTHROPIC_API_KEY= OPENAI_API_KEY=
pnpm seed --target=local --reset            # the world (lane B)
pnpm skeleton                               # bank feed → drift → intents → code tier → kernel → ledger
pnpm learn data/footnote.db --replay --approve-as U_CTRL   # replay Q2, compile, approve, ladder
pnpm worker data/footnote.db --code-only    # what the compiled rule now settles
pnpm auditpack data/footnote.db 2026-07 demo 5

# With models (paid; keys in a git-ignored .env): about $0.07 to $0.25 per judgment case
pnpm worker data/footnote.db --intent <intent id> --review
pnpm inbox data/footnote.db list            # or: pnpm desk data/footnote.db   (Slack, Socket Mode)
pnpm learn data/footnote.db && pnpm rerun data/footnote.db   # the same month again, only memory changed
```

## Where things are

`src/contract` shared types and schema · `src/kernel` the deterministic checker · `src/runtime` the write path,
approvals, intent status · `src/router` the code tier · `src/agents` model tiers, tools, controller, human loop, Slack ·
`src/memory` facts and questions · `src/learn` replay, compile, ladder, run 1 → run 2 · `src/worker` the hand-off from the
drift monitor · `src/desk` questions and approvals to people · `src/audit` the auditor pack · `src/packs` per-function
packs · `eval` the corpus harness · lane B: `src/seed`, `src/ingest`, `src/drift`, `src/connectors`, `console` · lane C:
`ft` · `context` the spec, roadmap, research, demo story and the team log.

Team: Karan Singh Bisht (judgment and learning), Atharv (world, connectors, console), Preet (fine-tune and benchmark).
