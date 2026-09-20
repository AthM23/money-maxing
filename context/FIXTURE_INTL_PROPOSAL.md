# International payment fixture — lane B's proposal for Gate 1

Status: **superseded 2026-09-20.** Lane A answered it in [`GATE1_ANSWERS_A.md`](./GATE1_ANSWERS_A.md) and built the right path
(account 7100, kind `fx_realized`, kernel check F9); the scene is now Vossberg Logistik in [`SCENARIO.md`](./SCENARIO.md), and what
lane B seeded is in [`SEED_GLOBAL_JULY.md`](./SEED_GLOBAL_JULY.md). Kept for the reasoning. Originally: proposed by lane B
(AthM23 + Claude Code session), 2026-09-20 ~00:30 ET. This is the input to
milestone 1 of [`TEAM_ROADMAP_2026-09-19.md`](./TEAM_ROADMAP_2026-09-19.md) ("A/B/C agree the contract"). It turns that
file's starting fixture into exact numbers, entries and documents, and says what the existing harness does with the
case today. The harness facts below come from a read-only assessment of `main` at `d08879d`; the two that everything
else rests on (kernel F2, the allowed-accounts table) were re-read by hand. Nothing here is built or run.

## The case, in one line

One wire arrives $4,200 short of the invoice, for **three different reasons**, and only one of them is judgment:
the rate moved (arithmetic), a bank took a fee (arithmetic), and the customer held back EUR 2,000 for an outage
(needs authority nobody has written down). A generic matcher calls all of it a short-pay.

## Numbers (proposed; every one is a Gate 1 decision)

| | |
|---|---|
| Seller | Northwind Systems Inc (US), functional currency USD. Stays the only entity in the ledger |
| Customer | A new 13th customer, EUR-billing, appended to `CUSTOMERS` (never inserted: index 5 must stay Initech). Name to be picked and checked against real companies |
| Invoice | EUR 100,000.00, issued 2026-06-15, booked at **1.1000** → AR USD 110,000.00 |
| Receipt | 2026-07-15: EUR 98,000.00 converted at **1.0800** = USD 105,840.00, less USD 40.00 fee = **USD 105,800.00** deposited |
| Gap | 110,000.00 − 105,800.00 = **4,200.00** = realized FX loss **1,960.00** (98,000 × 0.02) + fee **40.00** + withheld EUR 2,000 at the booked rate **2,200.00** |

A booked rate of 1.10 is a choice: at 1.08 there is no FX line and the scene loses its third cause. The withheld
EUR 2,000 stays on the books at the booked rate (USD 2,200) until it is credited or collected; no cash has settled it,
so no FX is realized on it yet.

## Entries a correct system ends with

| # | Entry | Kind of knowledge | Who may post it |
|---|---|---|---|
| 1 | Dr 1000 Cash 105,800.00 / Cr 1200 AR 105,800.00 | exact, re-performed | code, AUTO (tier 0 does this today) |
| 2 | Dr 6150 Bank charges 40.00 / Cr 1200 AR 40.00 | arithmetic, evidenced by the bank advice | code under a rule or policy-memo cover |
| 3 | Dr *FX loss* 1,960.00 / Cr 1200 AR 1,960.00 | arithmetic, evidenced by the bank advice and the booked rate | **Gate 1 decision, see below** |
| 4 | EUR 2,000 (USD 2,200): dispute hold, then **only with authority** Dr 2400 / Cr 1200 2,200.00 as a credit memo | judgment | a person, once; then memory |

One combined entry is impossible by design: kernel **F2** refuses an `apply_payment` that relieves more receivable
than cash arrived (`src/kernel/formal.ts:76-79`), and **J4** lets `apply_payment` touch only 2100 outside the control
accounts (`src/runtime/config.ts`). Several proposals per case is already how the router works.

## What the harness does with this case today (unchanged code)

- Drift opens **one** intent: "Resolve the $4,200.00 shortfall". `CaseFile.shortfall_cents` is a single number; nothing
  can carry the three causes.
- Tier 0 applies the cash AUTO (entry 1) and hands the whole $4,200 to the model tier. A fact only fires when it
  explains the **whole** shortfall (`src/router/tier0.ts:125`), so partial explanation never matches.
- No currency, rate, fee, entity or foreign amount exists anywhere: not in the schema, the bank CSV (exact header,
  exact field count, refused otherwise), `CaseFile`, fact scope, policy features, any agent tool, or the mirror.
- There is no FX account and no FX kind. The AR prompt and the Slack answer list offer four treatments; FX is not one.
- A EUR-denominated remittance advice does not match: both remittance checks need the **USD** bank total stated.
- The third leg works as built: `dispute_hold` → one question → scoped fact → `credit_memo`.

## Two ways to build it

