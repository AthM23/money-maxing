# Architecture brief: Revenue, Close, 13-week Forecast, Reporting (Footnote)

Date 2026-09-19. Input for the diagram author. Grounded in `context/PROJECT_SPEC.md` v3 (sections 3-9), `tests/` corpus sections C, D, F, G, H, and the sources at the end. Claims I could not confirm this session are marked UNVERIFIED. Nothing here re-proposes a "Tried & rejected" item. All amounts are integer cents; every stage named "code" is deterministic; models never add numbers.

## 0. Shared shape and corrections to the spec (draw these once)

Every process is the same lane: **trigger (drift comparator | calendar | bus event) -> intent -> router (compiled policy/fact -> haiku -> sonnet -> opus, up a tier on kernel reject) -> investigator -> `propose_entry` + workpaper -> kernel F/E/P/J -> post | controller (GPT) | human in Slack -> fact/policy -> replay/compile.** What differs per pack: comparators, the deterministic engine, kernel checks, events.

Corrections the diagram should carry:
1. **Three thresholds, not one.** The spec's $500 is an *approval* threshold. Flux needs a dual $-and-% *investigation* threshold per account class; out-of-period items need a *financial-statement materiality* assessment. SAB 99: a percentage is only a first step, "has no basis in the accounting literature or the law" as a sole test, and small items can be material (masks a trend, flips loss to income, touches covenants or compensation, conceals an unlawful act). So D-10 "pattern beats threshold" is a kernel rule.
2. **Forecast and reporting emit artifacts, not journals.** `Proposal.kind` lacks `schedule_revision`, `accrual_reversal`, `true_up`, `contract_asset`, `forecast_version`, `flux_note`, `recon_certification`, `period_lock`. The kernel must check artifacts too (number binding, section 4).
3. **Accruals have a `reversal_mode`:** `auto_reverse` (bill not received) vs `accumulate_trueup` (the $30k/month plant). The spec's P-check "accruals flagged to reverse" breaks the second.
4. **Concession double-count risk.** The AR credit memo and the revenue schedule revision must reduce revenue exactly once: the credit memo debits the account the invoice credited (contract liability when billed in advance); recognized revenue moves only through the schedule delta.
5. **Flux runs before lock** as a detective control and gates `period_lock`; the board pack runs after.
6. Corpus coverage: forecast and reporting have **zero in-scope corpus cases** (E-xx, H-5 are out of scope). Their tables map to spec plants.

---

## 1. Revenue (ASC 606)

**Triggers and inputs.** (a) New or changed contract file / amendment email -> `trace(kind=contract_version)`. (b) HubSpot deal closed-won or amount change. (c) QuickBooks invoice or credit memo posted. (d) Bus: `ar.credit_memo.posted`, `fact.activated(predicate=concession)`. (e) Calendar: month-end recognition run. Comparators: contract expected-billing schedule vs invoices issued (amount, date) = missed escalator; HubSpot closed-won expansion vs amendment vs invoice = unbilled expansion; CRM amount vs contract ACV vs invoice run-rate (Initech, suppressed once the fact exists); deferred revenue schedule vs GL; usage records vs usage invoices (C-03, C-09).

**Canonical objects and keys.** `contract(id, customer_id, version, effective, start, end, supersedes)` · `contract_term(contract_id, version, field, value, trace_id, quote, page, extraction_confidence)` · `performance_obligation(id, contract_id, sku, pattern: ratable|point_in_time|usage, series: bool, ssp_cents, allocated_cents, gate: none|acceptance|delivery)` · `ssp_table(sku, low, high, approved_by)` (a policy object) · `rev_schedule_line(po_id, period, amount_cents, schedule_version, status)` · `billing_expectation(contract_id, date, amount_cents)` · `contract_modification(id, contract_id, date, type, treatment, delta_cents, decision_id)` · `contract_balance(contract_id, period, billed_cum, recognized_cum, net)`. Join key everywhere: `contract_id` + `customer_id` + `intent_id`.

