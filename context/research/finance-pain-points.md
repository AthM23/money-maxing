# Finance Team Pain Points — Sourced Research
### HackMIT 2026 — Maximor "Office of the CFO" track
Compiled: 2026-09-19. Target customer profile: mid-market/enterprise, $50M–$500M revenue, complex finance org (multi-entity, multi-system, thin accounting bench relative to a public company).

**Methodology:** every number below was verified against a live source by a research sub-agent (not pulled from model memory). Vendor-sponsored surveys are labeled `(vendor survey)` — still useful as directional/practitioner evidence, just not independent benchmarks. Where no sourced figure could be confirmed, that is stated explicitly rather than filling the gap with a plausible-sounding number. A "flagged claims" section at the end lists numbers that circulate in AI-search summaries and vendor marketing but could **not** be verified against a primary source — do not use these in the pitch or deck.

---

## 1. Month-End Close

- Median monthly close: **6.4 calendar days** (top quartile ≤4.8 days, bottom quartile ≥10 days) — APQC Open Standards Benchmarking, 2,300+ orgs: https://www.apqc.org/resource-library/resource/cycle-time-perform-monthly-close
- Annual close: top performers ≤10 days, median **18 days**, bottom quartile **35 days**; sub-$100M-revenue orgs median 10 days vs. $1B–5B orgs median 23 days — APQC: https://www.apqc.org/resources/benchmarking/open-standards-benchmarking/measures/cycle-time-days-perform-annual-close
- `(vendor survey, Ledge, n=100 finance pros, 2025)`: **50%** of teams take >5 business days to close, only 18% close in ≤3 days; **94%** still use Excel in the close; reconciliation alone eats **20–50 hrs/month** across 3–5 disconnected systems — https://www.ledge.co/content/month-end-close-benchmarks-for-2025
- `(vendor survey, FloQast + Univ. of Georgia, 2022)`: **85%** had to reopen the books at least once in the past year to fix errors; **49%** reopened books 3+ months — https://www.globenewswire.com/news-release/2022/07/19/2481880/0/en/FloQast-Releases-Survey-Results-Detailing-Prevalent-Burnout-In-Accounting-Industry.html (a 2016 predecessor survey found 75%, suggesting this is worsening, not improving)

**Why it hurts a $50M–$500M company:** this band runs multi-entity, multi-system finance stacks (ERP + subledgers + spreadsheets) without the automation headcount to escape the slow-close cohort, yet still faces lender/PE-sponsor demands for fast, defensible numbers.

**Plantable demo scenario:** the March close is marked "final" on day 5 and reported to the board, but on day 8 an AP clerk finds an unrecorded $47,000 invoice from "Meridian Freight Solutions" sitting in an inbox since month-start, forcing the controller to reopen the close and walk back the board-reported numbers.

---

## 2. Errors and Trust

- Gartner survey, 497 controllership professionals (fielded Jul 2023, published Feb 2024): **18%** of accountants make errors at least daily, a third make several errors/week, **59%** several/month; 73% say workload rose from new regulation, 82% from economic volatility — https://www.gartner.com/en/newsroom/press-releases/2024-02-21-gartner-survey-shows-that-a-third-of-accountants-make-several-error-per-weeo-due-to-capacity-constraints
- Accountant shortage: US accounting bachelor's+master's degrees fell **6.6%** in AY2023-24 to 55,152 — a 20-year low (AICPA data) — https://www.journalofaccountancy.com/news/2023/oct/pool-of-accounting-graduates-shrinks-aicpa-report-finds/ ; CPA exam candidates down **43%** over the decade, 49,597 (2016) → 28,082 (2024) — https://atlascpaindex.com/news/cpa-exam-candidate-pipeline-2024-2025-data
- **~640 US-listed companies** disclosed material weaknesses tied to accounting talent shortage, Jul 2023–Jun 2024 (WSJ analysis) — https://www.goingconcern.com/companies-disclose-lack-of-accounting-staff-in-sec-filings/ ; staffing-related share of disclosures rose 30%→34.4%, 2022→2024
- **140 public companies** restated financials in the first 10 months of 2024 vs. 122 in the same 2023 period — nine-year-high rate — https://www.cfobrew.com/stories/2024/12/12/financial-restatement-rate-hits-nine-year-high ; debt/equity-account issues were the top cause, 27% of 2023 restatements — https://blog.auditanalytics.com/category/audit-compliance/financial-restatements/
- **CFO trust in AI** (directly relevant — commissioned by this challenge's own sponsor): only **14%** of CFOs completely trust AI to deliver accurate accounting data unsupervised (86% don't fully trust it); **86%** of finance teams hit an AI "hallucination" incident; 97% say human oversight remains critical. `(vendor survey — commissioned by Maximor AI, conducted by Wakefield Research, 100 CFOs at mid-market US companies, published Jan 28 2026)` — https://www.cfodive.com/news/massive-trust-gap-hinders-cfo-ai-ambitions-study-finds/810786/

