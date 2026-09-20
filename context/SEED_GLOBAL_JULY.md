# The global July, seeded through lane B's real seeder and connectors

Status: **built and measured by lane B (AthM23 + Claude Code session), 2026-09-20.** It answers "Atharv: what to seed"
in [`SCENARIO.md`](./SCENARIO.md) and Gate 1 ([`GATE1_ANSWERS_A.md`](./GATE1_ANSWERS_A.md)). Generator:
`src/seed/globalJuly.ts` → `world/global-july.json` (committed). Tests: `src/seed/__tests__/globalJuly.test.ts`.

## What it is

A second world beside `world/northwind.json`, in the same `World` shape, so **every seeder target and every connector
is the same code for both**. It holds lane A's ten USD receipts, **imported from `src/demo/scenario/`, not retyped**,
plus the international scene: Aldenhoven Logistik GmbH (Duesseldorf), billed in euro from 1 July.

| | Main scene (`BTX-311` on `INV-3211`) | In-scope reuse (`BTX-312` on `INV-3212`) |
|---|---|---|
| Invoice | EUR 100,000.00 at 1.1000 = USD 110,000.00 | EUR 15,000.00 at 1.1000 = USD 16,500.00 |
| Customer paid | EUR 98,000.00 (2% withheld) | EUR 14,700.00 (2% withheld) |
| Bank converted at | 1.0800 = USD 105,840.00 | 1.0850 = USD 15,949.50 |
| Bank charges | USD 40.00 | USD 35.00 |
| Landed | **USD 105,800.00** | **USD 15,914.50** |
| Shortfall | 4,200.00 = FX 1,960.00 + fee 40.00 + withheld 2,200.00 | 585.50 = FX 220.50 + fee 35.00 + withheld 330.00 |

Q2 for this customer (billed USD 110,000 a month until the euro amendment): three international wires short by $25,
$40 and $35, written off by the team to 6150. With lane A's six that is nine decision points, and the fee on both euro
receipts is inside what `SHORT-PAY-01` compiles to (≤ $45).

## Why it is built the way a finance team would expect

- **The invoice is issued and paid inside July**, so no month-end remeasurement falls between booking and settlement
  and the realised FX is one clean number. The EUR 2,000 still open at 31 July would be remeasured at the closing rate
  at close. Nothing automates that; the policy memo says so and we should too if asked.
- **The withheld amount stays at the booked rate** (USD 2,200.00) until it is credited or collected: no cash has
  settled it, so no FX is realised on it. A credit memo against an invoice goes at the invoice's rate.
- **Why a euro wire lands in a USD account:** Northwind has no EUR account yet (the controller says so in `#finance`),
  so JPMorgan converts on the way in at its own rate and nets its charges. That is what a mid-size company without a
  multi-currency setup actually lives with, and it is why the rate on the advice is worse than the booked one.
- **The bank's credit advice** is laid out as the fields a cash team reads off an incoming wire: instructed amount,
  exchange rate applied, USD equivalent, charges deducted, net credited, ordering customer and institution, remittance
  information. It states `98,000.00`, `1.0800` and `40.00` in its own words, which is what lane A's kernel check quotes.
- **The customer's remittance is a German AP run's *Zahlungsavis*:** one line per invoice with gross, deduction and
  net in EUR, a vendor number, and the deduction's reason.
- **The order form has a real SLA exhibit:** 99.9% monthly availability; under 99.9% a 2% credit, under 99.0% 5%;
  claimed in writing within 30 days, validated against our records, **effective only when an officer confirms it, issued
  as a credit note, "Customer may not deduct a claimed credit from a payment"**. The outage was 6 h 40 min of a 31-day
  month = 99.10%, so the 2% tier is the right one and the claim is arithmetically sound. It also has the reverse-charge
  VAT clause a US vendor's German B2B contract carries, and "no tax is to be withheld".
