# The demo scenario, and what to seed for it

Status: **written by Person A, 2026-09-19 23:53 ET, for Atharv (seed and connectors) and whoever builds the UI.**
Every beat below has been run end to end through the real harness in
`src/demo/scenario/__tests__/rehearsal.test.ts` (no model call; scripted stand-ins play the model tiers and the
document reader). The data is importable TypeScript, so nothing here has to be retyped.

## The scenario in one paragraph

Northwind Systems sells software worldwide and invoices in **US dollars** from **three legal entities** (Northwind
Systems Inc, Ltd in London, Pte Ltd in Singapore) into **four bank accounts at three banks**. It is day 2 of July's
close and ten receipts landed overnight from customers in six countries. This is the Kiteworks shape (their case
study: many entities, currencies, accounts and banks, entity-specific rules, 20 people on cash), and the pains are the
ones Maximor's own close-assessment asks about: one payment for several invoices, small short-pays matched by hand,
a payer that is not the customer, tax withheld abroad, a remittance nobody can parse, a claimed deduction nobody
agreed. **Everything is in USD on purpose**: the ledger has no FX or intercompany engine (the audit deferred both), and
global SaaS companies really do invoice in dollars. We do not show currency conversion and we must not claim it.

## The ten receipts (`src/demo/scenario/plants.ts`, documents in `documents.ts`)

| # | Customer (country) → Northwind account | What arrives | What the harness does | Story beat |
|---|---|---|---|---|
| 1 | Pallister Manufacturing (US) → JPMorgan operating | ACH, invoice named, exact | posts from code | Runs |
| 2 | Tessellate Software (US) → JPMorgan lockbox | one CTX payment naming three invoices | posts from code, all three | Runs |
| 3 | Ostrander Imports (NL) → HSBC UK | international wire, **$38 taken by an intermediary bank** | `SHORT-PAY-01 v1` (learned from Q2) writes it off from code | Learns → Runs |
| 4 | Ardent Aerospace (DE) → HSBC UK | same, but **$60**, above the rule's $45 | model proposes, a person approves → `SHORT-PAY-01 v2`; from code in run 2 | Improves |
| 5 | Halvorsen Freight (US) → JPMorgan operating | pays $10,800 on $12,000 | model finds the CEO's email, quotes it, proposes the concession; remembered as a standing 10% to 2027-06-30 | The 2%: the reason is in an inbox |
| 6 | Meridian Infotech (IN) → DBS Singapore | pays $16,200 on $18,000, "NET OF TDS" | **tax withheld at source**: booked to 1350 Withholding tax receivable, never a discount; remembered as a 10% rate | The 2%: not a short-pay at all |
| 7 | Brightwater Health (US) → JPMorgan operating | pays $29,700 on $33,000; remittance claims "reason code 07, service credit per account team" | nothing in writing from an officer → **one Slack question** to the account owner; the answer is one-time | The 2%: nothing explains it |
| 8 | **Kestrel Group Holdings (parent, London)** pays for Kestrel Analytics → HSBC UK | exact amount, wrong legal entity | kernel refuses the party tie; the model finds the customer's "change of paying entity" email and proposes to remember it; a person approves; then code settles it | Global: a payer that is not the customer |
| 9 | Castellan Biotech (CH) → HSBC UK | wire naming no invoice; two identical monthly invoices open; a terse payment advice in the mailbox | not guessed. **The small model reads the advice**; code checks it against the customer's words and the bank line; posts to the two invoices the customer named | Where lane C's fine-tune runs |
| 10 | Lumen Retail (US) → JPMorgan operating | a second payment for an invoice already paid | held as unapplied cash with the bank line quoted; parked for a person | Knows when it does not know |

Q2 history (`Q2_WIRE_FEES`): six intermediary-charge write-offs across Ostrander, Ardent and Fernhill, one coded to the
wrong account. That is what `SHORT-PAY-01` is compiled from, and why it is scoped to those three customers.

## What the rehearsal proves (the acceptance test for the seed)

After Learns + one code pass + the judgment pass + people acting: **all ten cases resolved, AR control = subledger, 0
audit findings over every posted entry**; changing "10% off" to "15% off" in the CEO's email afterwards is caught.
**Run 2** (same July from a cold copy, only memory carried, no judgment tier offered): 0 model calls, 0 questions; six
cases settle from code with nobody involved (1, 2, 3, **4 on rule v2**, **8 on the confirmed payer**, 9 on the reader);
three are prepared by code from what people said in run 1 and parked because each is over $500 (5, 6, 7); the
duplicate (10) parks as before. Run: `pnpm vitest run src/demo/scenario`.

## Atharv: what to seed

1. **Import the plants** rather than retyping them: `CUSTOMERS`, `INVOICES`, `BANK_LINES`, `DOCUMENTS`,
   `Q2_WIRE_FEES`, `ENTITIES`, `BANK_ACCOUNTS` from `src/demo/scenario/`. `seedGlobalJuly(db)` in `world.ts` shows the
   exact rows the harness needs. **Do not pre-open the intents** in the real seed: let your drift monitor open them
   from the bank lines; `CASES` in `plants.ts` is what it should produce (compare in a test).
2. **Labels on bank lines and invoices: entity, bank account, currency (always USD), customer country.** No new
   logic. They drive the UI's "cash by entity, bank and country" strip. Today they live in the bank trace payload.
3. **Opening balances must tie** (AR control = sum of open invoices) and **locked periods need `locked_at`**.
4. **Documents go through your connectors**: mail as Gmail messages, the outage thread as Slack, order forms and the
   policy memo as files, so the live demo can show the real inbox. Hash every payload (sha256) or the auditor reads
   it as tampered. Remittance advices are separate emails, sent the day before or of the payment.
5. **People**: `U_CFO`, `U_CTRL`, `U_SAM` (EMEA and APAC accounts), `U_DANA` (Americas), plus both controller agents
   under materiality. **Map them to different real Slack users** if you can: all personas on one account cannot
   show that the person who asked for a credit is not the one who signs it.
6. **Case 9 needs the monitor to stay undecided**: two identical open invoices (INV-3181, INV-3182), so no unique
   subset explains $8,494.98. If the monitor picks one, the reader beat disappears.
7. Keep the existing world's ids if you merge rather than replace; the rehearsal uses its own ids (INV-31xx, BTX-3xx).

## UI: what each beat needs on screen

A strip of **cash received by entity / bank account / country** (labels only) · the ten receipts with their state
(posted from code, parked, asked, open) and **who or what settled each** (code, rule name and version, remembered
fact, reader, model tier, person) · one **workpaper** view: tick marks by class, each quote beside its source with the
span highlighted · the **rule card**: `SHORT-PAY-01 v1 → v2`, scope (customers), backtest and leave-one-out · the
**memory card**: what was remembered, its scope, end date and who approved it · **run 1 against run 2** · the
**auditor's** result and the one flagged entry after the tamper. All of it is already in the tables
(`decision`, `decision_step`, `workpaper`, `policy`, `fact`, `escalation`, `approval`, scoreboard in
`src/learn/scoreboard.ts`, audit pack JSON).

## Not built, so do not show or claim

FX and multi-currency books · intercompany entries (a payment into the wrong Northwind entity's account) · usage-based
revenue · the concession rippling into future invoices or the forecast · real base and fine-tuned Qwen numbers through
the harness (the commands are in `ft/INTERFACE.md`; the endpoint is only reachable on the tailnet).
