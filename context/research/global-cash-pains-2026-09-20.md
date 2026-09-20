# Global cash application — what actually goes wrong (2026-09-20)

Extends `maximor-site-deep-read-2026-09-19.md`, `FIXTURE_INTL_PROPOSAL.md`, `GATE1_ANSWERS_A.md`, `SCENARIO.md`.
Repo chart: 1000 Cash, 1200 AR, 1350 WHT receivable, 2100 customer deposits, 6150 bank charges, 7100 realized FX.
"Inference" marks my reasoning, not a source.

## 1. The pains, ranked by how often practitioners name them

**1. Correspondent bank fee taken in transit (SHA).** SHA is the market default: the sender pays its own bank,
correspondents deduct from the principal en route, so the beneficiary is short by an unannounced amount
([paymentbrief](https://paymentbrief.com/articles/swift-charge-options-our-sha-ben/),
[MTFX](https://www.mtfxgroup.com/post/intermediary-bank-fees-our-sha-ben/)). Fees vary by bank, currency and corridor;
OUR does not fully prevent them. Charge option is MT103 **71A** (pacs.008 `ChrgBr`); deductions appear in
**71F/71G**. Entry: Dr 6150 / Cr 1200. **Arithmetic** (invoice − deposit − FX = fee) once the advice states it;
**judgment** only on *who bears it*, a contract term. Evidence: bank credit advice, 71F, camt.053 `Chrgs`.

**2. Realized FX on settlement.** The invoice is booked at the transaction-date rate, cash arrives at the settlement
rate, and the difference is realized into P&L in the period it arises (ASC 830-20 / IAS 21,
[Deloitte DART 4.3](https://dart.deloitte.com/USDART/home/codification/broad-transactions/asc830-10/roadmap-foreign-currency-transactions-translations/chapter-4-foreign-currency-transactions/4-3-subsequent-measurement-foreign-currency),
[IFRS Community](https://ifrscommunity.com/knowledge-base/ias-21-effects-of-changes-in-foreign-exchange-rates/)).
Entry: Dr 7100 / Cr 1200 (or Cr 7100 on a gain) — a named P&L line, **never** misc expense. **Pure arithmetic**:
foreign amount × (booked − settlement rate), both rates cited. Evidence: two rate sources plus the advice.

**3. Remittance information lost or truncated.** MT103 field 70 carries ~4×35 characters; MT940 compresses
counterparty, reference and bank transaction code into length-limited free-text **tag 86**, so invoice numbers must be
guessed by string matching
([dev.to](https://dev.to/zerolooplabs/swift-is-killing-mt940-heres-how-to-future-proof-your-bank-statement-pipeline-267i),
[gravam](https://gravam.com/blog/bank-statement-formats-mt940-camt053-bai2)). camt.053 has structured `RmtInf/Strd`,
but only if every bank in the chain populated it
([sepaforcorporates](https://www.sepaforcorporates.com/swift-for-corporates/a-practical-guide-to-the-bank-statement-camt-053-format/)).
HighRadius names missing remittance and wrong invoice number as the classic exceptions
([HighRadius](https://www.highradius.com/resources/Blog/cash-application/)). Cash sits unapplied. **Judgment** until a
document says otherwise, then arithmetic.

**4. Customer pays in a currency other than the one invoiced.** The buyer converts at its own rate and date; the seller
receives a third amount after its bank converts again. Reconciling the two conversions is where exporters lose match
rates — 3–4× harder than domestic AR
([Reevol](https://academy.reevol.com/en/customer-to-cash/cash-application-automation-for-exporters/)). Cash posts at
the seller's settlement rate and the whole residual is FX, **not** a short-pay. **Arithmetic** given that rate;
**judgment** on who carries conversion risk. Evidence: an advice stating both legs.

**5. Which rate, whose rate, and rounding.** ERPs hold rate *types* — NetSuite ships Corporate Spot, Corporate Average
and Local Statutory, plus a dedicated **Rounding Gain/Loss** account alongside Realized and Unrealized
([Oracle](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1409370.html)). Two defensible rates
(bank's actual vs the ERP daily table) differ by cents on a six-figure invoice. **Arithmetic** once policy names the
source; **judgment** is choosing source and tolerance. Evidence: the dated rate-table row, or the advice.

**6. Month-end remeasurement of open foreign receivables (unrealized FX).** Monetary items are remeasured at each
balance-sheet date and again at settlement, so unrealized and realized land in the right periods
([DART 4.3](https://dart.deloitte.com/USDART/home/codification/broad-transactions/asc830-10/roadmap-foreign-currency-transactions-translations/chapter-4-foreign-currency-transactions/4-3-subsequent-measurement-foreign-currency),
[IAS 21](https://iasplus.com/en/standards/ias/ias21)). Entry: Dr/Cr 1200 / Cr/Dr 7150 Unrealized FX; NetSuite uses a
separate Unrealized Gain/Loss account
([Oracle](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1428662.html)). **Arithmetic.** Trap:
remeasure, then compute realized FX from the *original* booked rate, and you double-count.

**7. Partial payment in foreign currency.** FX is realized only on the slice settled; the remainder stays at its booked
rate until cash-settled or remeasured at period end (IAS 21, above). Entry: Dr 1000 + Dr/Cr 7100 on the settled slice
only. **Arithmetic**; the *reason* for the remainder is judgment.

**8. Withholding tax at source.** India's Section 195 has **no threshold** — if the payment is taxable in India, tax is
deducted before remittance ([ClearTax](https://cleartax.in/s/section-195),
[Winvesta](https://www.winvesta.in/blog/businesses/section-195-tds-on-foreign-payments-the-complete-compliance-guide-for-indian-businesses-in-2026));
SaaS fees are treated as royalty or fees-for-technical-services, treaty-rate dependent
([eDarpan](https://www.edarpan.com/blog/tds-software-saas-payments-india)). The certificate is **Form 16A**, from
TRACES within 15 days of the Form 27Q due date — **the evidence arrives months after the cash**. Maximor names this
risk ([Maximor](https://www.maximor.ai/blog/indirect-tax-usage-based-billing)). Entry: Dr 1350 / Cr 1200. **Judgment**
until a certificate or authorised answer exists (tax vs dispute vs discount); **arithmetic** once the rate is known.
Brazil and Indonesia deduct similarly — not verified tonight, name no rates.

**9. Payment from a different legal entity, or into the wrong entity's account.** Parents routinely pay subsidiaries'
debts and debit an intercompany balance ([Practical Law](https://uk.practicallaw.thomsonreuters.com/1-519-3026),
[NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/intercompany-accounting.shtml)). Two cases:
(a) a third-party payer — kernel refuses the party tie, needs an approved-payer fact; (b) cash into the *wrong seller
entity's* account — Dr 1000 (B) / Cr **2900 Due to A**, mirrored Dr 1500 Due from B / Cr 1200 in A, eliminated on
consolidation. Kiteworks is the shape: 10 entities, 7 currencies, 66 accounts, agents "translate currencies and
eliminate intercompany transactions" ([Maximor](https://www.maximor.ai/case-study/kiteworks)). **Arithmetic** once
authority exists; **judgment** on whether this payer may pay for that customer.

**10. VAT/GST short-pay.** Under the EU reverse charge the seller invoices **without VAT** and the buyer self-accounts
([Avalara](https://www.avalara.com/us/en/vatlive/eu-vat-rules/eu-vat-returns/reverse-charge-on-eu-vat.html),
[Fonoa](https://www.fonoa.com/resources/blog/eu-reverse-charge-what-is-it-and-who-is-it-for)). The failure mode is the
mirror image: the seller *did* charge VAT (VAT ID invalid or unvalidated) and the buyer pays net of it — a **billing
error, not a deduction**; credit note and reissue, never a write-off. **Judgment**; evidence is the validated VAT ID
and the invoice's Art. 226(11a) mention.

**11. Pooled and netted payments.** One wire pays many invoices across several selling entities, net of credit notes;
netting centres compute one figure per counterparty
([Tipalti](https://tipalti.com/resources/learn/multilateral-netting/),
[bill.com](https://www.bill.com/learning/netting)). Nothing ties unless a remittance file is parsed; cash splits
across several AR subledgers, possibly across entities (#9). **Arithmetic** given the remittance; otherwise
unapplied.

**12. Value date vs booking date at period end.** Statements carry both (`BookgDt`, `ValDt`). Cash recorded by the
company in one period and by the bank in the next is a deposit in transit
([Numeric](https://www.numeric.io/blog/bank-reconciliation)) — a cutoff difference, not a missing payment.
**Arithmetic.** Lockboxes widen the gap. Inference: ranked low — a rec item, not a match failure.

**13. Returned, recalled or held wires.** A beneficiary name mismatch or AML/sanctions hit returns or freezes the
payment; a true SDN match is blocked in an interest-bearing account
([Xe](https://xe.com/blog/business/returned-international-payment-playbook-7-steps-to-recover-funds-and-resend),
[transnationalmatters](https://www.transnationalmatters.com/ofac-hold-on-wire-transfer/)). Reverse the application,
re-open the invoice. **Judgment** — never auto-resolve a compliance hold.

**14. Duplicates and overpayments.** Held as unapplied cash, not revenue and not a discount
([HighRadius](https://www.highradius.com/resources/Blog/cash-application/)). Dr 1000 / Cr 2100. **Judgment** on
disposition.

## 2. What a correct system must know, per receipt and per invoice

Per **invoice**: currency; foreign total; booked rate + its source and date (ERP rate-table row or contract-fixed);
selling entity; tax treatment (VAT charged / reverse charge / withholding expected) and the customer's VAT ID;
contract clauses on bank charges, FX risk and SLA credits.

Per **receipt**: bank account and owning entity; **value date and booking date** (camt.053/BAI2/MT940); foreign amount
credited; the bank's conversion rate; fees deducted (71F/71G or `Chrgs`); charge option 71A; originating party name
and country (often *not* the customer); remittance reference (field 70 / `RmtInf`, often truncated); tax withheld and
certificate reference (arrives later); trace id of every document quoted.

Reality check: rate and fee exist **only** in the bank's credit advice, not the statement feed; the deduction reason
**only** in a remittance advice or email; the payer's authority **only** in a contract or inbox. Hence "read the
document, re-perform the arithmetic".

## 3. Automatable vs not

**Arithmetic — no person:** realized FX from two cited rates; the fee as the residual after FX when the advice states
it; unrealized remeasurement and its reversal; splitting a pooled wire across invoices a remittance names; spotting a
duplicate; cutoff classification; applying a stated withholding rate.

**Judgment — ask once, remember with scope:** who bears bank charges; whether a deduction is tax, dispute, agreed
credit or billing error; whether a payer may pay for a customer; which rate source is authoritative and the rounding
tolerance; disposition of overpayments; anything under a compliance hold. Scope every answer by party, ceiling and end
date, as `GATE1_ANSWERS_A.md` does with the 2% SLA rate.

**The honest line:** a withheld amount is not a tax because the remittance says "TDS"; it is a tax when a certificate
or an authorised person says so. Until then book to 1350 and keep the evidence gap open.

## 4. Five highest-value additions, by credibility per build hour

**1. Name the FX P&L line and cite both rates on screen (in flight).** Seed `invoice_fx`, `bank_txn_fx`, advice text
containing `98,000.00`, `1.0800`, `40.00`. Check foreign × (booked − settlement) = the 7100 line, and cash + fee + FX +
residual = invoice. Show both rates and sources beside the entry. Don't claim multi-currency books.

**2. Split fee from FX, labelling charge option SHA on the advice.** Check the fee equals the advice's stated
deduction, not a plug. Show three causes, three entries, one wire. Don't claim you recover or predict the fee.

**3. Month-end unrealized remeasurement on one open foreign invoice, with its reversal.** Cheapest way to look like a
real close: an open EUR invoice at 6/30 to a 7150 account, reversed 7/1, realized FX at settlement still from the
**booked** rate. Show the two-period timeline. Don't claim CTA or equity translation.

**4. Wrong-entity receipt → intercompany due-to/due-from.** Seed a Kestrel-style wire into the Singapore account for a
UK invoice. Check both legs post, the pair eliminates, AR control ties. Show the cash-by-entity strip move. Don't
claim a consolidation engine.

**5. Withholding held as a receivable, certificate missing.** Seed "NET OF TDS", no Form 16A yet. Check the 1350
balance plus an evidence gap that closes when the certificate lands. Show the gap as a *balance*. Don't claim
treaty-rate determination.

## 5. Mistakes a finance judge would catch

FX to misc expense instead of a named FX gain/loss line. Realizing FX on the unpaid remainder. The invoice-date rate
on the cash leg, or a month-average for a spot settlement. Netting the fee into FX so neither is re-performable.
Withheld tax as a discount — it is a receivable with a certificate behind it. Ignoring month-end remeasurement, or
double-counting it against realized FX. A reverse-charge VAT short-pay called a deduction. A third-party payer's cash
applied without an approved-payer record. An overpayment cleared to revenue. A "daily cash view by currency and
entity" built on receipts that were all USD.