**Why it hurts a $50M–$500M company:** this band faces SOX-adjacent lender/investor scrutiny without a deep accounting bench, so capacity-driven errors and shortage-driven material weaknesses concentrate exactly here.

**Plantable demo scenario:** a mid-market manufacturer's sole senior accountant, now also covering AP during a hiring freeze, misclassifies a $22,000 debt-covenant reclass; when the CFO later asks whether an AI-drafted variance memo can go to the board unreviewed, the demo surfaces the same 14%-trust/86%-hallucination dynamic Maximor's own commissioned study measured.

---

## 3. Accounts Payable

- Cost per invoice: best-in-class **$2.78** vs. all-buyer average **$10.89** (~4x gap) — Ardent Partners, *AP Metrics That Matter in 2025*, via Corpay: https://www.corpay.com/resources/blog/ap-team-productivity-benchmarks
- Invoice cycle time: best-in-class **3.1 days** vs. average **10.9 days** — same Ardent Partners 2025 report
- Invoice exception rate: best-in-class **9%** vs. industry average **22%** (roughly 1 in 5 invoices needs manual touch) — same Ardent Partners 2025 report
- Duplicate/erroneous payments: industry range **0.1%–0.5% of total AP spend**, worse after ERP migrations or M&A (vendor blog, no primary study named) — https://transparentglobal.com/blog/what-percentage-of-ap-spend-is-lost-to-duplicate-payments-industry-benchmarks/. Older reference outside preferred window: SAP Concur found a **1.29%** duplicate-invoice rate among SMB customers, avg $2,034/duplicate `(vendor study, dated 2016)` — https://www.concur.com/blog/article/how-much-money-your-business-throwing-away-duplicate-invoice-payments
- Vendor impersonation/BEC: FBI IC3 — **$2.77B** in BEC losses across 21,442 complaints in 2024 alone (part of a record $16.6B total cybercrime loss, +33% YoY) — FBI IC3 2024 Internet Crime Report: https://www.ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf. Cumulative **$55.5B** exposed BEC losses domestic+international, Oct 2013–Dec 2023, across 305,033 incidents — FBI IC3 PSA-240911: https://www.ic3.gov/PSA/2024/PSA240911

**Why it hurts a $50M–$500M company:** too big for founder-does-everything AP but too small for a full automation/fraud-ops stack, so the ~4x cost and ~3.5x speed gap directly eats finance capacity, and this segment is a sweet spot for BEC fraud (real payment volumes, thin controls).

**Plantable demo scenario:** a spoofed vendor-update email changes "Acme Steel Supply's" bank details two days before a $187,000 invoice is due; AP pays on time straight into the fraudster's account, caught 11 days later during bank reconciliation.

---

## 4. Accounts Receivable and Cash Application

- DSO: APQC — top-quartile ≤30 days, median ≤38 days, bottom-quartile ≥46 days — via CFO.com/APQC: https://www.cfo.com/news/dso-cash-flow-management-metric-of-the-month-perry-wiggins-apqc/717822/. Hackett Group FY2024 — upper-quartile avg **28 days** vs. median **46 days**; Hackett's 2025 Working Capital Survey pegs **~$600B** of excess working capital trapped in US receivables industry-wide — https://www.cfo.com/news/industries-that-got-paid-fastest-2024-days-sales-outstanding-dso-hackett-working-capital-research/753657/
- Remittance/payment friction: PYMNTS + Corcentric surveyed 100 CFOs at US companies with ≥$250M revenue (inside our target band) — **45%** said invoicing errors caused payment disruptions, **68%** said payment delays caused problems in the last 6 months, 90% wanted more AR automation — https://www.pymnts.com/study/accounts-receivable-automation-smooths-order-to-cash-continuum-ar-solutions-payment-delays-disputes-chargebacks/ (Jul 2023)
- Cash-application auto-match: manual/legacy processes match only **40–60%** straight-through; AI-native platforms claim 90–98% (vendor-sourced) — https://www.stuut.ai/blog/auto-cash-vs-manual-cash-application-when-each-wins , https://www.emagia.com/resources/glossary/automatic-match-rate/. Unapplied cash as a standalone % of receivables: **no sourced figure found** (vendors define the metric but none publish a hard benchmark %)
- Deductions/short-pays: short-pays+deductions trap roughly **20–25%** of incoming payments in suspense monthly (vendor blog) — https://www.stuut.ai/blog/cash-application-exception-handling-short-pays-and-deductions. `(vendor data, HighRadius)`: large US enterprises face ~**$22M/month** in new deduction claims, ~**10%** ultimately invalid, **76%** of enterprises auto-write-off short-pays under $100 without investigating — https://www.highradius.com/finsider/deduction-metrics-enterprises/. `(vendor survey, Versapay, 2024)`: ~**31%** of AR teams' daily time goes to resolving invoice disputes — https://www.versapay.com/accounts-receivable-statistics

