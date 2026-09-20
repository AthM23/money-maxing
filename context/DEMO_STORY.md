# Demo story (proposal) — "The 2%"

Status: **proposed by Person A, 2026-09-19 22:17 ET. Not agreed yet.** It answers the judges' second note
(`judge-feedback-v2-2026-09-19.md`: one story, real pain, two or three processes, realistic documents) using what is on
Maximor's own site (`research/maximor-site-deep-read-2026-09-19.md`). Each beat says what is built and measured today
and what is not. Nothing in here may be claimed on stage until its line says built.

> **Checked against the repository, 2026-09-20 00:29 EDT** (`CLAIMS_AUDIT.md`). The "Built?" cells, the company
> paragraph, the two "Needs" lists and "What not to say" were corrected to what the tests and the team log now back.
> The team's agreed first proof since this was written is the international main scene; its script, numbers and what
> to seed are in [`SCENARIO.md`](./SCENARIO.md), which wins wherever the two documents differ.

## The one idea

Maximor's flagship number is Kiteworks: **98% of cash transactions straight through**. Everyone can demo a 98%. The
week of a finance team goes on the other 2%: the payment that arrives short, from the wrong entity, net of a tax nobody
booked, with the reason sitting in somebody's inbox. Maximor's own press says what happens to it: escalated when an
agent meets a decision it has not seen before, and handled the next time. **We demo the 2%, and show it joining the 98%
by next month, with every entry defensible.** The shape follows their home-page widget beat for beat:
**Learns → Runs → Escalates → Improves**, then the auditor.

## The company, shaped like their customer

Northwind Systems, $60M B2B software, grown by acquisition the way Kiteworks was: **three legal entities** (US Inc, UK
Ltd, Singapore Pte), **four bank accounts at three banks**, invoicing in US dollars, with one customer billed in euros
for the main scene; a finance team of six on QuickBooks, Gmail and Slack. July close, day 2. Ten receipts landed
overnight, plus the Vossberg wire. *(That is the scenario world in `src/demo/scenario`, which runs in tests. The world
`pnpm seed` builds is still one entity, USD, one bank; lane B is seeding the scenario. Entities, banks and countries
are labels: there are no multi-currency books and no intercompany entries.)*

## Beats (5 minutes)

| # | Beat | What the audience sees | Built? |
|---|---|---|---|
| 0 | **The pain** (20 s) | The AR clerk's morning, in their close-assessment's own words: one payment covering several invoices, small short-pays matched by hand, the reason in an inbox | slide |
| 1 | **Learns** (40 s) | Before touching July: replay Q2 with the humans' answers hidden, scored in code (0 of 6). Compile: `SHORT-PAY-01 v1 · wire short ≤ $45 → bank charges`, in-sample 5 of 6 with the one inconsistent human shown, leave-one-out 4 of 5. The controller approves it like a pull request. Replay again: 5 of 6, the sixth triaged as human inconsistency. **No model anywhere in this beat** | built, measured on the seeded world |
| 2 | **Runs** (40 s) | July's bank feed. Code alone clears the exact matches and one payment for three invoices. **6 of 11 resolved with no person, 10 cash entries, 0 model calls, $0, every tick mark re-performed in code, AR tied.** Once the rule is approved, the two wires short by a lifting fee are prepared by code and park for review until the write-off kind has earned auto. Open one workpaper | built, measured on the seeded world (23:25 entry; the earlier "8 of 11" was under forced autonomy and is superseded). The three-invoice case runs in the scenario rehearsal |
| 2a | **The main scene** (see `SCENARIO.md`) | One EUR wire, $4,200 short for three reasons: code books the cash, the bank's $40 fee and $1,960 of realized FX (kernel check F9); only the EUR 2,000 the customer held back needs a person, once, and the add-on invoice a week later is covered without asking | built and tested with stand-ins for the model tiers, no model call (`mainScene.test.ts`); not run on real models; being seeded |
| 3a | **The 2%: the reason is in an email** (40 s) | Initech pays $10,800 on $12,000. The agent searches mail, finds the CEO's note, quotes it, proposes Dr deferred revenue. **Change one character of the quote: the kernel rejects it.** Over $500, so it goes to a person in Slack with the email attached | built; run on real models on the seeded world, $0.069. Delivered to Slack and approved there live once (19 Sep, 23:09) |
| 3b | **The 2%: it is not a short-pay at all** (40 s) | A customer in India pays net of 10% tax withheld at source; the remittance advice says so and promises the certificate. A generic matcher calls it a discount. Ours books a **tax receivable**, not a concession, opens a follow-up for the certificate with the account owner, and remembers "this customer withholds 10%" with its scope, so next month code prepares the entry with no model and no question | built; run on real models on lane A's demo world, Haiku, $0.065, parked for a person. The next-month path is tested, not run on models; an entry over $500 still parks for a person |
| 3c | **The 2%: nothing explains it** (40 s) | Wayne pays 10% short. The agent searched mail, Slack, the contract and the policy memo, found the clause that discounts need an officer's written agreement, found none, and **did not guess**: one question to the account owner with what it checked. The answer ("one-time credit for the SSO outage") is remembered as one-time, so the same thing next month asks again, carrying the old answer | built; run on real models, $0.21, route ESCALATE. The question was delivered to Slack live; its answer form has not been submitted live |
| 4 | **Improves** (30 s) | A $60 lifting fee is over the rule. A person approves it; `SHORT-PAY-01 v2` is drafted, re-backtested on all history, approved, v1 retired. **Same July again from a cold copy with only memory carried: model calls N → 0, questions → 0.** "Every close, smarter" is their line | built and tested (`cycle.test.ts`: 24 model calls → 0; the scenario rehearsal: v1 → v2, run 2 with 0 model calls and 0 questions); not yet run on the seeded world |
| 5 | **Defend it** (30 s) | The auditor draws a seeded sample and re-performs every entry independently: 12 of 12 clean. Change one character of a cited bank line after posting: the pack flags exactly that entry. The auditor cannot read the preparer's memory | built, measured on the seeded world (22:02 entry; 10 of 10 clean on the fresh world after the safety audit) |
| 6 | **Close** (20 s) | Scoreboard. One line of breadth: the same judgment layer runs AP (three-way match, a re-numbered duplicate bill, a vendor bank-change email that is blocked even when a human approves). Lane C's table: the fine-tuned small model against open-weight base models on NorthwindBench | AP pack built and tested, not seeded; benchmark is lane C. Its figures in `ft/BENCHMARK.md` are "Results v1"; the 23:25 audit asks for a rerun under the corrected scorer before comparing. No real model has been run through `pnpm bench:reader` |

