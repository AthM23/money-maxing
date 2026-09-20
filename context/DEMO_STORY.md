# Demo story (proposal) — "The 2%"

Status: **proposed by Person A, 2026-09-19 22:17 ET. Not agreed yet.** It answers the judges' second note
(`judge-feedback-v2-2026-09-19.md`: one story, real pain, two or three processes, realistic documents) using what is on
Maximor's own site (`research/maximor-site-deep-read-2026-09-19.md`). Each beat says what is built and measured today
and what is not. Nothing in here may be claimed on stage until its line says built.

## The one idea

Maximor's flagship number is Kiteworks: **98% of cash transactions straight through**. Everyone can demo a 98%. The
week of a finance team goes on the other 2%: the payment that arrives short, from the wrong entity, net of a tax nobody
booked, with the reason sitting in somebody's inbox. Maximor's own press says what happens to it: escalated when an
agent meets a decision it has not seen before, and handled the next time. **We demo the 2%, and show it joining the 98%
by next month, with every entry defensible.** The shape follows their home-page widget beat for beat:
**Learns → Runs → Escalates → Improves**, then the auditor.

## The company, shaped like their customer

Northwind Systems, $60M B2B software, grown by acquisition the way Kiteworks was: **three legal entities** (US Inc, UK
Ltd, Singapore Pte), **four currencies**, **eight bank accounts at four banks**, a finance team of six on QuickBooks,
Gmail and Slack. July close, day 2. Forty-odd bank lines landed overnight. *(Today the seeded world is one entity, USD,
one bank: see "Needs lane B".)*

## Beats (5 minutes)

| # | Beat | What the audience sees | Built? |
|---|---|---|---|
| 0 | **The pain** (20 s) | The AR clerk's morning, in their close-assessment's own words: one payment covering several invoices, small short-pays matched by hand, the reason in an inbox | slide |
| 1 | **Learns** (40 s) | Before touching July: replay Q2 with the humans' answers hidden, scored in code (0 of 6). Compile: `SHORT-PAY-01 v1 · wire short ≤ $45 → bank charges`, in-sample 5 of 6 with the one inconsistent human shown, leave-one-out 4 of 5. The controller approves it like a pull request. Replay again: 5 of 6, the sixth triaged as human inconsistency. **No model anywhere in this beat** | built, measured on the seeded world |
| 2 | **Runs** (40 s) | July's bank feed. Code alone clears the exact matches, one payment for three invoices, and two wires short by a lifting fee on `SHORT-PAY-01`. **8 of 11, 0 model calls, $0, every tick mark re-performed in code, AR tied.** Open one workpaper | built, measured (three-invoice case is tested, not yet in the seeded world) |
| 3a | **The 2%: the reason is in an email** (40 s) | Initech pays $10,800 on $12,000. The agent searches mail, finds the CEO's note, quotes it, proposes Dr deferred revenue. **Change one character of the quote: the kernel rejects it.** Over $500, so it goes to a person in Slack with the email attached | built; run on real models on the seeded world, $0.069. Slack delivery not yet run live |
| 3b | **The 2%: it is not a short-pay at all** (40 s) | A customer in India pays net of 10% tax withheld at source; the remittance advice says so and promises the certificate. A generic matcher calls it a discount. Ours books a **tax receivable**, not a concession, and remembers "this customer withholds 10%" with its scope, so next month it books from code | **not built** (lane A building tonight; needs the case and documents in the world) |
| 3c | **The 2%: nothing explains it** (40 s) | Wayne pays 10% short. The agent searched mail, Slack, the contract and the policy memo, found the clause that discounts need an officer's written agreement, found none, and **did not guess**: one question to the account owner with what it checked. The answer ("one-time credit for the SSO outage") is remembered as one-time, so the same thing next month asks again, carrying the old answer | built; run on real models, $0.21, route ESCALATE. Slack round trip not yet run live |
| 4 | **Improves** (30 s) | A $60 lifting fee is over the rule. A person approves it; `SHORT-PAY-01 v2` is drafted, re-backtested on all history, approved, v1 retired. **Same July again from a cold copy with only memory carried: model calls N → 0, questions → 0.** "Every close, smarter" is their line | built and tested; not yet run on the seeded world |
| 5 | **Defend it** (30 s) | The auditor draws a seeded sample and re-performs every entry independently: 12 of 12 clean. Change one character of a cited bank line after posting: the pack flags exactly that entry. The auditor cannot read the preparer's memory | built, measured on the seeded world |
| 6 | **Close** (20 s) | Scoreboard. One line of breadth: the same judgment layer runs AP (three-way match, a re-numbered duplicate bill, a vendor bank-change email that is blocked even when a human approves). Lane C's table: the fine-tuned small model against open-weight base models on NorthwindBench | AP pack built; benchmark is lane C |

## Documents the story needs (realistic, not invented to show a feature)

AR: invoices with real numbering, terms and per-entity remit-to details · bank lines in the shape banks send them
(originator, reference, charges deducted by an intermediary) · **remittance advice emails from customers' AP teams**
listing invoices paid and each deduction with its reason · the CEO's concession thread · order forms with the discount
clause · a withholding-tax remittance note and, later, the certificate · the Slack thread about the outage.
AP (for the breadth line): a PO, a goods receipt, a bill that ties, one over-billed, one re-numbered duplicate, and a
vendor email asking to change bank details. Already in the world: most of the AR set for Initech, Wayne, Globex and the
wire fees. Missing: remittance advice as its own document, the withholding-tax case, multi-entity and currency labels.

## Needs lane B (seed and console, mostly labels, little logic)

1. Entity, currency and bank account on bank lines and invoices, and a console view of cash by currency, entity and region.
2. The three-invoice payment and the withholding-tax customer as July plants; remittance advice emails as traces.
3. `controller:claude` in the approver table (the controller runs on Claude when there is no OpenAI key).
4. Skeleton dispatch through `runOpenIntents` at `"earned"` autonomy, or run 1 against run 2 means nothing.

## Needs lane A (tonight)

Withholding-tax kind, account and checks · Slack desk run live with a person clicking · the improve beat and run 2 on
the seeded world · README results and limitations.

## What not to say

The 98% has two scopes on their site (cash at Kiteworks; all platform transactions in the press). Their automation
rates differ page to page. Dura is not the 30-subsidiary roll-up. Our own numbers: say "8 of 11 receipts in a seeded
July", never a percentage of a real workload, and say the month is simulated.