**Why it hurts a $50M–$500M company:** real transaction volume without enterprise-grade AR tech means cash sits unapplied and DSO drifts, tying up working capital — confirmed as a top-3 CFO pain point in exactly this revenue band by the PYMNTS/Corcentric sample.

**Plantable demo scenario:** a $64,000 wire arrives from "Meridian Logistics" with a remittance reference matching none of 4 open invoices; it sits in unapplied cash for 3 weeks of back-and-forth emails while Meridian receives a late notice for an invoice it already paid.

---

## 5. Revenue Leakage and Contract-to-Billing Mismatches

- "Revenue leakage represents at least three to five percent of every company's revenue" — MGI Research, *Revenue Leakage Series Part 1: From Hidden Risk to Asymmetric Opportunity* (Dec 19, 2025), verified by direct fetch: https://mgiresearch.com/research/revenue-leakage-series-part-1-from-hidden-risk-to-asymmetric-opportunity/
- MGI Research frames the risk line against **SEC materiality thresholds: 5% of revenue or 10% of EBITDA** — MGI is citing the general SEC materiality convention as a benchmark, not a leakage-specific empirical survey stat — *Part 3: The Geography and Mechanics of Revenue Leakage*: https://mgiresearch.com/research/revenue-leakage-series-part-3-the-geography-and-mechanics-of-revenue-leakage/
- Causes taxonomy (qualitative, no attached %) per MGI Research *Part 2: Why Does Revenue Leakage Happen?*: system-integration gaps (negotiated discounts reverting to list price on data transfer, batch-processing delays); manual-process dependencies (spreadsheet-based usage billing, approval bottlenecks); contract complexity without infrastructure (unexecuted escalation clauses and volume tiers never modeled in billing systems) — https://mgiresearch.com/research/revenue-leakage-series-part-2-why-does-revenue-leakage-happen/
- **Flagged as unverifiable** — see "Flagged Claims" section below for vendor marketing numbers (4–10% of SaaS revenue, "up to 31.8% of ARR," a cause breakdown falsely attributed to MGI) that could not be confirmed against any primary source.

**Why it hurts a $50M–$500M company:** at this size a firm typically runs multiple product lines, pricing tiers, and negotiated contracts without enterprise-grade CPQ-to-billing integration, so a 3–5% leakage rate on $50M–$500M of revenue is **$1.5M–$25M/year** in real cash left on the table — money that drops straight to EBITDA if caught.

**Plantable demo scenario:** Northwind Logistics' 3-year contract with Customer #4471 includes a 4% annual price escalation effective month 13. Billing keeps invoicing the year-1 rate for 14 months after the escalation date because the clause was never entered in the billing system — quietly under-billing $86,000 before a manual contract audit catches it.

---

## 6. Accruals and Cutoff

- **No sourced figure found** for "% of organizations where late accruals extend the close." An AI search summary surfaced a "35–45% of organizations, 1–3 day delay" claim attributed to APQC, but APQC.org returned a 403 and the claim could not be confirmed on the secondary blog that cited it — not used.
- **No sourced figure found** for a specific hours/month figure for finance staff chasing other departments for accrual inputs, despite multiple query variations against APQC, Deloitte, PwC, and general finance-ops sources.
- Adjacent context (not accrual-specific, likely overlaps Topic 1): `(vendor survey, BlackLine CFO Survey)` — "over 40% of close time is spent on manual data gathering and reconciliation."
- Qualitative accrual-error categories (no attached frequency %): failure to accrue expenses/salaries payable in the correct period, improper expense-to-period matching, prepaid-expense amortization errors, depreciation/useful-life estimate errors — Paychex: https://www.paychex.com/articles/finance/common-accounting-errors-how-to-prevent-them ; restatement mechanics — Baker Tilly: https://www.bakertilly.com/insights/restatements-costly-result-error
- Qualitative practitioner evidence that close delays are driven by finance waiting on other departments for accrual inputs (overdue expense reports, open POs, receipt confirmation) — SAPinsider: https://sapinsider.org/articles/month-end-close-why-finance-transformation-still-depends-on-faster-decisions ; Advisory Excellence: https://www.advisoryexcellence.com/what-happens-when-your-finance-team-spends-more-time-gathering-data-than-analysing-it/