## Documents the story needs (realistic, not invented to show a feature)

AR: invoices with real numbering, terms and per-entity remit-to details · bank lines in the shape banks send them
(originator, reference, charges deducted by an intermediary) · **remittance advice emails from customers' AP teams**
listing invoices paid and each deduction with its reason · the CEO's concession thread · order forms with the discount
clause · a withholding-tax remittance note and, later, the certificate · the Slack thread about the outage · for the
main scene, the bank's credit advice stating the foreign amount, the rate and the fee verbatim.
AP (for the breadth line): a PO, a goods receipt, a bill that ties, one over-billed, one re-numbered duplicate, and a
vendor email asking to change bank details. Already in the world: most of the AR set for Initech, Wayne, Globex and the
wire fees. The rest is written as importable TypeScript in `src/demo/scenario` (`documents.ts`, `mainScene.ts`) and is
being seeded by lane B.

## Needs lane B (seed and console, mostly labels, little logic)

1. Entity, currency and bank account on bank lines and invoices, and a console view of cash by entity, bank and country.
   **Open**: `SCENARIO.md` has the list.
2. The three-invoice payment and the withholding-tax customer as July plants; remittance advice emails as traces.
   **Open** in the seeded world; both run in the scenario rehearsal.
3. `controller:claude` in the approver table. **Done** (23:25 entry: new seeds authorize the Claude reviewer below
   materiality).
4. Skeleton dispatch through `runOpenIntents` at `"earned"` autonomy. **Done** (23:25 entry).

## Needs lane A

Withholding-tax kind, account and checks: **done** (22:52 entry) · Slack desk run live with a person clicking: **done
once**, for an approval (23:39 entry); the question form is still not answered live · the improve beat and run 2 on
the seeded world: **open** (tested in the scenario rehearsal only) · README results and limitations: **done**, and
re-checked in `CLAIMS_AUDIT.md`.

## What not to say

The 98% has two scopes on their site (cash at Kiteworks; all platform transactions in the press). Their automation
rates differ page to page. Dura is not the 30-subsidiary roll-up. Our own numbers: say "6 of 11 receipts resolved from
code with no person in a seeded July, and two more prepared by code and parked for review", never "8 of 11", never a
percentage of a real workload, and say the month is simulated.

Added 20 Sep: do not say a model ran the main scene or the global July; stand-ins played the model tiers and the
document reader in those tests. Do not say the fine-tuned model makes the judgment calls or decides whether a
remembered answer applies: it reads documents, and code verifies the reading. Do not say multi-currency, FX gains,
intercompany or month-end remeasurement: one realized FX **loss** on a receipt is what is built. Do not quote a
harness-level number for base or fine-tuned Qwen: those rows have not been run.
