# Architecture brief: AR / cash application, bank reconciliation, AP

For the diagram author. Date 2026-09-19. Scope: Footnote function packs 1 (AR), 3 (bank rec), 2 (AP), sitting on the shared layer: drift monitor -> intent -> router (compiled rule -> small model -> frontier) -> investigator -> `propose_entry` + workpaper -> kernel (F/E/P/J) -> post / controller / Slack -> scoped facts and policies -> replay/compile. Routes: AUTO / PROPOSE / ESCALATE / REFUSE / BLOCK. Claims I could not confirm against a primary source are tagged **UNVERIFIED**; choices that are ours rather than industry fact are tagged **DESIGN**.

## 0. Shared shape (draw once, reuse three times)

All three packs are one matcher with different populations. Draw it as a funnel whose stages are code, with the model attached only at side-ports:

`ingest + structural validation -> normalise (keep raw) -> resolve party to stable key -> block (candidate generation) -> exact pass -> directed pass (remittance / PO says which) -> tolerance pass (1:1 only) -> typed-delta pass (fee, discount, short-pay) -> bounded subset-sum (exact cents only) -> uniqueness gate -> residual classification -> propose -> kernel -> route`

Three rules that hold across packs:
- **Uniqueness, not existence, gates AUTO/PROPOSE.** Every pass returns *all* candidates up to 2; a second candidate forces ESCALATE (A-18, C-05). This is the Fellegi-Sunter three-zone decision (match / clerical review / non-match) applied to transactions [S12].
- **Never combine tolerance with grouping.** Oracle applies amount/percent tolerance only to one-to-one rules; group rules (1:N, N:1, N:M) match on exact sums [S6; read from Oracle's doc excerpt, page body not fetched]. Tolerance x subset-sum makes almost any deposit "explainable".
- **Subset-sum is NP-complete; bound it before solving** [S11]. Bounds (DESIGN): same resolved party (plus parent/child hierarchy), open items only, item date <= bank value date, n <= 24 items, integer cents, meet-in-the-middle O(2^(n/2)) or DP; above n, do not search: ESCALATE with the candidate list.

## 1. AR, cash application and collections

**Triggers and inputs.** Comparator `invoice vs cash received`: a bank credit (`bank_txn`, Increase inbound ACH/wire or file) with no applied `Payment`; comparator `AR subledger vs GL`; ageing sweep (invoice `due_date` < today, balance > 0); remittance email arriving in Gmail (`trace.kind=remittance`); a bank reversal/return line referencing a prior credit. A known fact (e.g. "Initech 10% off through renewal") suppresses the expected delta.

**Objects and keys.** Stable: `customer.id`, parent/child link, `invoice.id` + normalised invoice number, `bank_txn.id` (bank-assigned), ACH `originator_company_id` and trace number (Increase exposes `originator_company_id`, `originator_company_entry_description`, `addenda` [S10]); ISO 20022 `EndToEndId` / `AcctSvcrRef` where present [S9]. Mutable descriptors (evidence only, never rule predicates): bank description text, payer name string, memo, email subject.

**Pipeline, in order.**
1. Structural validation (field count, sign, date format, fiscal window): REFUSE the file, not half of it (F-01, F-02, F-04).
2. Normalise: integer cents, value date + posted date both stored, whitespace/encoding folded, raw kept.
3. Payer resolution: originator id -> alias table -> parent/child -> else model port A.
4. Remittance join: email/PDF advice linked by payer + amount + date window (-5/+3 days, DESIGN). If advice exists, apply **as directed**; no search.
5. Exact 1:1: amount == open balance and reference matches.
6. Near-reference 1:1: amount + party exact, invoice number at Damerau-Levenshtein distance 1 (transposition) and unique -> PROPOSE with the transposition named (A-12).
7. Typed-delta 1:1: residual tested against typed explanations in fixed order: known fact (concession) -> contractual early-pay discount -> wire-fee band learned per bank/corridor -> else *unclassified short-pay*.
8. Bounded subset-sum over that party's open invoices (A-05); exact cents.
9. Uniqueness gate: more than one solution -> ESCALATE, show all (C-05).
10. Residual: overpayment -> customer credit liability, never revenue (A-21); unresolved cash -> unapplied cash on the customer (suspense if payer unknown), never forced onto an invoice.
11. Return/reversal pairing: link the debit to its original by trace number / original reference, not by amount; reverse the application, reopen the invoice (A-15). For labels: unauthorised debits to non-consumer accounts must be returned by the second banking day; the 60-calendar-day window is consumer-only [S3]; originator-initiated reversals must reach the RDFI within 5 banking days and only for listed reasons (duplicate, wrong receiver, wrong amount, wrong date) [S4]. Standard returns (R01-R04) within 2 banking days is confirmed only from secondary sources. Northwind's customers push credits, so the realistic shapes are an originator *reversal* and a returned check. Keep a "provisional" flag on ACH receipts for 5 banking days (DESIGN).
12. Collections: ageing buckets in code; dunning stage from days past due and open disputes; an invoice under `dispute_hold` or with an unanswered escalation is excluded from chasing.

**Model ports.** (A) Payer entity resolution when keys fail: "which customer is `ACME CLOUD SVCS`?"; must cite the alias source (prior payment trace, contract signature block, CRM domain). (B) Remittance extraction from email/PDF: returns `{invoice_no, amount_cents}[]` with quoted spans; code re-adds them and rejects if the sum differs from the stated total. (C) Reason-finding for a residual: searches contract, CRM, mail, Slack; must return a quoted span and the predicate it supports (`pct_off`, `until`), or "not found" with the list of places searched. The model never chooses among equal-sum candidates.

**Kernel checks.** F: applications <= bank amount and <= each open balance; sum(applications) + residual lines == bank amount; AR subledger == control account; customer credit is a liability line. E: quote is a substring of its trace; party/amount/date tie; remittance total re-footed. P: credit memo / write-off over materiality has approver != preparer and within approval-matrix limit. J: fact active on the payment date and in scope (customer, contract, until-date). **Hard BLOCKs:** write-off or credit memo with no evidence trace; posting to a locked period (G-03); preparer == approver (G-02); policy-driven clear above the ceiling of whoever approved the policy (G-04); deleting or voiding an invoice to "clear" a bad debt (C-11).

| Outcome | Route | Entry / artifact | Notified | Cases |
|---|---|---|---|---|
| Exact or advice-directed full payment | AUTO | Dr Cash / Cr AR; QBO Payment | none | baseline |
| One wire, unique subset of invoices | PROPOSE | Dr Cash / Cr AR x n, list shown | controller | A-05 |
| Transposed reference, unique | PROPOSE | apply + note | controller | A-12 |
| Short-pay explained by cited fact (Initech) | PROPOSE; AUTO once policy earned | credit memo + zero-amount Payment link | controller; revenue, forecast | spine |
| Short-pay, reason not derivable | ESCALATE | apply partial; `dispute_hold`; Slack question to account owner | owner | A-20, C-08, Wayne |
| Several subsets fit / no advice | ESCALATE | unapplied cash on customer | AR lead | C-05 |
| Advice total != cash | ESCALATE | apply per advice, residual as short-pay case | AR lead | C-06 |
| Overpayment | PROPOSE | Dr Cash / Cr AR / Cr Customer credits | controller | A-21 |
| Reversal / return of a receipt | PROPOSE | reverse application, reopen AR | controller; forecast | A-15 |
| Parent pays for subsidiary | PROPOSE first time, then fact | apply via hierarchy; `record_fact_candidate(pays_for)` | controller | planted |
| Bad debt | ESCALATE | allowance / write-off draft | CFO | C-11 |
| Wrong legal entity | ESCALATE (out of scope) | none | - | C-07 |

**Hand-offs.** Consumes `bank.credit_unmatched`, `bank.reversal_detected`, `rev.invoice_issued`. Emits `ar.cash_applied`, `ar.concession_learned` (-> revenue, forecast, billing), `ar.dispute_opened` (-> forecast haircut), `ar.unapplied_cash` (-> close checklist), `ar.receivable_reopened`.

**Learnable.** Facts: payer aliases, parent-pays-for-child, concession terms with until-date, customer's usual remittance channel. Policies: wire-fee band per corridor, small-balance write-off threshold (clamped, G-08). Never learned: a rule keyed on description text (A-09/G-09); anything from a single correction (G-05); a tolerance wider than the class ceiling; "this customer always short-pays, clear it".

**Metrics.** Auto-apply rate and precision; unapplied cash at month end (count, dollars); questions asked run 1 vs run 2; median days deposit -> application; false auto-posts (must be 0).

## 2. Cash and bank reconciliation

**Triggers and inputs.** Comparator `bank vs ledger cash` on every sync and at period end; statement import (file or Increase); amended statement (same statement id, new hash) (A-24); processor payout file with `gross / fee / net` per item (**undecided scope**: the spec rules Stripe out, corpus A-07/H-2 is in the minimum fixture; file-based only, no API).

**Objects and keys.** Stable: `bank_txn.id`, check number, trace number, `automatic_payout_id` + `balance_transaction_id` (Stripe's itemised payout reconciliation report carries `gross`, `fee`, `net`, `reporting_category`, `automatic_payout_id` [S1, S2]), own-account ids (for sweeps), statement `(account, period, version_hash)`. Mutable: descriptor, memo.

**Correction to the spec.** Kernel F says "every bank line matched exactly once". Replace with: every bank line **and** every ledger cash line belongs to exactly one *group*, typed `match(1:1|1:N|N:1)`, `reconciling_item(timing)`, `adjusting_entry` or `open_exception`; and the two-sided proof holds: bank balance + deposits in transit - outstanding checks == book balance + adjustments. Timing items are not journal entries (A-01, A-02).

**Pipeline.**
1. Validate + idempotent ingest on `source_system + source_id` (F-05); split lines at the cutoff date (A-23).
2. Version check: changed hash on a reconciled statement -> mark rec stale, invalidate dependent workpapers, re-run (A-24/H-6).
3. Internal transfers: two legs, own accounts, equal and opposite, within 2 days -> pair, no P&L (A-19).
4. Carry-forward clear: last period's outstanding list matched by **check number / trace**, with a window widened for this list only (A-16).
5. Exact 1:1 on amount + value date +/- 3 days + party (DESIGN window).
6. Group passes, exact sums only: N:1 (one wire, many invoices -> hands to AR), 1:N (one payment run, several debits, A-06).
7. Fee-delta pass, 1:1 only: same party, book minus bank within the learned fee band -> match + propose Dr Bank charges (A-03).
8. Processor expansion: bank line net == sum(net) for one payout id; assert sum(gross) - sum(fee) == sum(net) to the cent.
9. Book-only residue before cutoff -> timing item (A-01/A-02). Bank-only residue: bank-originated codes (fee, interest) -> propose JE (A-04); else model port.
10. Ambiguity gate (A-18), then plug guard: an unexplained difference is never booked to suspense/rounding without approval.

**Correction on A-07.** The corpus says "revenue at gross". In an accrual SaaS ledger the payout must not book revenue (the revenue pack owns recognition). Use a processor clearing account: at charge, Dr Processor clearing / Cr AR at gross; at payout, Dr Cash (net), Dr Processing fees, Cr Processor clearing (gross). Refund and dispute rows inside the payout reverse through the same account. Check: clearing balance == balance not yet paid out.

**Model ports.** (A) Entity resolution for abbreviated names (A-10): must state the semantic link (alias source), not restate amounts (G-12). (B) No-lexical-overlap matching (A-11): given one bank line and up to 5 code-generated candidates equal in amount, asked which and why, citing a trace (the booth vendor's invoice naming the conference); "none" is a valid answer. (C) Reason-finding for a residual difference: returns evidence or REFUSE.

**Kernel checks.** F: group exclusivity; two-sided proof; transfers net to zero; payout arithmetic. E: every adjusting JE cites the bank line; fee JE cites the matched pair. P: period open; rec preparer != approver; stale rec cannot be signed. J: fee-band policy active and scoped to the bank/corridor. **Hard BLOCKs:** posting the post-cutoff half into the closed month (A-23); plug entry with no evidence (A-25, the $12.40); signing a rec whose statement version changed; one bank line in two groups (catches the refund posted twice).

| Outcome | Route | Entry / artifact | Notified | Cases |
|---|---|---|---|---|
| Deposit in transit / outstanding check | AUTO | reconciling item, no JE, carried forward | none | A-01, A-02 |
| Internal sweep | AUTO | transfer pair, no P&L | none | A-19 |
| Descriptor changed, stable key same | AUTO | match via originator id / party | none (decay monitor if hit-rate drops) | A-09, H-3 |
| Wire net of fee | PROPOSE | match + Dr Bank charges 17.50 | controller | A-03 |
| Bank charge, no book entry | PROPOSE | Dr Bank charges / Cr Cash | controller | A-04 |
| Abbreviated name / spend memo | PROPOSE | match + semantic explanation | controller | A-10, A-11 |
| Processor payout | PROPOSE | three-line expansion + tie-out | controller | A-07, H-2 (undecided) |
| Stale check clears | PROPOSE | clear outstanding item | controller | A-16 |
| Refund posted twice | PROPOSE | reverse the duplicate book entry | controller | planted |
| Two equal candidates | ESCALATE | both shown, none picked | AP/AR lead | A-18 |
| Amended statement | ESCALATE | rec marked stale, version diff | controller, close | A-24 |
| Bank error / unexplained 12.40 | ESCALATE; REFUSE to plug | open exception, "everywhere I looked" list, bank query draft | controller | A-25, planted |
| Wrong-period half | BLOCK | blocked attempt persisted with rule id | close | A-23 |

**Hand-offs.** Emits `bank.credit_unmatched` (-> AR), `bank.debit_unmatched` (-> AP), `bank.reversal_detected`, `bank.rec_stale`, `bank.rec_complete` (-> close, forecast opening cash). Consumes `ar.cash_applied`, `ap.payment_released`, `close.period_locked`.

**Learnable.** Aliases to stable keys; fee bands per corridor (clamped); coding of recurring bank-originated charges. Never: predicates cut from statement wording; a standing plug tolerance; clearing ambiguous pairs from precedent.

**Metrics.** Lines auto-matched and precision; open exceptions by age; unreconciled dollars; rule hit-rate month over month (decay alarm, H-3); model calls per 1,000 lines vs the rules-disabled baseline.

## 3. AP: intake, three-way match, duplicates, vendor-master controls, approvals, payment run

**Triggers and inputs.** Gmail bill with PDF (`trace.kind=vendor_bill`); comparator `AP subledger vs GL`; comparator `vendor bank details vs last paid`, keyed on a hash of routing + account and compared against the last *successfully paid* fingerprint; any email mentioning new remit-to details; weekly payment-run intent; `bank.debit_unmatched`.

**Objects and keys.** Stable: `vendor.id`, tax id, bank fingerprint, `po.id` + line, `receipt.id` + line, normalised invoice number (uppercase, strip punctuation and leading zeros; DESIGN), and an **obligation key** `(vendor, po_line | service_period, amount)`. Mutable: vendor display name, invoice layout, sender address, remit-to block.

**Pipeline.**
1. Extraction (model port A), then internal consistency in code: lines foot to header, tax recomputed, date inside fiscal window (B-15, F-09). Fail -> REFUSE.
2. Vendor resolution; master-level duplicate scan on tax id, bank fingerprint, normalised name/address, scored three-zone (B-18) [S12].
3. Bank-detail check: invoice remit-to fingerprint != master -> hold **before** matching.
4. Duplicate check, two tiers. Exact: vendor + normalised invoice number (SAP's default also compares currency, document date and, when no reference is given, amount [S8]) -> BLOCK (B-13). Near: vendor + amount + date within 30 days, different number -> ESCALATE at bill stage (B-14). At **payment** stage, if the obligation key is already settled by a payment with a bank line -> BLOCK `DUPLICATE_PAYMENT` even when approved (A-13, G-01, H-1). Different invoice refs **and** different PO lines/receipts -> not a duplicate (A-14). Prepayment not netted -> BLOCK (B-22). The only way out of a block is new evidence that changes the inputs (a distinct PO/receipt), never an override.
5. Match at line level, cumulative: billable qty = min(qty billed, cumulative received - previously billed); price <= PO price + tolerance; qty billed <= ordered. These are Oracle's three-way criteria; holds fire only on unfavourable over-tolerance variances [S7]. Payable = billable qty x PO price (B-01, B-02); both variances reported (B-03); UOM normalised or REFUSE (B-10); freight separated (B-11); no PO / services -> acceptance record as third leg, or ESCALATE (B-05, B-06).
6. GL coding from vendor-history policy, else model port B.
7. Approval routing from the approval matrix in code; limit enforced at storage (B-24).
8. Payment run as code: eligible = approved, unheld, vendor bank verified; rank by discount deadline (2/10 net 30 is roughly 37% annualised: 2/98 x 365/20), then due date, subject to the forecast's minimum-cash floor. Output: run proposal + optional positive-pay issue file (check number, amount, payee) for the bank [S13].

**Bank-change control (correction to the spec).** Spec says "refuse" the phish; corpus says BLOCK (B-17). Draw a state machine on the vendor: `verified -> change_requested -> (out-of-band verified by a second person) -> verified`. FBI and Nacha both say verify through a channel other than the request, using contact details already on file [S5, S14]. So a Slack "approve" does not lift the block; only a `fact(bank_change_verified)` whose `stated_by` is neither the requester nor the run preparer, and whose callback number predates the request. Vendor-master edit, bill entry and payment release are three separate actors [S15]. A cooling-off period after a change is DESIGN and **UNVERIFIED** as a standard. Slide context: BEC losses $2.77B in 2024 [S16]; 63% of AFP respondents name BEC the top fraud avenue [S17]; Nacha's 2026 rule requires all non-consumer originators to run risk-based fraud monitoring, including "false pretenses" payments (phase 2 from 19 Jun 2026) [S18].

**Model ports.** (A) Bill extraction with per-field confidence, propagated to routing (F-14). (B) GL coding and variance reason-finding (dispute thread, delivery note); quoted spans required. (C) Near-duplicate adjudication is **not** given to the model; it only gathers evidence on whether the obligations are distinct.

**Kernel checks.** F: lines foot; payable <= min(PO remaining, received remaining); AP subledger == control. E: PO, receipt and bill trace ids exist and tie on vendor, item, qty, price. P: approver within limit and != preparer; period open (B-23); vendor bank status == verified at release. J: tolerance policy active, scope = vendor/category, ceiling inherited from approver (G-04). **Hard BLOCKs:** exact duplicate; settled obligation key; unverified bank change; over-limit approval; closed period; unnetted deposit; policy adopted from one correction or a failed backtest (G-05, G-06). Every block persists `(rule_id, inputs, attempted_by, approval_ignored)`. Schema gap: there is no `blocked_attempt` artifact kind, and `Proposal.kind` lacks `vendor_bank_change`, `reconciling_item`, `unapplied_cash`.

| Outcome | Route | Entry / artifact | Notified | Cases |
|---|---|---|---|---|
| Clean three-way match under auto limit | AUTO | Dr Expense / Cr AP | none | baseline |
| Same vendor/amount/day, distinct refs and POs | AUTO | both approved | none | A-14 |
| Qty or price variance | PROPOSE | payable at received x PO price; short-pay note to vendor | controller, buyer | B-01, B-02, B-07, B-08, B-11 |
| Credit memo | PROPOSE | applied to the specific original | controller | B-16 |
| Early-pay discount | PROPOSE | both amounts + deadline | treasurer | B-20 |
| Both variances / over-receipt / no PO / services | ESCALATE | `hold_bill` + question to PO owner | owner | B-03 to B-06, B-09 |
| Near-duplicate at bill stage | ESCALATE | hold + original shown | AP lead | B-14 |
| Duplicate vendor records | ESCALATE | merge proposal | controller | B-18 |
| Vendor statement mismatch | ESCALATE | itemised two-way difference | AP lead | B-26 |
| Void and reissue | ESCALATE | link pair | AP lead | A-17 |
| Header != lines; UOM unknown | REFUSE | nothing proposed; reason stated | AP inbox | B-15, B-10 |
| Exact duplicate / already-settled obligation | BLOCK | blocked attempt with original payment + bank line | approver, controller | B-13, A-13, G-01, H-1, B-22 |
| Bank details changed | BLOCK | payment hold; callback task | controller, vendor owner | B-17 |
| Over limit / closed period | BLOCK | reroute up / current-period entry | next authority | B-24, B-23 |

**Hand-offs.** Emits `ap.bill_approved` (-> forecast outflow), `ap.bill_held` (-> close accrual candidate), `ap.payment_released` (-> bank rec expects debits, 1:N), `ap.block_persisted` (-> audit), `ap.vendor_change_requested`. Consumes `forecast.cash_floor`, `bank.debit_unmatched`, `close.period_locked`.

**Learnable.** GL coding per vendor; price/qty tolerance per vendor-category (clamped); freight policy; acceptance-record substitutes for service vendors; vendor aliases. Never: bank details from an inbound message; a duplicate exemption; approval limits; any rule whose approver's ceiling is below the amounts it would clear.

**Metrics.** Touchless rate and precision; exception rate vs the 22% / 9% benchmark in spec 2a; duplicates blocked (count, dollars); bank-change holds and time to verify; discounts captured vs available; blocks where a human had approved (the H-1 number).

## Sources
- [S1] Stripe, payout reconciliation report columns: https://docs.stripe.com/reports/report-types/payout-reconciliation
- [S2] Stripe, reporting categories: https://docs.stripe.com/reports/reporting-categories
- [S3] Nacha, unauthorized return reasons and timeframes: https://www.nacha.org/rules/differentiating-unauthorized-return-reasons
- [S4] Nacha, reversals (5 banking days, permitted reasons): https://www.nacha.org/rules/reversals-and-enforcement
- [S5] FBI, Business Email Compromise guidance: https://www.fbi.gov/how-we-can-help-you/scams-and-safety/common-frauds-and-scams/business-email-compromise
- [S6] Oracle Cash Management, reconciliation matching and tolerance rules: https://docs.oracle.com/en/cloud/saas/financials/25b/faipp/reconciliation-matching-rules.html
- [S7] Oracle Payables, two/three/four-way matching and tolerances: https://docs.oracle.com/cd/A60725_05/html/comnls/us/ap/point04.htm and https://docs.oracle.com/en/cloud/saas/financials/25c/fappp/invoice-tolerances.html
- [S8] SAP, duplicate invoice check criteria: https://learning.sap.com/courses/invoice-verification-in-sap-s-4hana/adjusting-further-customizing-settings-in-invoice-verification
- [S9] camt.053 key fields: https://developer.huntington.com/enterprisepayments/docs/camt053
- [S10] Increase, inbound ACH transfer object: https://increase.com/documentation/api/inbound-ach-transfers
- [S11] Subset sum complexity (NP-complete; Horowitz-Sahni O(2^(n/2))): https://en.wikipedia.org/wiki/Subset_sum_problem
- [S12] Fellegi-Sunter decision rule and blocking: https://arxiv.org/pdf/1603.07816
- [S13] Positive pay mechanics: https://www.citi.com/banking/small-business-guide/business-services/positive-pay
- [S14] Nacha, BEC and vendor impersonation fraud: https://www.nacha.org/sites/default/files/2019-04/NACHABECVIF.pdf
- [S15] Washington State Auditor, vendor master file controls: https://sao.wa.gov/the-audit-connection-blog/protect-your-vendor-master-file-fraudsters ; AICPA SoD chart: https://www.aicpa-cima.com/resources/download/segregation-of-duties-reference-chart-for-orgs-with-three-people
- [S16] FBI IC3 2024 annual report: https://www.ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf
- [S17] AFP 2025 Payments Fraud and Control Survey: https://www.financialprofessionals.org/training-resources/resources/survey-research-economic-data/details/payments-fraud
- [S18] Nacha, fraud monitoring phases 1 and 2: https://www.nacha.org/rules/risk-management-topics-fraud-monitoring-phase-1
- SAP Cash Application (confidence-threshold auto-clearing; the vendor pattern we replace with a kernel gate): https://learning.sap.com/learning-journeys/discovering-new-ai-capabilities-for-sap-finance/describing-the-improved-cash-reconciliation-process
- HighRadius remittance capture and deduction coding (vendor marketing; treat as claims): https://www.highradius.com/product/cash-application-automation/

Verification notes: S6's one-to-one-only tolerance statement, S7, S8, S9, S10, S13, S14 and S17 were read from search excerpts of those documents rather than a full page fetch (S6 and S14 did not render). S1, S2, S4, S11, S18 were fetched and read directly. The 2-banking-day figure for standard returns (R01-R04) is from secondary sources (Plaid, Modern Treasury). All date windows, n <= 24, and the 30-day near-duplicate horizon are DESIGN parameters, not industry constants.