**Why it hurts a $50M–$500M company:** finance is coordinating accrual inputs across more legal entities, cost centers, and department heads than a smaller company, but usually still lacks dedicated accrual-automation tooling — so every close becomes a manual, undocumented scavenger hunt for numbers no single system owns.

**Plantable demo scenario:** the controller accrues $54,000 for a marketing-agency invoice that hasn't arrived yet, based on a verbal estimate the CMO's assistant relayed over Slack three months earlier. The actual invoice comes in at $71,000; the $17,000 delta is silently absorbed into next month's variance with no one flagging why the estimate was off.

---

## 7. Audit Readiness

- Average audit fee across 6,600+ SEC registrants: **$3.26M in FY2024 (+9% YoY)** — Ideagen/Audit Analytics data via TheCorporateCounsel.net: https://www.thecorporatecounsel.net/blog/2025/10/audit-fees-20-years-of-trend-data.html
- Smaller filers (closer proxy for mid-market): non-accelerated filers averaged **$734K (FY2024, +3% YoY)** vs. **$1.62M** for accelerated filers — Audit Analytics data via AuditUpdate.com `(secondary citation, lower confidence — could not independently re-confirm on a primary page)`: https://www.auditupdate.com/post/audit-fees-continued-to-climb-in-2024
- Mid-market benchmark: manufacturers' average audit-fee-to-revenue ratio was **0.09% (2025)**, typical GAAP audit fees **$1.01M–$3.87M** (full range $165K–$12.1M) — Manufacturers Alliance Audit Fee Benchmark (trade-association survey): https://www.manufacturersalliance.org/research-insights/audit-fee-benchmark-2024
- SOX hours burden: **58%** of audit/finance leaders reported increased hours on SOX compliance YoY; 74% seeking more automation — `(vendor survey)` Protiviti 2023 SOX Compliance Survey, 560+ leaders: https://www.protiviti.com/us-en/press-release-new-protiviti-survey-sox-compliance
- Material weaknesses: adverse ICFR assessment rates fell from **>26% of filers (2021)** to **~15% (2024)**, per analysis of 5,000+ management and 3,000+ auditor assessments from SEC EDGAR. Revenue recognition is the single largest contributor to accounting-related material weaknesses; segregation-of-duties/staffing gaps recur at smaller companies — Baker Tilly (2025): https://www.bakertilly.com/insights/trends-in-public-company-material-weaknesses
- **No sourced figure found** for a quantified hours/days-per-PBC-request burden, or a specific % of control deficiencies attributable to "self-approval" or "post-close journal entries" (PCAOB/Pathlock confirm these are recognized deficiency patterns, no prevalence % located).

**Why it hurts a $50M–$500M company:** large enough to face public-company-grade audit rigor (many are PE-owned or newly public) but too small for a dedicated SOX PMO or audit-liaison staff, so control-testing and evidence-gathering burden lands on 2–4 overstretched controllers, and one departure creates an instant segregation-of-duties gap.

**Plantable demo scenario:** during Q3 SOX walkthroughs, the auditor flags that the senior accountant who processes vendor payments also approves her own journal entries above $10K, because the backup approver left in June and was never backfilled — a segregation-of-duties exception the controller must explain, and the follow-up PBC request for "90 days of approval logs" takes 6 business days because the trail spans two systems and one shared inbox.

---

## 8. Cash Forecasting

