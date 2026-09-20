# Test invoice — Harborline Cloud HLC-129884

One vendor invoice as text, as a PDF and as a structured e-invoice, all agreeing to the cent.
Fictional parties, `.test` domains, invented identifiers: it is test data, not a copy of anyone's
invoice.

| File | What it is | Use it for |
|---|---|---|
| `HLC-129884.txt` | The invoice as an AP clerk reads it | the reader (`DocumentReader.read(documentText)`), eval cases, eyeballing |
| `HLC-129884.ubl.xml` | OASIS UBL 2.1, EN 16931 semantic model, Peppol BIS Billing 3.0 profile | structured-parse tests, mapping to `bill` |
| `HLC-129884.mail.json` | One `data/stores/mail.json` item carrying the invoice as an email + attachment body | the whole ingest path |
| `HLC-129884.pdf` | One page, the way a vendor's billing system prints it | PDF extraction, OCR, attachment handling, showing a judge |
| `render_pdf.py` | The reportlab generator behind the PDF | regenerating it, and producing the variants below |

## Why this invoice

It is the July 2026 Harborline Cloud bill — the one `pnpm demo:payables` deliberately leaves missing
so the close has something to accrue. The seeded July usage statement (`tr_gmail_hlc_july_usage`)
states **USD 21,480.00**, and this invoice totals exactly that, so the accrual and the actual tie.
Invoice number continues the seeded series (`HLC-118204`, `-121877`, `-125391`), terms are net 15
like the others, and it cites no PO — which is correct for usage billing and exercises the `no_po`
branch of `matchBill()`.

## The numbers

| # | Line | Qty | Unit | Price | Amount |
|---|---|---:|---|---:|---:|
| 1 | Compute, general purpose (240 vCPU × 744 h) | 178,560 | HUR | 0.064000 | 11,427.84 |
| 2 | Compute, memory optimised (30 vCPU × 744 h) | 22,320 | HUR | 0.091000 | 2,031.12 |
| 3 | Block storage SSD | 42,000 | E34 | 0.080000 | 3,360.00 |
| 4 | Object storage standard | 96,000 | E34 | 0.021000 | 2,016.00 |
| 5 | Managed PostgreSQL (2 × 744 h) | 1,488 | HUR | 0.520000 | 773.76 |
| 6 | Egress | 14,016 | E34 | 0.080000 | 1,121.28 |
| 7 | Support plan, Business | 1 | MON | 750.000000 | 750.00 |
| | **Total due** | | | | **21,480.00** |

744 is the number of hours in July, so every quantity is a whole number of instance-hours.
Tax is 0.00 under an exemption, not omitted: the tax block is present with category `E` and a reason,
which is what a parser has to cope with.

## Standards the files follow

- **UNCL1001 `380`** — commercial invoice (BT-3).
- **EN 16931-1:2017** business terms, annotated in the XML as `BT-`/`BG-` comments.
- **UBL 2.1** syntax; `CustomizationID` declares the Peppol BIS Billing 3.0 profile.
- **ISO 4217** currency, **ISO 8601** dates, **ISO 3166** country codes.
- **UN/ECE Rec 20** unit codes: `HUR` hour, `E34` gigabyte, `MON` month.
- **UNCL4461 `30`** credit transfer (BT-81); **UNCL5305 `E`** exempt (BT-118).
- The ABA routing number `125181286` passes the standard 3-7-1 checksum, so validation-on-parse has
  something real to check. (Heads up: the routing numbers seeded in `world/northwind.json`, e.g.
  `021000011`, do **not** pass that checksum — fine today, a trap if you ever validate them.)

Three details are deliberately outside the EU profile because this is a US domestic invoice, and a
strict Peppol schematron run will flag them: EAS `EM` for the endpoint identifier, `TaxScheme/ID`
of `LOC` (local sales tax) rather than `VAT`, and an EIN where a VAT identifier is expected. Swap
those three for a schematron-clean EU variant.

## Feeding it in

The whole path, through the mail store:

```bash
node -e "const fs=require('fs'),p='data/stores/mail.json',m=JSON.parse(fs.readFileSync(p,'utf8'));m.push(JSON.parse(fs.readFileSync('fixtures/invoices/HLC-129884.mail.json','utf8')));fs.writeFileSync(p,JSON.stringify(m,null,2))" && pnpm ingest
```

Two things to know before you run it:

1. **The vendor has to exist.** `harborline` is only in the db after `pnpm demo:payables`.
2. **Party resolution needs an alias.** `localMail` hands ingest only the email addresses, and
   `buildResolver` matches a counterparty by domain from the `alias` table. `seedPayablesSide`
   inserts the party with no alias rows, so without this the trace lands with `party_id = null`:

   ```sql
   INSERT INTO alias (party_id, alias) VALUES ('harborline', 'harborline-cloud.test');
   INSERT INTO alias (party_id, alias) VALUES ('harborline', 'HARBORLINE CLOUD');
   ```

For the reader alone, skip all of that and pass `HLC-129884.txt` straight to `read()`.

To regenerate the PDF after editing `INVOICE` in the generator:

```bash
pip install reportlab && python fixtures/invoices/render_pdf.py
```

Line amounts are computed in cents from quantity x unit price, so the PDF cannot drift a rounding
cent away from the text and the XML. `pdftotext -layout` and `pdfplumber` both read it back
cleanly - it is real text, not an image. If you want a scanned-looking variant for an OCR path, say
so and it can be rasterised.

## Knobs, for the cases that matter

- **Over-bill** — change line 1 to `186,000` hours (`11,904.00`); the total becomes `21,956.16`.
  The invoice now exceeds the usage statement and the accrual by 476.16 and somebody has to explain
  it. In `render_pdf.py` that is one number and a re-run.
- **Duplicate** — copy the file, change the number to `HLC-129885` and the total by one cent. That
  is the re-numbered-bill case the duplicate-obligation check is supposed to catch.
- **Changed remit-to** — edit the routing and account and watch it get held rather than paid. The
  text already carries the counter-warning a real vendor prints, so the agent has something to
  weigh.
- **Tax** — set `tax_rate` to `0.0625` in `render_pdf.py` (category `S` in the XML): tax 1,342.50,
  total 22,822.50.
- **Allowance (BT-92)** — add a `cac:AllowanceCharge` with `ChargeIndicator false`, then
  `LineExtensionAmount` and `TaxExclusiveAmount` stop being equal, which is where naive mappers
  break.
