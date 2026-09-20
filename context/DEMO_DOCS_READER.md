# Paste-ready documents for the "Read a doc, live" panel

Each was actually run through the GX10 endpoint on 20 Sep (outputs recorded below the doc). Latencies were
5 to 11 s because the 20B was training at the time; with the GPU free expect 1 to 2 s.
Order them easy to hard. Number 7 is the trap: use it to show why the kernel exists.

## 1. Clean SaaS invoice (trained family)
```
INVOICE
Vendor: Datadog
No: B-55102 | Issued 2026-09-14
Period 2026-09-01 to 2026-09-30
Due net 45
Total USD 8,420.00
```
Reacts: perfect vendor_bill, 842000 cents, net 45, period exact.

## 2. Remittance email covering three invoices (trained family)
```
Subject: Payment sent - Meridian Health Co
Hi team, we sent a wire today, Sep 16, ref W-77341.
Covering: INV-4101 for $5,000.00, INV-4102 for $2,500.00, and INV-4103 for $1,250.00.
Total $8,750.00. Thanks, AP team
```
Reacts: remittance with all three applications split to the cent, wire, correct date from "Sep 16".

## 3. Short-pay with an early-payment discount (trained family)
```
REMITTANCE ADVICE
Payer: Ridgeline Manufacturing
Date: 2026-09-15  Method: ACH  Ref: ACH-90218
Invoice INV-5220 gross USD 20,000.00
Less 2% early payment discount USD 400.00
Amount paid USD 19,600.00
```
Reacts: paid amount 1960000, discount_pct 2, discount_cents 40000, ACH, all exact. The per-invoice
application line is the kind of nuance the Checker re-performs, which is the point of the pipeline.

## 4. OCR-noisy scan (style NEVER in training)
```
R E M I T T 4 N C E   A D V 1 C E
P a y e r :  K@ppa  Log1stics  GmbH
Dat e: 2O26-O9-11   REF: W lRE-8834
1NV-6O12  ....  USD  12,5OO.OO
t0tal  pa1d  ....  USD  12,5OO.OO   v1a  w1re
```
Reacts: reads through the noise: date 2026-09-11 from "2O26-O9-11", 1250000 cents from "12,5OO.OO",
wire, payer kept as written. Say: this document style was locked out of training entirely.

## 5. German invoice layout (style NEVER in training)
```
RECHNUNG
Lieferant: Nordwind Logistik AG
Nr: B-77201 | Ausgestellt 2026-09-10
Zeitraum 2026-09-01 bis 2026-09-30
Zahlbar innerhalb 30 Tagen
Gesamtbetrag USD 6.750,00
```
Reacts: vendor_bill, 675000 cents from the European "6.750,00", 30 day terms from "innerhalb 30 Tagen".

## 6. Raw bank wire line (terse family)
```
WIRE IN TRN:2026091600239 ORG:PALLISTER MFG OBI:INV-3105 USD 4,500.00 VAL 2026-09-16
```
Reacts: remittance, payer Pallister Mfg, invoice INV-3105, 450000 cents, date from VAL.

## 7. VOID invoice, the trap (use this LAST, it is the kernel pitch)
```
INVOICE  ** VOID - DO NOT PAY **
Vendor: Cascade Supply Co
No: B-99310 | Issued 2026-09-13
This invoice was issued in error and is VOID.
Total USD 3,300.00
```
Reacts: the Reader extracts fields anyway, and even guesses terms that are not on the page. That is the
lesson, delivered on purpose: a model alone is not safe. In the pipeline, a deterministic rule catches
"VOID" and the entry never posts. This exact rule is how we threw out every trap document on the public
Invoice Sandbox benchmark, graded by their own script. Say: "The model reads. The kernel decides. Nothing
posts on a model's word alone."
