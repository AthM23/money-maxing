# Documents for the demo: what real ones look like, and what to change in the seed

Status: **proposal from Person A, 2026-09-19 22:26 ET**, for lane B's generator (`src/seed/generate.ts`,
`world/northwind.json`). Companion to `DEMO_STORY.md`. The judges' point: fake data is fine, unrealistic data is not,
and a workflow that exists only for the demo shows. Everything below is cheap: text and labels, no new logic, ids stay.

## 1. What gives the current world away

- **Customer names are film and TV companies** (Initech, Hooli, Pied Piper, Stark, Wayne, Cyberdyne, Tyrell, Soylent,
  Umbrella, Vandelay, Acme, Globex). A finance judge reads that as a toy in one second. **Keep every id** (`initech`,
  `wayne`, tests and the story depend on them) and change only `name`, email domains and signatures. Suggested:
  initech → Halvorsen Freight Systems · wayne → Brightwater Health Partners · globex-labs / globex-holdings → Kestrel
  Analytics Ltd / Kestrel Group Holdings plc · stark → Ardent Aerospace · hooli → Lumen Retail Group · pied-piper →
  Tessellate Software · cyberdyne → Norvane Robotics · tyrell → Castellan Biotech · soylent → Fernhill Foods ·
  umbrella → Meridian Infotech Pvt Ltd (Bengaluru; the withholding-tax customer) · vandelay → Ostrander Imports ·
  acme → Pallister Manufacturing.
- **One entity, one currency, one bank account called "operating".** Kiteworks is 10 entities, 7 currencies, 66
  accounts, 20+ banks. Labels are enough: `entity` (Northwind Systems Inc · Northwind Systems Ltd · Northwind Systems
  Pte Ltd), `currency`, and a named account on every bank line (First Harbor USD operating ··4417 · First Harbor USD
  lockbox ··4425 · Barclays GBP ··0193 · Barclays EUR ··0207 · DBS SGD ··8821 · DBS USD ··8834). The ledger can stay in
  USD for the demo; say so.
- **$172k a month of billing is not a $60M company.** Say on screen that July is a slice: "12 of Northwind's 310
  customers", rather than scaling the numbers.

## 2. Bank lines, shaped the way banks send them

Real descriptors are noisy, and the noise is where the matching difficulty lives. Replace the clean ones with:

- ACH, corporate payment with addenda (CCD+):
  `ORIG CO NAME:LUMEN RETAIL GRP ORIG ID:9215550143 DESC DATE:260716 CO ENTRY DESCR:PAYABLES SEC:CCD TRACE#:021000028841207 EED:260716 IND ID:0004417 IND NAME:NORTHWIND SYSTEMS INC RMR*IV*INV-1043**18000.00`
- ACH with no invoice reference (match on payer and amount only):
  `ORIG CO NAME:FERNHILL FOODS CO ORIG ID:1470082216 CO ENTRY DESCR:VENDOR PMT SEC:CCD TRACE#:091000019920455 IND NAME:NORTHWIND SYS`
- International wire with charges deducted on the way (this is what a "wire fee" short-pay really is: SHA or BEN charges):
  `WIRE TYPE:INTL IN DATE:260720 TRN:2026072000418832 SNDR REF:ARD-PAY-77120 ORG:ARDENT AEROSPACE GMBH OBI:INV-1041 JULY PLATFORM FEE CHGS:SHA INTERMEDIARY DED USD 25.00`
- One payment for three invoices:
  `ORIG CO NAME:CASTELLAN BIOTECH CO ENTRY DESCR:AP BATCH SEC:CTX TRACE#:121000248830117 RMR*IV*INV-2001**5000.00\RMR*IV*INV-2002**2500.00\RMR*IV*INV-2003**1250.00`
- Parent paying for a subsidiary: `ORG:KESTREL GROUP HOLDINGS PLC OBI:KESTREL ANALYTICS LTD INV-1038`
- Net of tax withheld at source: `WIRE TYPE:INTL IN ORG:MERIDIAN INFOTECH PVT LTD BENGALURU OBI:INV-1071 NET OF TDS`
- A processor payout that nets fees and covers many invoices (HiBid's pain):
  `STRIPE TRANSFER ST-K8R2M4X1 NORTHWIND SYSTEMS INC` for 9 card payments less 2.9% + 30¢ each, with the payout report as its own document.
- A deposit nobody can identify: `REMOTE DEPOSIT CAPTURE CHECK 004417 LOCKBOX 881204`

## 3. Remittance advice: the document the clerk actually works from

Most B2B payments are explained by a separate email from the customer's AP team, not by the bank line. Seed them as
mail traces, sent the same day or a day after the money:

> Subject: Remittance advice — Brightwater Health Partners — payment 07/16/2026
> Payment amount USD 29,700.00 · ACH · Trace 091000019920455
> Invoice INV-1048 · gross 33,000.00 · **deduction 3,300.00 · reason code 07 (service credit per account team)** · net 29,700.00
> Questions: ap-inquiries@brightwaterhealth.test

That one line turns Wayne's case from "a mystery number" into what really happens: the customer claims a deduction, names
a reason, and nobody on our side has a record of agreeing to it. The agent still finds no officer approval and still asks.

Withholding (already in lane A's demo world as `tr_mail_7`; reuse the wording):
> tax has been deducted at source at 10% (USD 1,800.00) and deposited with the Government of India. Form 16A for the
> quarter will follow by 15 August.

## 4. AP documents, for the breadth line

A purchase order (`PO-2026-0412`, 40 × monitoring seats at $100), a goods or service receipt dated before the bill, a
bill that ties, one billed for 40 where 32 were received, the same bill re-sent with a new invoice number and a total
one dollar different (lane A's duplicate-obligation check now catches it), and the classic fraud email:

> Subject: URGENT: updated remittance details for Observa Monitoring
> Please note our bank has changed. Effective immediately remit all payments to: Account 7730021984, Routing 026009593.
> Kindly confirm once updated.

which must end in a hold and a call to a known contact, and is blocked even if a human clicks approve.

## 5. What each document buys in the demo

| Document | Story beat it makes real |
|---|---|
| Noisy ACH and wire descriptors, the CTX batch | Runs: code clears them anyway, with no model |
| Remittance advice with a reason code | The 2%: a claimed deduction is not an agreed one |
| TDS remittance note, later the certificate | The 2%: not a short-pay at all; a tax asset, remembered as a rate |
| Named bank accounts, entities, currencies | The Kiteworks shape: cash by currency, entity and region |
| Processor payout report | One deposit, many invoices, fees netted: collected vs in transit |
| Bank-change email | A block that holds even when a human approves |
