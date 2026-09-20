# Gate 1: lane A's answers to the international fixture proposal

Status: **Person A, 2026-09-20 23:56 ET.** Answers to `FIXTURE_INTL_PROPOSAL.md`, so lane B can seed without waiting.
Anything marked BUILDING is being written by lane A now and is not on `main` yet; its shape below is a commitment.

| # | Question | Answer |
|---|---|---|
| 1 | Booked rate | **1.1000.** Three causes is the scene. Receipt rate 1.0800, fee USD 40.00 |
| 2 | FX | **The right path, lane A builds it now.** Account `7100 Realized FX gain/loss`, kind `fx_realized`, kernel check re-performing `foreign amount × (booked rate − settlement rate)`. FX in misc expense would be wrong in front of finance judges, and as a write-off it would park for a click, which breaks "only the EUR 2,000 needed a person" |
| 3 | The $40 fee | **Compiled history, not memo cover.** Seed Q2 intermediary-charge write-offs for this customer (three or more, $15 to $45, to 6150) so it is inside `SHORT-PAY-01`'s customer scope. Lane A makes the rule test the **fee component**, not the whole $4,200. With memo cover only, a model would have to infer it and it would park |
| 4 | Standing answer | A **rate, not an amount**: "SLA credit of 2% on invoices for June to September 2026 service, this customer only, approved by the CFO", `credit_memo`, standing, valid to 2026-09-30. EUR 2,000 is 2% of EUR 100,000, so variant 2 (the add-on invoice) should withhold 2% of its own total and will match without asking. A fixed amount would not generalise honestly |
| 5 | QuickBooks | Agreed: do not enable multicurrency. Mirror as a dry run, USD amounts with the EUR in the memo |
| 6 | Names | Agreed: rename display names, keep every id. The EUR customer should not be a film company either |
| 7 | Preet's reader on this scene | Yes: **bank credit advice → {currency, foreign amount, rate, fee}** and **remittance advice → {invoice, gross, deduction, reason}**. The harness will believe a reading only if every number is in the document's own words and the arithmetic ties to the bank line, exactly as it does for remittances today (`src/worker/readRemittances.ts`) |

## The data contract for FX (BUILDING; additive, in `src/contract/schema.sql`)

Lane B proposed `bank_txn_fx` in `schema-b.sql`. Please **do not create it there**: lane A is adding both tables to the
contract schema with these exact columns, because the kernel context reads them.

```sql
CREATE TABLE IF NOT EXISTS invoice_fx (      -- one row per invoice billed in a foreign currency
  invoice_id TEXT PRIMARY KEY REFERENCES invoice(id), currency TEXT NOT NULL,
  foreign_total_cents INTEGER NOT NULL,      -- EUR 100,000.00 -> 10000000
  booked_rate_ppm INTEGER NOT NULL           -- USD per 1 unit, x 1,000,000: 1.1000 -> 1100000
);
CREATE TABLE IF NOT EXISTS bank_txn_fx (     -- one row per receipt converted by the bank
  bank_txn_id TEXT PRIMARY KEY REFERENCES bank_txn(id), currency TEXT NOT NULL,
  foreign_amount_cents INTEGER NOT NULL,     -- EUR 98,000.00 -> 9800000
  rate_ppm INTEGER NOT NULL,                 -- 1.0800 -> 1080000
  fee_cents INTEGER NOT NULL DEFAULT 0,      -- USD 40.00 -> 4000
  advice_trace_id TEXT                       -- the bank's credit advice; it must state the foreign amount, the rate and the fee
);
```

`invoice.total_cents` and `open_cents` stay **USD at the booked rate** (11,000,000 cents), so F3 ties as it does today.
`bank_txn.amount_cents` is the USD deposited (10,580,000). The advice text must contain `98,000.00`, `1.0800` and
`40.00` verbatim: the kernel checks the entry's numbers against the bank's own words.

## What the harness will do with the main scene (BUILDING)

One intent, four entries, each on its own terms:
1. `apply_payment` Dr 1000 / Cr 1200 **105,800.00**: code, posts alone (as today).
2. `write_off` Dr 6150 / Cr 1200 **40.00**: code under `SHORT-PAY-01`, tested on the fee component.
3. `fx_realized` Dr 7100 / Cr 1200 **1,960.00**: code; arithmetic the kernel re-performs from the two tables and the
   cited advice; not a judgment amount, so it does not park at $500.
4. The remaining **2,200.00** (EUR 2,000 at the booked rate): the judgment tiers get a case that says exactly that, with
   the first three already explained. Missing authority → one question → a standing 2% answer → `credit_memo` with a
   person's approval → remembered, scoped to this customer, to 2026-09-30.

Variants 2 to 5 then need no further harness work beyond this, except that a fact must match the **residual**, not the
whole shortfall (part of the same change).

## What lane B can seed right now, independent of the above

Customer, EUR contract text, both July invoices (USD at the booked rate, plus the `invoice_fx` row), the bank line and
its `bank_txn_fx` row, the bank credit advice and the remittance advice as mail, the Slack outage thread, the policy
memo section, three or more Q2 fee write-offs for this customer, and the people. The supporting cast for the rest
of the global July (ten USD receipts, already running end to end) is in `SCENARIO.md` and importable from
`src/demo/scenario/`.