**Deterministic pipeline.**
1. *Term extraction (model) -> typed terms (code validates):* dates inside the fiscal window (F-09), end > start, fee x periods = stated total, currency single.
2. *Step 1, contract exists:* checklist in code: both signatures present, payment terms present, customer active. A modification counts only when approved by both parties (606-10-25-10): CEO email + approval-matrix authority.
3. *Step 2, POs:* SKU -> catalog template. Catalog sets `pattern` and `series`. Unknown SKU or bundle without prices -> stop (C-01).
4. *Step 3, transaction price:* fixed fees summed over the non-cancellable term; usage allocated to the period earned (606-10-32-40); rebates flagged as variable consideration (C-12).
5. *Step 4, allocation:* relative SSP from `ssp_table`, largest-remainder rounding so parts sum to the price.
6. *Step 5, schedule engine:* ratable = daily rate x days in period, last period takes the residual; point-in-time fires on its gate event; usage on the usage record. Fixed fees with a fixed escalator: total fixed consideration time-elapsed over the whole term (KPMG example), producing a contract asset in early years; index-linked increases may be allocated per year. Which applies is a controller-approved policy, not a model call (partly verified).
7. *Monthly run:* Dr contract liability / Cr revenue, or Dr contract asset / Cr revenue when unbilled.
8. *Contract balance:* `net = billed_cum - recognized_cum` per contract, presented net at contract level (606-10-45-1); unconditional rights are receivables.
9. *Roll-forward:* opening + billings - recognized +/- modifications, credits, refunds = closing = GL; also revenue recognized out of the opening liability (606-10-50-8).
10. *Modification tree (code):* adds distinct goods AND price within SSP band -> **separate contract** (25-12). Otherwise, if remaining services are distinct (SaaS series: always) -> **prospective**: (unrecognized consideration + delta) re-spread from the modification date (25-13(a)). Price-only and scope-decrease changes can never be a separate contract (KPMG G110, G120). Remaining not distinct (in-process implementation) -> **cumulative catch-up** (25-13(b)). Both candidate schedules are computed so a human sees the dollar difference.

**Where a model is needed.** (i) Extraction: "return each term with the verbatim span and page"; must quote fee, term, escalator, acceptance, termination and renewal clauses. (ii) Non-catalog distinctness: "is the added item usable on its own or with readily available resources? quote the clause" -> always a human decision. (iii) Finding the reason for drift (side letter, Slack): quote the span granting the concession, its percentage and its end date.

**Kernel checks.** F: schedule sums to allocated price; allocations sum to transaction price; roll-forward ties to GL; one revenue-reducing posting per modification. E: every term quote is a substring of its contract version; customer, amount and dates tie across contract, CRM, invoice. P: modification approved by an authorized person; period open; preparer is not approver. J: SSP band and escalator policy approved and in scope; fact active on the date. **BLOCK:** recognition into a locked period (G-03); recognition on a gated PO without the acceptance trace (C-10); a schedule built on a superseded contract version (F-06/H-6); deleting or editing posted entries (C-04: reverse, never delete).

**Output cases.**

| Outcome | Route | Entry / artifact | Notified | Case |
|---|---|---|---|---|
| Monthly recognition from an approved schedule | AUTO | `rev_recognition` JE | none (checklist tick) | spine |
| Concession found (Initech), run 1 | PROPOSE | credit memo + prospective `schedule_revision` | controller | spec plant |
| Same, run 2 (fact in scope) | AUTO | same | none | learning demo |
| Mid-term seat upsell | ESCALATE | both treatments computed side by side, SSP comparison | controller | C-02 |
| Bundle, no stated prices | ESCALATE | allocation under candidate SSPs | controller | C-01 |
| Usage straddling cutoff | PROPOSE | Dr contract asset / Cr revenue, reversed on billing | controller | C-03 |
| Delivered, not invoiced | ESCALATE | derived from delivery record | account owner | C-09 |
| Cancellation with refund | ESCALATE | reverse remaining deferred, refund computed | controller, AR | C-04 |
| Acceptance clause, no acceptance doc | REFUSE | gate stays closed, search log | account owner | C-10 |
| Volume rebate | ESCALATE | estimate + true-up plan | controller | C-12 |
| Missed escalator | PROPOSE | catch-up invoice draft; revenue already right, billing wrong | AR, account owner | spec plant |
| Closed-won expansion, no invoice, no order form | ESCALATE | "is there a signed order form?" | deal owner | spec plant |
| Extracted date outside window / low OCR confidence | REFUSE / ESCALATE | none | preparer | F-09 / F-14 |

