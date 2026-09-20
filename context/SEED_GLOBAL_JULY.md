# The global July, seeded through lane B's real seeder and connectors

Status: **built and measured by lane B (AthM23 + Claude Code session), 2026-09-20.** It answers "Atharv: what to seed"
and "Atharv: seeding the main scene" in [`SCENARIO.md`](./SCENARIO.md), and Gate 1
([`GATE1_ANSWERS_A.md`](./GATE1_ANSWERS_A.md)). Generator: `src/seed/globalJuly.ts` → `world/global-july.json`
(committed). Tests: `src/seed/__tests__/globalJuly.test.ts`.

## What it is

A second world beside `world/northwind.json`, in the same `World` shape, so **every seeder target and every connector
is the same code for both**. It holds lane A's ten USD receipts and its main scene, **imported from
`src/demo/scenario/`, not retyped**: ids, amounts, dates, descriptors, the Slack message and the order form's section 7
are lane A's to the letter, and a test asserts that the drift monitor produces lane A's `CASES` and `MAIN_CASES` field
for field from the seeded bank files.

| | Main scene (`BTX-320` on `INV-3201`) | In-scope reuse (`BTX-321` on `INV-3202`) |
|---|---|---|
| Invoice | EUR 100,000.00 at 1.1000 = USD 110,000.00 (issued 15 June for Q3) | EUR 25,000.00 at 1.1000 = USD 27,500.00 (issued 1 July) |
| Customer paid | EUR 98,000.00 (2% held back) | EUR 24,500.00 (2% held back) |
| Bank converted at | 1.0800 = USD 105,840.00 | 1.0900 = USD 26,705.00 |
| Incoming wire fee | USD 40.00 | USD 25.00 |
| Landed | **USD 105,800.00** | **USD 26,680.00** |
| Shortfall | 4,200.00 = FX 1,960.00 + fee 40.00 + held back 2,200.00 | 820.00 = FX 245.00 + fee 25.00 + held back 550.00 |

## Why it is built the way a finance team would expect

Lane A fixed the facts. Lane B's job was that the books and documents around them survive a question from someone who
closes books for a living.

- **The invoice crosses a month end (15 June → 15 July), so June's close remeasures it.** Seeded history posts the
  month-end revaluation at the 30 June closing rate of 1.0900 (Dr 7150 Unrealized FX 1,000.00 / Cr 1200) and its
  reversal on 1 July, the way an ERP's revaluation run does. July therefore starts from the booked rate, the AR control
  account ties, and realised FX is still EUR 98,000 × (1.1000 − 1.0800). The controller says so in `#finance`.
- **It bills the third quarter in advance, so none of it is recognised in June** (`service_from` on the invoice; the
  seeder used to recognise every invoice in its issue month).
- **Vossberg's Q2 is real euro history, not a stub:** three monthly add-on invoices, each booked at that month's rate,
  each paid by euro wire with the bank's USD 40.00 / 40.00 / 35.00 fee written off to 6150 by the team (lane A's
  amounts and days), and **the rate going both ways**: a gain of 100.00 in April, a loss of 100.00 in May, none in June.
  That is nine Q2 decision points with lane A's six, and the fee on both July receipts is inside what `SHORT-PAY-01`
  compiles to (≤ $45.00).
- **The held-back amount stays at the booked rate** (USD 2,200.00) until it is credited or collected: no cash has
  settled it, so no FX is realised on it.
- **Why a euro wire lands in a USD account:** Northwind has no EUR account, so JPMorgan converts on the way in at its
  own rate and nets its fee. A mid-size company without a multi-currency setup lives with exactly this.
- **The bank's credit advice** is laid out as the fields a cash team reads off an incoming wire (value date, TRN,
  originator and its bank, remittance information, charges code, amount received, rate applied, USD equivalent, fee,
  net credit) and states every number lane A's `ADVICE_320` states. Kernel check F9 and the router quote `98,000.00`,
  `1.0800` and `40.00` from it; both pass on it, also when it has come back through the real Gmail mailbox.
- **The customer's remittance is a German AP run's *Zahlungsavis*:** one line per invoice with gross, deduction and
  net in EUR, a vendor number, and the deduction's reason in lane A's words (outage of 17 to 18 June, ticket NW-48213).
- **The order form** carries lane A's fee clause and section 7 word for word (a discretionary credit of up to 2%,
  effective only when an officer confirms it in writing), inside the clauses such a contract also has: payable in full
  **without set-off or deduction**, reverse-charge VAT for a German business customer (Article 196), no withholding.
- **So the evidence proves everything except authority.** Slack proves the outage. The customer's email asks for the
  2% in writing and announces that its AP will hold it back. The account owner replies that he cannot confirm it. The
  controller writes "Nothing is approved for Vossberg yet … AR holds the difference as disputed and we do not write it
  off." That is the missing-authority variant, and it is the everyday "customer took a deduction" problem.
- Periods now lock on the 6th of the following month, after the month-end entries, not on the 28th of the same month.

