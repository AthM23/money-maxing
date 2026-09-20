# Scenario realism check: banking, payments and tax details

Written 2026-09-20 00:34 EDT by the realism-check agent, from `src/demo/scenario/documents.ts`, `mainScene.ts` and
`plants.ts`. No code edited. "Not verified" means no source was opened for it in this pass.

## Strings that must not change

- `CEO_QUOTE`, `TDS_QUOTE`, `PAYER_QUOTE`, `MEMO_TDS_QUOTE` (`standIns.ts` quotes them; kernel E2 needs exact substrings).
- `CHGS:BEN CORRESPONDENT DED USD 60.00` in BTX-304 (`standIns.ts` quotes it).
- In the bank advices: `98,000.00`, `1.0800`, `40.00`, `24,500.00`, `1.0900`, `25.00` (kernel F9 and the code tier
  quote them). The rate must stay four decimals with no digit after it: `1.080000` fails F9.
- The Castellan advice body (the reader stand-in in `rehearsal.test.ts` expects `RMT76314` and both amounts).
- Every `INV-nnnn` and customer name in a descriptor (drift monitor regex, alias matching); all amounts and ids.

## Verdicts

**1. ACH addenda `RMR*IV*INV-3101**8500.00`: fine.** A biller's real example is `RMR*IV*8255220010012345**2370.39\`:
qualifier, reference, an empty optional element, amount paid, backslash terminator
(https://www.dish.com/content/dam/dish-business/pdfs/ACH-Remittance-Guide.pdf). CCD+ has one 80-character addenda, so
one invoice (https://ordersync.io/guides/edi/820-payment-order). Ours lacks only the terminator. A real CTX wraps its
RMR segments in a whole X12 820; showing only the RMRs is a fair abbreviation. Optional polish (in TypeScript write
`\\`): BTX-301 `RMR*IV*INV-3101**8500.00\`; BTX-302
`RMR*IV*INV-3111**5000.00\RMR*IV*INV-3112**2500.00\RMR*IV*INV-3113**1250.00\`.

**2. Descriptor styles: fine, with an answer ready.** Chase prints wires as `Fedwire Credit Via: ... B/O: ... Obi=...
Imad: ... Trn: ...` (https://www.justanswer.com/tax/escuq-does-mean-fedwire-credit-via-pinnacle.html). Our
`WIRE TYPE:INTL IN ... TRN:` is Bank of America's style (weak source:
https://forum.wordreference.com/threads/pmt-det-abbreviations.1459693/), and the HSBC UK and DBS lines use it too,
with OBI, a Fedwire tag. No replacement: quoted spans depend on these lines. If asked: the bank feed normalises
descriptors across banks.

**3. `CHGS:SHA INTERMEDIARY DED USD 38.00`: fine as a plain rendering.** In the message this is 71A `SHA`, 71F
`USD38,00`, 33B `USD7300,00` instructed, 32A `USD7262,00` settled; 71F is mandatory under SHA or BEN when charges
were taken, once per bank (https://ohmyfin.org/swift-fields/71f). Under SHA each correspondent deducts from the
principal; under BEN the sender's bank fee comes out too
(https://paymentbrief.com/articles/swift-charge-options-our-sha-ben/). Deductions run "roughly $15 to $50 each"
(https://www.corpay.com/resources/blog/wire-transfer-fees), so 38.00, 60.00 and the Q2 history are plausible.
**On stage do not call MT103 current:** since 22 November 2025 cross-border instructions are
pacs.008, charge bearer `SHAR`/`CRED`/`DEBT`, charges itemised per bank in `ChrgsInf`
(https://www.ingwb.com/en/service/payments-and-collections/iso20022-swift-cbpr-update).

**4. `Incoming wire fee USD 40.00` and `USD 25.00`: adjust the label, keep the amounts.** Chase's published business
fee for an incoming wire is $15, domestic or international, effective 06/14/2026
(https://www.chase.com/content/dam/chase-ux/documents/personal/checking/biz-how-your-transaction-will-work.pdf). A
bank's own tariff does not move from 40.00 to 25.00 in a week; varying deductions look like correspondent charges.
Replace `Incoming wire fee USD 40.00.` with `Bank charges deducted USD 40.00.` (likewise `25.00`).

**5. Advice layout: adjust.** The fields are right; a real advice also gives the charge bearer and the remittance
reference. A judge would see this: the fee quote `40.00` first occurs inside `105,840.00`, so a first-match
highlight marks the wrong span (and the substring check E2 alone would not notice an altered fee sentence). Stating
the charge first fixes the highlight without code:

`ADVICE_320`: "Credit advice: incoming international wire, charges SHA. By order of VOSSBERG LOGISTIK GMBH, Hamburg. Remittance information INV-3201. Bank charges deducted USD 40.00. Amount received EUR 98,000.00. Exchange rate applied 1.0800 USD per EUR. USD equivalent 105,840.00. Net credit USD 105,800.00 to account ending 4417. Value date 2026-07-15."

`ADVICE_321`: the same with `INV-3202`, `25.00`, `24,500.00`, `1.0900`, `26,705.00`, `26,680.00`, `2026-07-22`.

**6. `1.0800 USD per EUR`, booked at 1.1000 a month earlier: fine.** The ECB quotes USD per one euro to four decimals
(https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html).
A 1.8% move in a month is unremarkable (inference; real 2026 rates not checked, by instruction).

**7. India tax, Meridian's email: wrong for July 2026.**
- For deductions from 1 April 2026, Section 195 of the 1961 Act is Section 393(2) of the Income-tax Act, 2025
  (https://blog.tdsman.com/2026/07/tds-on-payments-to-non-residents-section-3932-section-195/).
- Form 16A is now Form 131, Form 27Q is Form 144, Form 26AS is Form 168
  (https://eximpe.com/blog/payments/form-27q-form-144-tds-non-residents).
- The certificate is due 15 days after the quarterly statement: 15 August covers April to June; a July deduction is
  due 15 November (https://eztax.in/tds/tds-certificates-form16-16a-16b-16c-16d-16e-27d).
- 10% is right for the Singapore entity: the Act rate is 20%, and Article 12 of the India-Singapore treaty caps
  royalties and technical fees at 10% (https://incometaxindia.gov.in/DTAA/108690000000000077.htm). The India-US cap
  is 15% (https://beaconfiling.com/dtaa/royalty-tax-rate-india-usa), so never bill Meridian from Inc at 10%. The
  treaty rate needs a tax residency certificate and Form 10F (eximpe).
- Tribunals have held standard cloud subscriptions are neither royalty nor technical fees
  (https://taxguru.in/income-tax/cloud-subscription-fees-royalty-india-ireland-dtaa-itat-delhi.html); payers still
  withhold to be safe.
- The payer downloads the certificate from TRACES; the payee sees the credit in Form 168 once the payer's Form 144 is
  processed (eximpe).

Replace "As required under Section 195 of the Income-tax Act," with "As required under Section 393(2) of the
Income-tax Act, 2025 (formerly Section 195),". Replace "Form 16A for the quarter will follow by 15 August." with "The
TDS certificate, Form 131 (formerly Form 16A), for the quarter ending 30 September will follow by 15 November."
Optional, `standIns.ts` memo (not asserted): "India TDS u/s 393(2) (formerly 195) per remittance advice".

**8. German and Swiss wording: fine.** Zahlungsavis is the SAP and everyday term for a payment advice;
Kreditorenbuchhaltung is accounts payable (https://www.serkem.de/zahlungsavise-sap/). Change nothing.

**9. Bank and entity names: fine.** Real bank names as account labels raise no problem, and `.test` sender domains cannot
be mistaken for real ones. Do not put a real bank's logo on a made-up advice.