**Hand-offs.** Consumes `ar.credit_memo.posted`, `fact.activated`, `evidence.versioned`. Emits `rev.schedule.revised` (forecast, reporting, close), `billing.expectation.changed` (AR, forecast), `rev.recognized` (close), `rev.leakage.found` (AR).

**Learnable / never.** Learnable: SSP bands per SKU, escalator policy, customer-scoped concession facts with end date, who answers for which account. Never: treatment class for non-catalog modifications; granting concessions. KPMG warns a pattern of price reductions "taints" future contracts as variable consideration, so count concessions per customer and escalate the pattern.

**Metrics.** Contracts scheduled with no human; extraction field agreement vs answer key; leakage dollars found and days-to-detect (target: first under-billed invoice); roll-forward tied (y/n); modifications by treatment; false AUTO = 0.

---

## 2. Month-end close

**Triggers and inputs.** Calendar: pre-close (period end minus 3 business days), BD1-BD5, lock date. APQC-recommended practice: checklists, communicated cutoffs, reconciliations and entries moved pre-close, subledgers maximized. Bus: every function's `*.posted`. Comparators: AR/AP subledger vs GL control; schedule vs GL (prepaids, accruals, deferred revenue, contract assets); payroll register vs bank debit; **recurring-vendor gap** (billed 3+ consecutive months, nothing this month: D-01/D-04); **unreversed accrual** (D-02); **cutoff scan** (bills, receipts and disbursements in the first N days after period end whose service date falls in the prior period: the auditor's search for unrecorded liabilities, run continuously).

**Canonical objects.** `checklist_item(period, function, name, depends_on, status, blocked_reason, decision_ids)` · `accrual(id, vendor_id, period, method, amount_cents, reversal_mode, reversal_entry_id, matched_bill_id, owner, intent_id)` · `prepaid(id, vendor_id, total_cents, cover_start, cover_end, convention)` + `amort_line` · `recon(account, period, type: bank|subledger|schedule|rollforward|zero_balance, gl_cents, support_cents, diff_cents, evidence_trace_ids, certified_by, evidence_version)` · `period(id, status)` · `out_of_period_item(entry_id, belongs_to_period, materiality_workpaper_id)`.

**Deterministic pipeline.**
1. *DAG:* topological order over `depends_on`; an item is `ready` when its parents are done; critical path and blocked-age computed; the checklist, not the agent, says whether the close is finished (F-11).
2. *Accrual estimate, method hierarchy in code:* (1) receipt x PO price (received-not-invoiced); (2) usage data x contract rate; (3) contract fee x elapsed fraction; (4) trailing-3-month run-rate; (5) none -> ask the owner. The method rank drives the route.
3. *Auto-reversal:* for `auto_reverse`, the reversing entry is created atomically, dated day 1 of the next period, linked; exactly one per accrual. When the bill arrives it matches the accrual; the true-up difference goes to the same account in the current period (D-03).
4. *Prepaids:* daily rate = total / days covered; month = rate x covered days; final month takes the residual; convention written in the workpaper (D-05).
5. *Payroll accrual:* last register's daily cost x unpaid working days to period end + employer tax rate.
6. *Reconciliations:* per balance-sheet account, GL minus support; zero diff -> certify; trivial diff -> log (D-09) unless recurring or in a sensitive account (D-10).
7. *Flux review* (section 4), then *lock preconditions* in code: all items done or explicitly carried forward, all recons certified on current evidence versions, no open escalation in the period, trial balance balanced.
8. *After lock:* out-of-period routine: refuse the post, book in the current period tagged with the true period, compute quantitative materiality and the SAB 99 qualitative checklist, report as-reported vs as-adjusted.