- **71%** of corporate treasurers run a rolling 13-week cash forecast — AFP 2024 Liquidity Survey: https://www.financialprofessionals.org/training-resources/resources/survey-research-economic-data/Details/liquidity-survey
- AFP 2025 Treasury Benchmarking Survey (500+ practitioners, underwritten by Wells Fargo): **73%** name cash forecasting their top priority (up from 68% in 2022), yet **60%+** call it their most challenging task, and **61%** cite unreliable data as the top obstacle: https://www.financialprofessionals.org/training-resources/resources/survey-research-economic-data/Details/treasury-benchmarking
- **91%** of organizations still rely on spreadsheets for cash forecasting — `(vendor survey, HighRadius, dated 2019 — outside the preferred 2022-2026 window; no fresher replication found despite multiple searches)`: https://www.highradius.com/resources/ebooks/moving-beyond-spreadsheets-for-cash-forecasting/
- **No sourced figure found / explicitly debunked**: a "manual forecasts hit ~60% accuracy vs. 88-92% for AI" comparison circulates in AI-generated search summaries; directly fetching its apparent source shows that page explicitly states no published study measures 13-week forecast accuracy this way — those bands are self-described as "targets, not measurements." Do not use this comparison.

**Why it hurts a $50M–$500M company:** treasury here is typically 1–2 people running a 13-week model by hand in Excel — forecasting matters enormously (thin cash buffers, covenant tests, no capital-markets cushion) and is exactly where manual, spreadsheet-driven data quality fails, per AFP's own top-cited obstacle.

**Plantable demo scenario:** the treasury analyst's 13-week rolling forecast has a broken link to last month's AR-aging tab, so this week's model is still running on August collection assumptions three weeks into a cash-crunch — nobody notices until the model shows $340K more cash than the bank balance actually has.

---

## 9. Equity and Stock Compensation Administration (Private Companies)

- ISO $100K limit `(regulatory fact)`: under IRC §422(d), the aggregate grant-date FMV of stock for which ISOs first become exercisable for an employee in any calendar year cannot exceed $100,000; the excess automatically and silently converts to NSO treatment, often unnoticed until year-end tax prep, especially with front-loaded vesting — 26 U.S.C. §422: https://www.law.cornell.edu/uscode/text/26/422 ; explainer: https://www.vestingstrategy.com/guides/iso-100000-annual-limit-bifurcation-guide
- Rule 701 disclosure threshold `(regulatory fact)`: $10M in aggregate securities sold in a rolling 12-month period triggers mandatory enhanced disclosure to all equity recipients (financials, risk factors, plan summary); raised from $5M in 2018, reaffirmed by new SEC C&DI guidance Mar 6, 2026 — https://governance.weil.com/insights/sec-amends-rule-701s-additional-disclosure-threshold-from-5-million-to-10-million-more-changes-on-the-horizon/ ; https://marketedge.dlapiper.com/2026/03/sec-issues-new-and-revised-guidance-related-to-rule-701/
- 409A validity window `(practitioner fact)`: a 409A is presumed valid only 12 months OR until a "material event" (financing, big customer win/loss, down round, layoffs), whichever comes first; granting options on a stale 409A post-event carries the same tax/penalty exposure as having none — https://www.thestartuplawblog.com/409a-valuation-requirements/ ; https://www.crv.com/content/409a-valuation-before-series-a
- `(vendor survey, NASPP/Deloitte Tax, 2025 Equity Administration Survey)`: 49% of companies say Tax, 43% Treasury, and 43% HRIS/IT also touch stock-plan administration (no single owner); <30% use AI anywhere in equity administration, and of those, 82% use it only for writing emails/docs, not the workflow itself — https://www.naspp.com/blog/stock-plan-administration-staffing-trends
- **No sourced figure found** for a quantified "% of cap tables with errors found in diligence" — law-firm/CFO blogs describe the mechanisms (stale spreadsheets, unmodeled SAFEs/converts, mismatches vs. SPAs) as routine, but none publish a rate; Carta's State of Private Markets series covers valuations/dilution, not error rates.

**Why it hurts a $50M–$500M company:** by this size the cap table spans multiple priced rounds, SAFEs, and a large option pool, touched by HR/Tax/Treasury/Legal with no single owner, so a stale 409A, a missed forfeiture, or a silent ISO→NSO conversion goes undetected until it becomes a costly re-open during diligence or SOX testing.