**Cheap path, zero edits to `src/contract/` or `src/kernel/`.** GL, `Proposal`, `CaseFile` and chart stay USD. Lane B adds
a side table `bank_txn_fx(bank_txn_id, currency, foreign_amount_cents, rate_ppm, fee_cents)` in `schema-b.sql`, four
bank CSV columns (writer and parser together), the customer, contract, invoice, bank line, remittance advice (free
prose that states the USD total too), a bank credit advice, the Slack outage thread, a policy-memo section on FX and
bank charges, and the answer-key row. Fee and FX loss are booked as two `write_off` proposals to 6150 and **6990 Misc
expense**, which the kernel allows today. Cost of cheap: an accountant will object to FX in misc expense, and because
a write-off is a judgment amount, the $1,960 is over $500 and **parks for a click**, so the "fully evidenced, no human"
variant cannot be shown on the FX leg without a standing fact or an approved policy behind it.

**Right path, one additive contract change, the same size as `tax_withholding` was.** Account `7100 Realized FX
gain/loss`, kind `fx_realized`, and one deterministic kernel check: foreign amount × (booked rate − settlement rate) =
the line, both rates from cited sources. Then FX is re-performed arithmetic like an exact cash match, not judgment,
and the story's central claim ("only the EUR 2,000 needed a person") is true in the ledger. This is lane A's kernel
plus the joint contract; lane B supplies the rates as evidence.

**Recommendation:** start on the cheap path now (it is all lane B and blocks nobody), and let A decide at Gate 1
whether the 7100 check goes in. The fixtures are identical either way.

## The five variants, as plants

| Variant (team roadmap) | Plant | Expected |
|---|---|---|
| Missing authority (**the main scene**) | The July wire above. Slack `#cs-escalations` proves the outage happened; the contract says credits need written officer agreement; nobody gave it | cash AUTO; fee and FX per the path chosen; EUR 2,000: ESCALATE, one question to the account owner, answer stored with party, treatment, ceiling, validity, approver |
| New in-scope invoice | A second July invoice to the same customer (a separate add-on subscription), paid a week later, again net of an outage credit inside the answer's ceiling and dates. Needs a **standing** answer; avoids seeding August | booked from code, 0 model calls, nobody asked |
| Out-of-scope counterexample | A different customer withholds for "the outage" | the fact is not loaded for another party; failed dimension shown; asks |
| Fully evidenced | A customer whose contract has an SLA credit clause with a formula, an incident report with the duration, and an approved standing fact or policy covering it | posts with no person **only if** existing autonomy rules allow it; if the kernel parks it, we report that and do not bypass |
| Identical replay | Re-run the month | nothing posts twice, nothing is asked twice. Called idempotency on stage, not learning |

Scope by party stands in for scope by currency and entity (one EUR customer, one entity), so fact scope needs no new
dimension. The answer key stays in `world/answer-key.json`: gitignored, no table holds it, agents have no file tools.

## Decisions for Gate 1 (each takes minutes; all block real code except the first four lane B items)

1. Booked rate 1.10 (three causes) or 1.08 (two)? **Proposed 1.10.**
2. FX: cheap path (6990, parks) or the 7100 check (A + contract)? **Proposed: cheap now, 7100 if A has an hour.**
3. Does the fee ride `SHORT-PAY-01`-style compiled history, or policy-memo cover? Codex's scope rule means a new customer
   does not inherit the old wire-fee rule, so **proposed: policy-memo cover and it parks under $500 rules as they stand.**
4. Standing answer wording for variant 2 (what the account owner "says"): amount ceiling, end date, one customer.
5. QuickBooks: **do not enable multicurrency on the sandbox** (Intuit does not let a company turn it off again; UNVERIFIED
   tonight, from memory of their docs). Mirror this scenario as a dry run, or USD amounts with EUR in the memo.
6. Customer name, and whether the film-and-TV customer names get renamed at the same time (`DEMO_DOCUMENTS.md`).
7. For Preet: is the reader's task on this scene "bank credit advice + remittance advice → JSON (currency, foreign
   amount, rate, fee, deductions with reasons)"? Lane B can emit held-out variants of both documents with gold labels.

## Lane B build order once 1-4 are answered (or on the proposed defaults)

1. `src/seed/generate.ts` + `world.ts`: customer, contract text in EUR, both July invoices, bank lines, remittance and
   bank advice mail, Slack thread, policy-memo section, answer-key rows. Regenerate `world/northwind.json`.
2. `schema-b.sql` `bank_txn_fx`; bank CSV columns in `src/seed/local.ts` and `src/connectors/local.ts` together;
   ingestion stays the only writer of bank data.
3. Seeder books the invoice at the booked rate; F3 tie-out must hold before any proposal.
4. Test: from reset, code-only pass gives entry 1 AUTO, one intent left with the right residual; books tied.
5. Console intent header: original currency, rate, fee, and the three-cause split once decisions exist.
6. With a model key: the main scene end to end, then variants 2, 3, 5. Measured counts into the status log.
7. Gmail and Slack live seeding of the new documents; QuickBooks per decision 5.