**Where a model is needed.** Service period from a bill PDF ("quote the line stating the service dates"); the reason behind an orphaned accrual (search the departed owner's mail, quote the rationale); deciding whether a stopped vendor ended or is late (search for a termination notice; if none, say so). Never the estimate itself.

**Kernel checks.** F: schedules sum; reversal pairs net to zero; recon diff equals GL minus support, recomputed. E: usage export, PO or receipt cited; service-date quote is a substring. P: period open; reversal linked; lock signed by a human controller; preparer is not certifier. J: accrual method allowed by the policy memo; materiality policy in scope. **BLOCK:** any post to a locked period, even human-approved (G-03, B-23); the wrong-period half of a boundary-crossing statement (A-23); lock with a stale recon; **agents can never reopen a period**.

**Output cases.**

| Outcome | Route | Entry / artifact | Notified | Case |
|---|---|---|---|---|
| Cloud bill not received, usage data exists | PROPOSE | Dr expense / Cr accrued liabilities + linked reversal | controller | D-01 |
| True-up, immaterial | AUTO | difference to the same account | none | D-03 |
| Accrual never reversed, cost lands twice | ESCALATE | proposed correcting entry | controller | D-02 |
| Recurring vendor went silent | ESCALATE | "missing or ended?"; answer stored as a vendor fact | vendor owner | D-04 |
| Mid-month prepaid | AUTO | amortization schedule + JE | none | D-05 |
| Depreciation convention | AUTO | per stated convention | none | D-06 |
| Capitalize or expense | REFUSE | policy text + facts pack | controller | D-08 |
| Trivial recon difference | AUTO (log) | recon certified with note | none | D-09 |
| Trivial but recurring, sensitive account | ESCALATE | recurrence evidence | audit, controller | D-10 |
| Orphaned $30k accrual | ESCALATE once, then AUTO | reconstructed intent, quarterly true-up | controller | spec plant |
| $47k July invoice found 8 Aug | BLOCK July + PROPOSE August (ESCALATE if material) | out-of-period entry + materiality workpaper | controller, CFO | spec plant |
| Period lock | PROPOSE | `period_lock` artifact | controller | spine |
| Evidence changed after certification | ESCALATE | certification invalidated, re-run | preparer | F-06, H-6 |
| Worker died mid-close | ESCALATE | resume from checkpoint | controller | F-11 |

UNVERIFIED: the accounting frame for the late invoice (ASC 855 recognized subsequent event if statements are not yet issued; ASC 250 error vs estimate; SAB 108 dual rollover/iron-curtain test) was checked only against secondary summaries. Reopening must stay a human decision.

**Hand-offs.** Consumes everything. Emits `close.accrual.posted` (forecast: expected bill + terms), `close.tb.final` (reporting), `close.period.locked` (all; the kernel reads it), `close.out_of_period` (reporting, audit).

**Learnable / never.** Learnable: vendor -> accrual method and owner; recurring-vendor watchlist; checklist durations. Never: materiality loosened by the agent (G-08 clamp); suppression of a recurring small difference; a rule from a single correction (G-05); lock or reopen authority.

**Metrics.** Close duration in hours against APQC (median 6.4 days, top quartile 4.8, n=2,300); balance-sheet accounts tied to evidence (n of N); accrual accuracy (accrued vs actual); unreversed accruals = 0; blocked posts to locked periods (count, all persisted); stuck items with age and owner.

---

## 3. 13-week cash forecast (direct method)

AFP: the receipts-and-disbursements method "works best for short term forecasts and is only as reliable as the underlying data sources"; payables-based disbursements need adjusting because payments do not clear the day they are issued; keep the model simple.

**Triggers and inputs.** Calendar: weekly roll when the week's bank actuals land. Bus re-forecast: `fact.activated` (concession, promise-to-pay), `billing.expectation.changed`, `ap.bill.approved`, `ap.payment_run.scheduled`, `close.accrual.posted`, payroll calendar change, HR departure. Comparators: forecast opening cash vs GL cash vs reconciled bank; forecast AR base vs AR subledger total; AP likewise.

**Canonical objects.** `forecast_version(as_of, trigger_event_id, frozen)` (immutable) · `forecast_line(as_of, week, kind, source_ref, expected_date, amount_cents, method, fact_id)` · `payment_behaviour(customer_id, n, median_days_beyond_terms, spread)` · `payment_run_calendar` · `payroll_calendar` · `forecast_miss(week, source_ref, category, expected_cents, actual_cents, decision_id)` (the spec's table needs `source_ref` and `category`).

**Deterministic pipeline.**
1. Opening cash = GL cash = reconciled bank balance.
2. AR receipts: per open invoice, `expected_date = due_date + median days-beyond-terms` over the customer's last n>=5 paid invoices (portfolio median otherwise; n shown); facts override (promise date, dispute hold, concession amount).
3. Future billings from `billing_expectation` (carries escalators and concessions), same lag.
4. AP: approved bills snapped to the payment run on or before due date, plus clearing lag by payment method; held bills excluded; accrued-not-billed vendors from the close list.
5. Payroll and tax remittances from the calendar x last register; departures adjust.
6. Bucket by value date into Monday-Sunday weeks; closing(n) = opening(n+1); minimum-cash flag.
7. On roll: freeze the version; join frozen lines to bank actuals through bank-rec applications on `source_ref`; classify TIMING, AMOUNT, UNFORECAST, NON-OCCURRENCE, OPENING. Category totals sum exactly to the week's miss.

**Where a model is needed.** Only for a miss whose cause is not in the data: search mail and Slack for the reason (a customer's note that its payment run moved), quote it, and file a promise-to-pay `fact_candidate` with an expiry. Also the one-paragraph miss narrative, with numbers bound by code.

**Kernel checks.** F: opening ties; weeks chain; miss categories sum; every line has a `source_ref` or is labelled a management overlay. E: fact-driven lines cite an active, in-scope fact (the concession ends at renewal because `valid_to` says so). P: payment-run choices approved. J: overlays carry stated-by, scope, expiry. **BLOCK:** publishing a version whose opening cash does not tie; silently rewriting a frozen version.

**Output cases (all spec plants; no in-scope corpus IDs).**

| Outcome | Route | Artifact | Notified |
|---|---|---|---|
| Routine rebuild from ledger + facts | AUTO | new `forecast_version` | none |
| Concession fact lowers inflows through renewal | AUTO | lines carry `fact_id` | none |
| Customer pays two weeks late | AUTO | TIMING miss note; behaviour statistic recomputed | AR if beyond spread |
| Large miss, no reason found | ESCALATE | names what it does not know | account owner |
| Minimum-cash breach in horizon | ESCALATE | deferrable-bill options computed | CFO |
| "What gets paid this week" | PROPOSE | payment-run selection | AP, controller |
| Pipeline deal with no contract asked into the base case | REFUSE | upside scenario only | requester |
| Opening cash does not tie | BLOCK | intent to bank rec | bank rec |

**Hand-offs.** Consumes the events above. Emits `forecast.rebuilt`, `forecast.miss.classified` (AR collections, reporting), `forecast.min_cash.breach` (AP).

**Learnable / never.** Learnable: payment-behaviour statistics (recomputed, with n), promise-to-pay facts with expiry, vendor run calendars. Never: plugging a line to hit a target; a lag rule from one late payment; dispute outcomes.

**Metrics.** Absolute error by horizon (weeks 1, 4, 13) for receipts, disbursements and net; share of miss dollars attributed to a named cause; share of lines with a `source_ref`; event-to-new-version latency; lines driven by learned facts. Do not quote vendor accuracy benchmarks (the "90-95% in weeks 1-4" figure is a vendor claim, UNVERIFIED).

---

## 4. Reporting: flux and board pack

**Triggers and inputs.** `close.tb.final` (pre-lock flux), `close.period.locked` (pack), `close.out_of_period`, board calendar. Comparators: current vs prior month and vs forecast/budget, for every account and derived metric (gross margin %, opex ratio, DSO, deferred revenue, cash). Thresholds: dual dollar-and-percent, tighter for revenue and payroll, from the policy memo. The "$25k or 10%" figures in vendor guides are practice, not a standard.

**Canonical objects.** `tb_snapshot(id, period, max_gl_entry_id)` · `flux_line(snapshot_id, account|metric, comparator, base, current, delta_cents, delta_pct, threshold_id, material, qualitative_flags)` · `variance_driver(flux_line_id, rank, ref_type: decision|intent|party|absent_recurring, ref_id, contribution_cents, contribution_points)` · `flux_note(flux_line_id, template_text, bindings_json, coverage_pct)` · `report_number(artifact_id, label, query_hash, value_cents, snapshot_id)`.

**Deterministic pipeline.**
1. Freeze the snapshot; every number cites it.
2. Compute flux lines; apply thresholds plus SAB 99-style qualitative flags (recurrence, sign flip, covenant-linked, sensitive account).
3. Decompose each material delta: group `gl_line` in both periods by `source_decision_id -> intent_id`, party and kind; contribution = current minus base; rank by absolute value; add `absent_recurring` drivers.
4. Ratios use an exactly additive form. Driver i's contribution to the change in gross margin % is `(dProfit_i - GM0 x dRevenue_i) / Revenue_1`, and the contributions sum to `GM1 - GM0`. "Down three points" becomes a ranked list of points per decision.
5. Coverage = named drivers / delta; below policy (for example 80%) the residual is listed as unexplained.
6. For each driver pull the intent chain already stored: question, decision, quoted evidence, fact. The reason was captured at decision time; reporting does not re-investigate.
7. The model writes prose with placeholders; code renders the numbers.
8. Pack tie-outs: balance sheet balances; net income = change in retained earnings; cash = bank rec = forecast opening; deferred revenue = roll-forward closing.

**Where a model is needed.** Narrative only: "explain this variance to a CFO using only these drivers; cite decision ids; no numerals outside placeholders" (G-12: state the semantic link, do not restate the input).

**Kernel checks.** F: drivers + residual = delta; every numeral in the rendered text maps to a binding that re-queries to the same value. E: each causal claim cites a decision that is among the drivers; quotes are substrings. P: reviewer is not preparer; a final pack only on a locked period. J: narrative sign-off. **BLOCK:** any number not bound to the snapshot, including a human-typed override; a "final" pack on an open period.

**Output cases.**

| Outcome | Route | Artifact | Notified | Case |
|---|---|---|---|---|
| Below threshold, no flags | AUTO (log) | flux line only | none | D-09 analogue |
| Material, full coverage, template-only text | AUTO | flux note | none | spine (Initech line) |
| Gross margin down three points | PROPOSE | note with ranked point contributions | controller | track-doc plant |
| Material, coverage below policy | ESCALATE | residual named, transactions listed | account owner | none |
| Small but recurring, sensitive account | ESCALATE | recurrence pack | audit | D-10 |
| Entries with no decision or intent behind them | REFUSE to state a cause | transaction list | controller | none |
| Board pack | PROPOSE | pack with bound numbers | CFO | none |
| Number that does not tie / manual override | BLOCK | persisted with the rule | requester | G-01 pattern |

**Hand-offs.** Consumes `close.tb.final`, `rev.schedule.revised`, `forecast.miss.classified`, `close.out_of_period`. Emits `report.flux.unexplained` (owning function reopens an intent), `report.flux.cleared` (close lock gate), `report.pack.published`.

**Learnable / never.** Learnable: threshold bands per account (approved policy), account-owner map, scoped seasonal facts ("annual insurance renews in July"). Never: numbers; causal claims without a decision link; thresholds widened by the agent.

**Metrics.** Material variances explained at or above coverage policy (n of N, and dollar coverage); numbers bound to ledger queries (target 100%); unexplained residuals escalated; hours from final trial balance to flux pack; reviewer edits per note.

---

## Sources

- PwC Viewpoint, Revenue guide 2.9 Contract modifications: https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/revenue_from_contrac/revenue_from_contrac_US/chapter_2_scope_and__US/29contract_modificat_US.html
- KPMG, Revenue for software and SaaS handbook (May 2024), Questions E300, G75, G110, G120: https://kpmg.com/kpmg-us/content/dam/kpmg/frv/pdf/2024/revenue-software-saas-1.pdf
- Deloitte, Accounting Spotlight, contract modifications: https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/accounting-spotlight/2020/contract-modifications
- Deloitte Roadmap, 14.4 Contract assets; 14.7 Other presentation matters (contract-level netting); 15.2 disclosures: https://dart.deloitte.com/USDART/home/codification/revenue/asc606-10/roadmap-revenue-recognition/chapter-14-presentation/14-4-contract-assets · https://dart.deloitte.com/USDART/home/codification/revenue/asc606-10/roadmap-revenue-recognition/chapter-14-presentation/14-7-other-presentation-matters · https://dart.deloitte.com/USDART/home/codification/revenue/asc606-10/roadmap-revenue-recognition/chapter-15-disclosure/15-2-contracts-with-customers
- PwC Viewpoint, 33.4 Revenue disclosures (606-10-50-8): https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/financial_statement_/financial_statement___18_US/Chapter-33--Revenue-and-contract-costs/33-4-Revenue-disclosures-ASC-606.html
- SEC Staff Accounting Bulletin No. 99, Materiality: https://www.sec.gov/interps/account/sab99.htm
- CFO.com / APQC, Cycle time for monthly close: https://www.cfo.com/news/metric-of-the-month-cycle-time-for-monthly-close/659297/ · https://www.apqc.org/resource-library/resource/cycle-time-perform-monthly-close
- CPA Journal, risk-based search for unrecorded liabilities: https://www.cpajournal.com/2017/11/21/proper-risk-based-approach-search-unrecorded-liabilities/
- Deloitte Roadmap, subsequent-event considerations (secondary for ASC 855): https://dart.deloitte.com/USDART/home/codification/liabilities/asc450-10/deloitte-s-roadmap-contingencies-loss-recoveries/chapter-2-loss-contingencies-commitments/2-9-subsequent-event-considerations
- BDO, accounting changes and error corrections (ASC 250): https://www.bdo.com/insights/assurance/financial-reporting-guide-for-accounting-changes-and-error-corrections
- AFP, Selecting a cash forecasting methodology; Cash forecasting topic page: https://www.financialprofessionals.org/training-resources/resources/articles/Details/selecting-a-cash-forecasting-methodology · https://afponline.org/ideas-inspiration/topics/cashforecasting
- Flux threshold practice (vendor and practitioner, not standards): https://www.numeric.io/blog/should-you-give-a-flux-about-flux-analysis · https://www.forbes.com/councils/forbesfinancecouncil/2025/11/03/building-flux-and-variance-thresholds-that-actually-work/

UNVERIFIED this session: SAB 108 dual method; the as-invoiced practical expedient (606-10-55-18) applied to escalators; the AFP Treasury Management Handbook lender-reporting claim; all vendor forecast-accuracy figures. The gross-margin point decomposition and the miss taxonomy are my derivations (algebra checked), not cited practice.