Not modelled, and not to be claimed: multi-currency books, a EUR bank account, remeasurement as an agent function
(the 30 June entries are seeded history; what is open at 31 July is not remeasured by anything), intercompany, vendors
and bills in this world (the Northwind world has AP), and closed months for customers whose history the story does not
need.

## Run it

```bash
# its own database and stores folder, so the Northwind world on this machine is left alone
export FOOTNOTE_DB=data/global-july.db FOOTNOTE_STORES=data/stores-global-july
pnpm seed --target=local --world=global-july --reset   # books, FX rows, labels, four bank files
pnpm ingest                                            # or: pnpm ingest --live=gmail,slack
pnpm learn  $FOOTNOTE_DB --replay --approve-as U_CTRL  # SHORT-PAY-01 from the nine Q2 decisions
pnpm worker $FOOTNOTE_DB --code-only                   # add a model key and drop --code-only for the judgment tiers
pnpm console                                           # cash strip by entity, bank account and country; EUR beside USD
```
`pnpm seed --target=world --world=global-july` regenerates the file; `--target=gmail|slack|quickbooks --world=global-july`
seed the live systems. `FOOTNOTE_WORLD=global-july` in `.env` does the same as the flag.

## What lane A reads

`invoice_fx` (written by the seeder) and `bank_txn_fx`, in lane A's contract tables. `bank_txn_fx` is written by
**ingestion from the bank file's own columns**, after the file's conversion control total passes (foreign × rate − fee
= amount, to the cent, or the whole file is refused). `advice_trace_id` is `tr_gmail_gj_m_advice_BTX_320`, and the same
id is on the case file's `trace_ids`, so whoever works the case starts from the bank's words. Closed months' euro
receipts have FX rows and no advice.

## Measured (2026-09-20, no model key)

- `pnpm typecheck` clean; `pnpm test` → 72 files, **686 passing**.
- Books before any agent: AR control = open invoices, trial balance foots, GL cash = the four bank files.
- **Through lane A's harness on the seeded world, code only:** `SHORT-PAY-01 v1 · wire short ≤ $45.00 → 6150` drafted
  from 9 (8 exact, 1 other account, leave-one-out 6 of 8). Worker: 12 cases, 15 decisions by code, 11 posted with no
  person, 4 parked, 0 model calls, 322 of 322 tick marks re-performed. On `BTX-320`: cash 105,800.00 AUTO and posted;
  **realised FX 1,960.00 to 7100 AUTO and posted, F9 re-performed against the seeded advice**; the 40.00 fee proposed
  under the rule and parked (write-offs have no track record on a fresh ladder, as with Ostrander's $38); EUR 2,000
  left for judgment. `BTX-321` the same with 245.00 and 25.00. AR tied. Audit pack: 11 of 11 re-performed clean, 0
  findings. The same learn and worker result on a database ingested from live Gmail and Slack (audit pack not run there).
- Lane B's spine (revenue schedules, forecast, close checklist, mirror dry run) runs on this world with AR tied. The
  forecast names the quarterly contract as a gap it does not project, rather than guessing.
- **Live, verified:** Gmail 19 of 19 and Slack 5 of 5 read back identical to the local stores (ids, parties, hashes,
  world timestamps); the same 12 cases with the same evidence ids; a second pull commits nothing. QuickBooks sandbox:
  13 customers and 13 invoices; `INV-3201` at USD 110,000.00 with "EUR 100000.00 at 1.1000" in the memo
  (single-currency company, as agreed); a re-run creates nothing. **Not run:** any model tier on this world, the desk's
  Slack round trip, the mirror live, the reader.
- Console checked in headless Chrome on the final world: the cash strip, the euro line on the case, the close
  checklist and the forecast render.

## Found on the way

1. **The demo mailbox and Slack workspace are shared by both worlds.** Left alone, the Northwind world's CEO email
   ("Initech gets 10% off") arrives in the global July as unfiled mail, which the kernel's E5 accepts as a source. The
   seeder now writes `world.json` into the stores, and a live pull keeps only this world's seeded ids, this world's
   own mail recognised by content, and anything a person writes after the world's horizon (`src/connectors/index.ts`).
   The Northwind world's live ingest is unchanged (16 mail, 5 chat, 11 cases).
2. **Lane A's Halvorsen CEO email collided with the Northwind one** (same sender, second and subject), so the Gmail
   seeder took it for an existing copy and skipped the scene's key email. It is sent four minutes later in this world.
3. **A first draft of this fixture (customer "Aldenhoven") reached the live systems before lane A's scene landed.**
   Cleaned up: its Slack messages deleted, its three QuickBooks invoices deleted and its customer deactivated (which
   also verified `QboClient.remove` and `deactivate` live for the first time). **Nine of its emails are still in the
   demo Gmail mailbox:** the token cannot trash mail. Ingestion ignores them; delete them by hand before showing the
   inbox (search `aldenhoven` for seven; the other two are "Your June statements are available" from
   `jpmorgan-access.test` and Fernhill's "July invoice INV-3201").