- **So the evidence proves everything except authority.** Slack proves the outage and its length. The customer's email
  is a valid written claim and announces the deduction. The account owner's reply says he cannot confirm it. The
  controller says in Slack "Nothing is approved for Aldenhoven yet … AR holds the difference as disputed and we do not
  write it off." That is the missing-authority variant, and it is the everyday "customer took a deduction" problem.
- Periods now lock on the 6th of the following month, after the month-end entries, not on the 28th of the same month.

Not modelled, and not to be claimed: multi-currency books, a EUR bank account, month-end remeasurement, intercompany,
vendors and bills in this world (the Northwind world has AP), and closed months for customers whose history the story
does not need.

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

`invoice_fx` and `bank_txn_fx`, column for column as in `GATE1_ANSWERS_A.md`. Lane A's DDL has not landed in
`src/contract/schema.sql` yet, so identical `CREATE TABLE IF NOT EXISTS` statements sit at the end of
`src/ledger/schema-b.sql`; the contract schema runs first, so they become no-ops the moment lane A's land, and should
then be deleted. `invoice_fx` is written by the seeder. `bank_txn_fx` is written by **ingestion from the bank file's own
columns**, after the file's conversion control total passes (foreign × rate − fee = amount, to the cent, or the whole
file is refused). `advice_trace_id` is `tr_gmail_gj_m_advice_BTX_311`, and the same id is on the case file's
`trace_ids`, so whoever works the case starts from the bank's words.

## Measured (2026-09-20, no model key unless stated)

- `pnpm typecheck` clean; `pnpm test` → 71 files, **672 passing** (was 68 / 651).
- Drift opens **lane A's ten `CASES` field for field** (intent and trace ids aside) by its own rules, including case 9
  left undecided, plus the two euro receipts as short-pays of $4,200.00 and $585.50.
- Books before any agent: AR control = open invoices ($288,044.98), trial balance foots, GL cash = the four bank files.
- Through lane A's harness, code only: `SHORT-PAY-01 v1 · wire short ≤ $45.00 → 6150` drafted from 9 (8 exact, 1 other
  account, leave-one-out 6 of 8); worker: 12 cases, 11 decisions by code, 9 posted with no person, 2 parked, 0 model
  calls, 240 of 240 tick marks re-performed; audit pack 9 of 9 clean. The euro case gets its cash applied and waits
  with the $4,200.00 whole, **as expected until lane A's fee-component rule and `fx_realized` land**.
- Lane B's spine (revenue schedules, forecast, close checklist, mirror dry run) runs on this world with AR tied.
- **Live, verified:** Gmail 19 of 19 inserted and read back; Slack 6 of 6; ingesting `--live=gmail,slack` gives traces
  identical to the local stores (ids, parties, hashes, world timestamps), the same 12 cases with the same evidence ids,
  and a second pull commits nothing. QuickBooks sandbox: 13 customers and 13 July invoices created, `INV-3211` read back
  at USD 110,000.00 with "EUR 100000.00 at 1.1000" in the memo (single-currency company, as agreed); a re-run creates
  nothing. **Not run:** any model tier on this world, the desk's Slack round trip, the mirror live, the reader.
- Console checked in headless Chrome: strip and the euro line render.

## Two things found on the way

1. **The demo mailbox and Slack workspace are shared by both worlds.** Left alone, the Northwind world's CEO email
   ("Initech gets 10% off") arrives in the global July as unfiled mail, which the kernel's E5 accepts as a source. The
   seeder now writes `world.json` into the stores, and a live pull keeps only this world's seeded ids, this world's
   own mail recognised by content, and anything a person writes after the world's horizon (`src/connectors/index.ts`).
   The Northwind world's live ingest is unchanged (16 mail, 5 chat, 11 cases).
2. **Lane A's Halvorsen CEO email collided with the Northwind one** (same sender, second and subject), so the Gmail
   seeder took it for an existing copy and skipped the scene's key email. It is sent four minutes later in this world.