**Plantable demo scenario:** a Q1 termination's vested-but-unexercised ISOs aren't marked forfeited on the cap table for 47 days (HRIS updated, cap table wasn't), overstating fully-diluted shares through a board cycle; separately, a top performer's second grant of the year silently pushes $18,000 of their ISOs into NSO territory ($118K cumulative first-exercisable value) that nobody flags until W-2 prep.

---

## 10. "Context Lives in People's Heads and Inboxes"

- McKinsey Global Institute, *The Social Economy*: interaction workers spend ~1.8 hrs/day (~9.3 hrs/week, ~28% of the workweek) searching for internal info or tracking down colleagues — https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-social-economy `(report dated 2012, outside the 2022-2026 window, but still the most-cited primary figure for this exact behavior — use with that caveat noted if cited)`
- `(vendor survey, Asana Anatomy of Work Index 2023)`: knowledge workers spend ~60% of their day on "work about work" (chasing status, searching documents, tool-switching) vs. skilled work; estimated 4.9 hrs/week recoverable with better process — https://asana.com/resources/anatomy-of-work
- Turnover as a knowledge-loss event: BLS JOLTS puts US private-sector voluntary turnover (quits) at ~22–25%/year recently (https://www.bls.gov/jlt/); SHRM puts full replacement cost at 50–200% of annual salary depending on seniority, separate from lost institutional knowledge — https://www.shrm.org/executive-network/insights/myth-replaceability-preparing-loss-key-employees
- Finance-specific (qualitative, no hard %): Personiv and Controllers Council both name "tribal knowledge" as a recurring, named finance-team risk — undocumented process logic held by one controller/accountant, surfacing as missed deadlines or audit findings only after that person leaves — https://insights.personiv.com/blog-personiv/the-trouble-with-tribal-knowledge ; https://controllerscouncil.org/cfo-beware-guarding-against-tribal-knowledge/
- **No sourced figure found** for a finance-specific % of time spent chasing colleagues (only general-workforce proxies above), or a finance-specific turnover-cost multiplier distinct from SHRM's general figure.

**Why it hurts a $50M–$500M company:** large enough to run multi-entity, multi-system close/compliance processes but often still small enough that critical process knowledge (why an accrual exists, which vendor always short-pays) sits with one or two tenured people instead of being systematized — so ~22–25% annual voluntary turnover is a standing threat to close timelines and audit readiness, not just an HR metric.

**Plantable demo scenario:** the senior accountant who owned a recurring $30,000/month data-center accrual leaves; a junior accountant keeps rolling it forward exactly as told without knowing it has a quarterly true-up clause, and three months later an auditor's PBC request for supporting detail can't be answered — the "why" only ever lived in the departed employee's inbox.

---

## Flagged Claims — Do NOT Use (Unverifiable / Contradicted on Direct Fetch)

These circulate in AI search summaries or vendor marketing copy but failed verification against a primary source. Listed so no one on the team accidentally cites them:

- "Revenue leakage is 4–10% of SaaS revenue" / "up to 31.8% of ARR" / a specific cause breakdown ("pricing errors 38%, billing mismatches 24%") misattributed to MGI Research — not found in MGI's actual published Revenue Leakage Series (Parts 1–3 checked directly).
- "35–45% of organizations see accrual-driven close delays of 1–3 days," attributed to APQC — APQC source page 403'd, secondary citation unconfirmed.
- "Manual cash forecasts hit ~60% accuracy vs. 88–92% for AI-assisted forecasts" — the page this traces to explicitly disclaims it as a measured stat ("targets, not measurements").
- HighRadius "91% still use spreadsheets for cash forecasting" is real but dated 2019 — treat as directionally true, not current.
- SAP Concur's 1.29% duplicate-invoice rate is real but dated 2016 — outside the requested 2022-2026 window.

---

## Quick Reference — Strongest Numbers for the Deck

1. Median close: 6.4 days (APQC); worst performers 10+ days.
2. 85% of finance teams reopened closed books at least once last year (FloQast/UGA).
3. Only 14% of CFOs fully trust AI-generated accounting numbers; 86% hit an AI hallucination incident (Maximor/Wakefield Research — sponsor's own data).
4. Accounting degree completions at a 20-year low, down 6.6% in one year (AICPA).
5. AP cost per invoice: $10.89 average vs. $2.78 best-in-class — a 4x gap (Ardent Partners).
6. FBI IC3: $2.77B in business email compromise losses in 2024 alone.
7. Median DSO 38–46 days vs. top-quartile ≤28–30 days (APQC/Hackett); ~$600B trapped in excess US receivables (Hackett).
8. Revenue leakage = 3–5% of revenue (MGI Research) → $1.5M–$25M/year for a $50M–$500M company.
9. 91% of orgs still forecast cash in spreadsheets; 61% cite unreliable data as their top forecasting obstacle (AFP 2025).
10. NASPP/Deloitte: equity administration is split across Tax (49%), Treasury (43%), HRIS/IT (43%) with no single owner, and under 30% use any AI in the workflow.
