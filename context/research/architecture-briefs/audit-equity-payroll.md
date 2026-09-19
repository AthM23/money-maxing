# Architecture brief: Audit and controls, Equity-lite, Payroll touchpoints

For the diagram author. Date 2026-09-19. Source of truth: `context/PROJECT_SPEC.md` v3 (status: proposed). Scope guard: PROJECT_STATUS "Tried & rejected" drops *Equity as the function*; this brief stays inside **equity-lite (pack 9, stretch, second item in the cut order)**. Payroll is **not a pack**: it is two comparators, one proposal kind (`payroll_accrual`, third in the cut order) and events. Draw equity-lite and payroll with dashed borders. Audit (pack 8) is solid. All three sit on the shared layer: drift monitor -> intent -> router (rule -> haiku -> sonnet -> opus) -> investigator -> `propose_entry` + workpaper -> kernel F/E/P/J -> post / controller / Slack -> fact/policy memory -> replay/compile.

Marking: **[V]** verified this session against the primary source; **[S]** secondary source only; **UNVERIFIED** from memory, check before it goes on a slide.

**Schema gaps these processes expose (spec section 7 is "frozen" but cannot support them as written):**
1. No approval record. `decision.actor` exists; approver, approval time and authority limit do not. Need `approval(decision_id, approver, role, limit_cents, approved_at, channel_ref)`. Without it, self-approval and over-limit tests (G-02, B-24, G-04) have nothing to read.
2. `gl_entry` has `date` but no `posted_at` or `created_by`; `period` has `status` but no `locked_at`. Post-close, weekend and late-posting tests need all three.
3. No `blocked_attempt(id, decision_id, rule, attempted_by, approved_by, at, evidence_json)`. G-01/H-1 require the block to be persisted with its rule.
4. No `employee`, `grant`, `vest_tranche`, `valuation_409a`, `exercise`; `payroll_run` has no lines. `vendor` needs `tax_id, bank_hash, address_norm, created_by`.
5. `Proposal.kind` lacks `stock_comp_expense`, `forfeiture_reversal`, `option_exercise`, `final_pay`. The auditor needs a non-posting write: `audit.write_finding`.
6. `memory.*` is listed as *shared read for all functions*. The auditor must be fenced from it (see 1.8).

---

## 1. Audit and controls (pack 8)

### 1.1 Triggers and inputs
- Calendar: `period.status` open -> closing (interim pass) and closing -> locked (final pass). Event `period.locked`.
- Continuous: every `entry.posted` and `entry.blocked` event runs the JE screens (cheap, code only).
- Drift comparators that open audit intents: vendor bank details vs last paid; vendor-master self-join (duplicate vendor); accrual with no reversal by day 5 (D-02); same-sign immaterial variance in a fraud-sensitive account in 3 consecutive periods (D-10).
- Inputs: `gl_entry/gl_line`, `decision`, `workpaper.marks_json`, `approval`, `trace` (as-of), `vendor`, `bill`, `bank_txn`, approval matrix from the policy memo, `blocked_attempt`.

### 1.2 Canonical objects and keys
`audit_population(id, period, definition_json, n, total_abs_cents, content_hash)` · `audit_sample(id, population_id, method, seed, params_json)` · `audit_item(sample_id, gl_entry_id, selection_reason, stratum)` · `reperformance(item_id, original_verdict, rerun_verdict, mark_diffs_json, evidence_hash_then, evidence_hash_now)` · `control_test(id, control_id, period, attribute, n_tested, deviations)` · `finding(id, control_id, condition, criteria, cause, effect, recommendation, severity, item_ids_json, status)` · `pbc_pack(id, period, manifest_json, sha256)`. Keys: `gl_entry.id`, `decision.id`, `trace.id`; vendor stable key = normalised tax id, else bank hash.

### 1.3 Deterministic pipeline, in order
1. **Define population and prove completeness.** All `gl_entry` in the period. Checks: opening TB + sum of lines = closing TB per account; entry id sequence has no gaps; every entry has a `source_decision_id`. Freeze and hash. (Completeness of the JE population is standard practice under AS 2401.58-.62; the exact procedure is ours.)
2. **Carve out 100% items.** Any entry >= tolerable misstatement or >= the sampling interval is examined in full and is *not part of the sample* [V AS 2315.21].
3. **Select, three lanes, never mixed:**
   - *Random:* seeded PRNG, seed = H(period, population hash, auditor secret); stratified by function. Every item has a chance of selection [V AS 2315.24].
   - *Monetary-unit (PPS):* n = ceil(BV x confidence factor / tolerable misstatement), factor 3.0 for 95% confidence and zero expected misstatement (AICPA Audit Sampling guide table, UNVERIFIED this session); interval = BV/n; random start; walk cumulative absolute cents; pick the entry containing each k-th cent. PPS is named in AS 2315 fn 4 [V].
   - *Risk-based:* every entry that hits a screen in step 4. This is targeted selection, not a representative sample, so results are **never projected** to the population (follows from AS 2315.24).
4. **JE screens (code; criteria from AS 2401.61 [V]: unrelated/unusual/seldom-used accounts; preparers who do not normally post; period-end or post-closing entries with little explanation; round numbers or a consistent ending number).**
   - Round amount: `amount_cents % 100000 == 0`, or `% 10000 == 0` above materiality.
   - Post-close: `posted_at > period.locked_at` with `date` inside the locked period (should be impossible: this tests that the G-03 block operated).
   - Weekend/late: `posted_at` on Sat/Sun or outside 07:00-20:00 local; AS 2401.62 [V] says to focus on period end.
   - Self-approval: `approval.approver == decision.actor`, or approver == `vendor.created_by` for the paid vendor.
   - Unusual account pair: (debit account, credit account) frequency over Q2+July below the 1st percentile, or never seen.
   - Thin memo: memo under 15 characters on a manual or non-standard entry.
   - Recurrence: D-10 counter per account.
5. **Benford first-digit screen** on payment amounts: MAD and chi-square vs log10(1+1/d) [S Nigrini, JoA]. Run only when n is large (order of 1,000; exact floor UNVERIFIED). Northwind has 10 vendors, so July alone will be "insufficient n"; print that rather than a verdict.
6. **Duplicate-vendor entity resolution.** Normalise (case, punctuation, legal suffixes, NBSP per F-13; keep the raw string). Block on tax id, bank hash, phone, address. Score Jaro-Winkler on name plus exact hits on bank/tax id. Same bank hash under different names is always a hit. Output clusters with both records' payment histories (B-18).
7. **Re-perform.** `audit.rerun_kernel(decision_id)` re-fetches evidence from the trace store by `trace_id` (never the preparer's cached quotes), recomputes every F/E/P/J mark and diffs against `marks_json`. Compare evidence hashes then vs now: a change is H-6/F-06/A-24.
8. **Control tests (attribute sampling).** Per control: sample size from the tolerable deviation rate; count deviations [V AS 2315.31-.43]. Controls: SoD (COSO Principle 10: separate authorise / record / custody; alternative controls where impractical [S]); approval within matrix limit (B-24); learned rule ceiling <= its approver's limit (G-04); period lock; accruals reversed (D-02); vendor bank change confirmed out of band (B-17); **no departed employee holds approval authority after their end date** (consumes `hr.departure_detected`).
9. **Evaluate.** Project misstatement from random/MUS lanes only [V AS 2315.26]; compare to tolerable.
10. **Write up** each exception as condition / criteria / cause / effect / recommendation (IIA five attributes; GAO Yellow Book requires the first four [S]).
11. **Assemble the PBC pack:** population file + hash, sample with seed and parameters, per-item workpaper, evidence copies with sha256, approvals, re-performance diffs, control matrix, findings, tie-out sheet. A third party re-runs from the seed.

### 1.4 Where a model is needed
- *Cause* and *recommendation* text only. Condition, criteria and effect amounts are filled by code. The model must cite `gl_entry.id`, `trace_id` and a quote; the kernel's substring check applies to findings too.
- Borderline vendor clusters (score band 0.85-0.95): asked "same legal entity?", must cite the matching fields. Above the band is code; below is dropped.
- Business-rationale read of a screen hit: "does a document in the trace store explain this round amount / odd pair?" It must quote the contract or PO. No quote means no clearance.
- The auditor model is a different family from the preparer. It forms its view before it may read the preparer's `judgment` notes.

### 1.5 Validation and hard BLOCK rules
- F: population hash unchanged since selection; sample reproducible from seed; projection arithmetic recomputed.
- E: every finding cites existing ids; quotes are substrings; evidence hash matches.
- P: auditor identity != preparer, reviewer or approver of any sampled item; the auditor did not answer the escalation behind the item.
- J: cause and recommendation are recorded as `judgment`.
- BLOCK (storage layer, not prompt): the auditor cannot call `propose_entry`; it cannot write `fact` or `policy`; nobody can close a finding without a linked remediation decision; population and sample rows are immutable after freeze; a screen cannot be disabled by a fact.

### 1.6 Output cases
| Outcome | Route | Artifact | Notified | Corpus |
|---|---|---|---|---|
| Sampled entry re-performs identically | AUTO | re-performance workpaper | nobody | spine step 4 |
| Re-run mark differs, or evidence hash changed | ESCALATE | finding + intent to the owning function; downstream state invalidated | controller | H-6, F-06, A-24 |
| Round payment, contract/PO quote supports it | AUTO (annotated, stays in population) | screen note | nobody | track-doc plant |
| Round payment, no support found | ESCALATE | finding | controller + AP owner | track-doc plant |
| Self-approved request found posted | ESCALATE | finding (control failure, high severity) | CFO, not the approver | G-02 detective side |
| Self-approval / closed-period / over-limit attempt | BLOCK (by kernel); audit tests that the block row exists | `blocked_attempt` + control test pass | controller | G-01, H-1, G-02, G-03, B-23, B-24, G-04 |
| Duplicate vendor cluster | ESCALATE | cluster report with payment histories | AP owner | B-18 |
| Near-duplicate payment across the cluster | ESCALATE | finding | AP owner | B-14 |
| Accrual never reversed | ESCALATE | finding | close owner | D-02 |
| Immaterial, recurring, fraud-sensitive | ESCALATE | finding | controller | D-10 |
| Population fails completeness | REFUSE | "cannot audit: population does not tie", with the differences | controller | - |

### 1.7 Hand-offs
Consumes `entry.posted`, `entry.blocked`, `period.locked`, `hr.departure_detected`, `vendor.bank_changed`. Emits `audit.finding_opened` (opens an intent in the owning function; remediation goes through the normal `propose_entry` path in the current period), `audit.evidence_invalidated`, `audit.pack_ready` (close checklist item; reporting).

### 1.8 Learnable vs never learned (independence)
- Learnable: confirmed vendor alias clusters (master data, owned by AP); account-pair frequency baseline; screen ranking weights; finding wording.
- Never: a suppression. An explained hit is annotated and **stays eligible for selection**. The auditor never reads `memory.facts`, `memory.policies` or `memory.similar_decisions` for rationale. It gets `audit.fact_provenance(fact_id)` only, which tests the fact as a control: approved by someone with authority, in scope, valid on the date, source quote is a substring. Sample sizes may fall only on the auditor's own control-test results, never on the preparer's replay agreement or autonomy level. The seed is not visible to preparers (unpredictability, AS 2401).

### 1.9 Metrics
Population n and dollars · coverage by lane (% items, % dollars) · re-performance agreement · evidence-hash mismatches · screen hits and cleared-with-quote share · deviations per control vs tolerable rate · projected misstatement vs tolerable · blocks verified / blocks attempted · planted-exception recall (4 of 4 track-doc plants) · minutes to a reproducible PBC pack.

---

## 2. Equity-lite (pack 9, stretch)

### 2.1 Triggers and inputs
- Drift comparator **grants ledger vs stock-comp expense**: per grant, schedule-expected cumulative expense vs GL. Catches the planted "departed employee still accruing".
- Trace events: board consent PDF (new grant); Slack HR departure notice; exercise notice; bank deposit tagged as exercise.
- Calendar: month-end expense run; 409A valuation age reaches 10 and 12 months; 1 January (ISO year roll); every grant (Rule 701 rolling sum); post-termination exercise expiry.
- Files: grants ledger, 409A report, plan document, valuation assumptions file.

### 2.2 Canonical objects and keys
`employee(id, state, start, end_date)` · `grant(id, employee_id, type ISO|NSO|RSU, shares, strike_cents, board_approval_date, vest_start, cliff_months, vest_months, early_exercise, gdfv_cents_per_share)` · `vest_tranche(grant_id, vest_date, shares, status)` · `valuation_409a(id, valuation_date, fmv_cents, appraiser, report_trace_id)` · `exercise(id, grant_id, date, shares, cash_cents, bank_txn_id)` · `sbc_schedule(grant_id, month, expense_cents, method)`. Policy facts: attribution method, forfeiture election.

### 2.3 Deterministic pipeline, in order
1. **Ingest the grant.** Extract fields from the board consent; tie to the grants ledger row (shares, strike and date must agree).
2. **Compliance checks** (section 2.6). They run before anything posts, but they never stop expense recognition: accounting follows the grant as made.
3. **Grant-date fair value.** Black-Scholes in code. Inputs come from the assumptions file only: FMV from the 409A, strike, expected term (simplified method for plain-vanilla options = midpoint of vesting and contractual term; SAB Topic 14 / private-company expedient, UNVERIFIED this session), peer volatility, Treasury rate for that term, zero dividends. The model picks none of them.
4. **Attribution.** Policy election for service-only graded awards [S ASC 718-10-35-8 via PwC and Deloitte]: *straight-line* over the whole award, or *graded* (each tranche treated as its own award, front-loaded). **Floor in both:** cumulative cost at any date >= grant-date value of the vested portion. Reuses the revenue schedule engine; integer cents; the last month absorbs rounding.
5. **Forfeitures.** Policy election [S ASC 718-10-35-3]: *as they occur*, or *estimated* with true-ups. Recommend as-they-occur for the build: it is deterministic and needs no rate. If estimated, re-check the floor, since an under-run breaches it (Deloitte).
6. **Termination.** Tranches with `vest_date > end_date` are forfeited. `reversal = recognised_to_date - gdfv(vested tranches)`. Entry: Dr APIC, Cr stock-comp expense, in the current open period. Vested cost is never reversed. Stop the schedule. Set the exercise expiry from the plan; an ISO exercised more than 3 months after employment ends loses ISO treatment (IRC 422(a)(2), UNVERIFIED this session).
7. **Monthly run.** One `stock_comp_expense` proposal per period: Dr expense by department, Cr APIC. The kernel ties the schedule to GL.
8. **Exercise cash.** Expected = shares x strike. Match the bank deposit exactly. Entry: Dr cash, Cr common stock and APIC. Shares must be <= vested, unless `early_exercise`. An NSO exercise emits a payroll withholding event.

### 2.4 Where a model is needed
- Board-consent extraction (haiku): grantee, type, shares, strike, date, vesting text. Each field carries a quote; the kernel checks the substring and that the fields equal the grants ledger row.
- HR notice extraction: employee, last day, voluntary or not. Quote required.
- "Has anything material happened since the 409A?" The model searches traces for a priced round, term sheet, acquisition offer or major contract after `valuation_date`. It cites what it found or lists where it looked. It never concludes the valuation is still good; a hit only escalates.

### 2.5 Validation and BLOCK
- F: schedule sums to gdfv x shares expected to vest; cumulative >= vested floor; reversal <= recognised to date; exercise cash == shares x strike; shares exercised <= vested.
- E: grant ties to consent quote and ledger row; termination date is corroborated by a second source (payroll register or HRIS) before any reversal posts.
- P: the grant has board approval evidence; nothing posts to a locked period (a July termination discovered in August books in August).
- J: method and election facts are active and approved.
- BLOCK: exercise over vested shares; exercise after expiry; expense run with an unapproved method; backdating a grant date. A compliance failure is **not** a posting BLOCK. It is an ESCALATE with a persistent flag.

### 2.6 The four compliance checks, wording verified
1. **409A valuation window** [V 26 CFR 1.409A-1(b)(5)(iv)(B)]. Using a prior value "is not reasonable as of a later date if such calculation fails to reflect information available after the date of the calculation that may materially affect the value of the corporation ... or the value was calculated with respect to a date that is more than 12 months earlier than the date for which the valuation is being used." The independent-appraisal presumption covers an appraisal "as of a date that is no more than 12 months before the relevant transaction ... (for example, the date of grant of a stock option)." The IRS can rebut only by showing the method or its application was "grossly unreasonable." **Correction to the spec:** this is a rebuttable presumption, not a rule, and it has two limbs. Code checks `grant_date - valuation_date <= 12 months`. The material-event limb is the model-assisted search in 2.4 and always escalates on a hit.
2. **Strike >= FMV** [V 1.409A-1(b)(5)(i)(A)(1)]: "The exercise price may never be less than the fair market value of the underlying stock ... on the date the option is granted." For ISOs separately [V IRC 422(b)(4)]: "the option price is not less than the fair market value of the stock at the time such option is granted." A 10% shareholder needs 110% and a 5-year term (422(c)(5), UNVERIFIED this session). Code: `strike_cents >= fmv_cents` of the valuation in force on the grant date.
3. **ISO $100K** [V IRC 422(d)]. Where the aggregate FMV of stock for which ISOs "are exercisable for the 1st time by any individual during any calendar year (under all plans of the individual's employer corporation and its parent and subsidiary corporations) exceeds $100,000, such options shall be treated as options which are not incentive stock options"; applied "in the order in which they were granted"; FMV "determined as of the time the option ... is granted." Code: per employee and calendar year, sum tranche shares x grant-date FMV over tranches first exercisable that year, in grant order; the excess is tagged NSO. An early-exercisable grant counts in full in the grant year. Acceleration forces a re-run. The test uses FMV, not strike.
4. **Rule 701(e) $10M** [V 17 CFR 230.701(e); S March 2026 C&DIs via DLA Piper]. "If the aggregate sales price or amount of securities sold during any consecutive 12-month period exceeds $10 million, the issuer must deliver" the enhanced disclosure "a reasonable period of time before the date of sale": plan summary, risk factors, and financial statements dated no more than 180 days before the sale. For options, delivery is before exercise (e)(6), and options count at grant, at exercise price (d)(3). Per the C&DIs, RSUs count at grant and need disclosure before the grant (271.24), and a miss loses the exemption for every award in that 12-month period (271.27). **Correction:** the check has to be predictive. Compute the rolling 12-month sum on every proposed grant and warn at 80%. Also missing from the spec: the exemption's own cap in (d)(2), the greatest of $1M, 15% of total assets, or 15% of the outstanding class.

### 2.7 Output cases (the corpus has no equity cases; these are spec plants)
| Outcome | Route | Artifact | Notified |
|---|---|---|---|
| Monthly expense, all facts in force | AUTO | stock-comp JE + schedule workpaper | nobody |
| New grant ties to consent, checks pass | PROPOSE | grant record + schedule | controller |
| Termination corroborated by two sources | PROPOSE | forfeiture reversal JE | controller |
| Termination seen only in Slack | ESCALATE | question to the HR owner; the answer becomes a fact | HR owner |
| 409A older than 12 months, or material event found | ESCALATE | compliance flag; expense still runs | CFO, counsel |
| Strike below FMV | ESCALATE | flag | CFO, counsel |
| ISO over $100K | PROPOSE | ISO/NSO split per tranche | equity admin, payroll |
| Rule 701 at 80% / would be crossed | PROPOSE / ESCALATE before the grant | rolling-sum workpaper | CFO, counsel |
| Exercise cash equals shares x strike | AUTO | cash + equity JE, bank line matched | nobody |
| Exercise over vested shares, or after expiry | BLOCK | `blocked_attempt` | equity admin |
| Asked "is this valuation defensible?" or "what tax does the holder owe?" | REFUSE | everywhere it looked | CFO |

### 2.8 Hand-offs
Consumes `hr.departure_detected`, `bank.deposit_unmatched`, `board.consent_ingested`. Emits `equity.forfeiture`, `equity.expense_revised` (close, reporting flux), `equity.exercise_expected` (bank rec; forecast shows it as a memo line, not an inflow), `equity.nso_exercise` (payroll withholding), `equity.compliance_flag` (audit).

### 2.9 Learnable vs never
- Learnable: department and account mapping; who confirms terminations; the company's elections, stated once and stored as facts with an approver.
- Never: thresholds, windows or statutory wording (universal tier, hard-coded, with citations); volatility or term assumptions; "counsel said it's fine" widened beyond the single grant it covered.

### 2.10 Metrics
Grants scheduled · schedule-to-GL tie (cents) · days from termination to reversal · over-accrual caught (dollars) · four checks run and flagged, with n · exercises matched · Rule 701 headroom.

---

## 3. Payroll touchpoints (inputs only)

### 3.1 Triggers and inputs
Comparator **payroll register vs bank debit** on every bank sync; month-end calendar event; `hr.departure_detected`. Sources: `payroll_run` plus lines (gross, employee withholding, employer tax, benefits, net, per employee), `bank_txn`, the policy memo.

### 3.2 Objects and keys
`payroll_run(id, period_start, period_end, pay_date)` · `payroll_line(run_id, employee_id, gross, ee_tax, er_tax, benefits, net)` · provider stable key = ACH originator company id, never the descriptor string (A-09, H-3: `GUSTO PAYROLL` vs `GUSTO TAX COLLECTION`).

### 3.3 Pipeline
1. **Comparator.** A provider pulls several debits per run. sum(net) = net-pay debit; sum(ee_tax + er_tax) = tax debit; the fee debit goes to expense. Each bank line matched exactly once; residual must be 0 cents.
2. **Accrual.** Unpaid working days from the last `period_end` to month end. Per active employee: daily rate x days. Add employer tax: Social Security 6.2% up to the $184,500 wage base for 2026 [V SSA for the base], tracked year to date; Medicare 1.45%; FUTA on the first $7,000 (rates UNVERIFIED this session); state unemployment and benefit rates from the policy memo. Flagged to auto-reverse on day 1 (kernel P mark).
3. **Final pay.** Prorated salary to `end_date` plus PTO payout per policy. Federal law does not require immediate final pay; "some states ... may require immediate payment" [V DOL]. The due date is therefore a state-scoped fact. If it is unknown, escalate once.
4. **Forecast feed.** Payroll lines in the 13-week forecast are rebuilt from the active roster; the departed employee drops out from the next run; final pay is inserted.

### 3.4 Model
HR-notice extraction only. No model computes pay.

### 3.5 Validation and BLOCK
F: register foots; debits equal register; accrual days are computed from the calendar. E: every employee in the accrual is active on the date. P: accrual carries the reversal flag; nothing posts to a locked period. BLOCK: paying someone after `end_date`; a payroll debit to an unknown originator id.

### 3.6 Output cases
| Outcome | Route | Artifact | Notified | Corpus |
|---|---|---|---|---|
| Register equals debits | AUTO | matched lines | nobody | - |
| Descriptor changed, originator id same | AUTO | match on the stable key | nobody | A-09, H-3 |
| Debit differs from register | ESCALATE | itemised difference | payroll owner | - |
| Month-end accrual | PROPOSE, then AUTO once it climbs the ladder | `payroll_accrual` JE with reversal | controller | D-01 pattern |
| Accrual not reversed | ESCALATE | audit finding | close owner | D-02 |
| Final-pay due date unknown for the state | ESCALATE once; the answer is a state-scoped fact | question | HR owner | - |

### 3.7 The departure ripple (draw this as the cross-function sequence)
Slack HR notice -> trace -> extraction -> fact candidate `employment_end` -> corroborate with the payroll register -> `hr.departure_detected` -> (a) payroll: final pay, drop from accrual; (b) equity-lite: forfeit tranches, reversal JE, exercise-expiry timer; (c) forecast: payroll outflow down, final pay in; (d) close: checklist "terminations processed"; (e) reporting: flux lines on payroll and stock comp; (f) audit: approval-matrix control test, and a sample of the reversal. One intent id on every artifact. The grants-vs-expense comparator is the safety net if the notice is missed.

### 3.8 Learnable vs never
Learnable: originator ids, benefit rates, state final-pay facts, who answers. Never: statutory tax rates and wage bases (a versioned table with a source), and descriptor strings as predicates.

### 3.9 Metrics
Runs tied to the cent · accrual vs the actual next run (absolute error) · departures processed within one pay cycle · repeat questions (target 0).

---

## Sources
- PCAOB AS 2315, Audit Sampling: https://pcaobus.org/oversight/standards/auditing-standards/details/AS2315 (an amended version, paragraphs .18A and .23A, is marked effective 12/15/2026; rulemaking link not confirmed: https://pcaobus.org/oversight/standards/auditing-standards/details/as-2315--audit-sampling-(effective-on-12-15-2026))
- PCAOB AS 2401, Consideration of Fraud, paragraphs .58-.62: https://pcaobus.org/oversight/standards/auditing-standards/details/AS2401
- PCAOB staff, Audit Focus: Journal Entries: https://pcaobus.org/resources/staff-publications/audit-focus/audit-focus-journal-entries
- AU-C 240 (AICPA) journal entry testing, secondary summary: https://cpahalltalk.com/journal-entry-testing/
- COSO Principle 10 and segregation of duties (Deloitte): https://www.deloitte.com/ng/en/services/audit-assurance/perspectives/coso-control-activities.html
- IIA, The Five Attributes Approach: https://internalauditor.theiia.org/en/articles/2023/february/the-five-attributes-approach/ ; GAO Yellow Book: https://www.gao.gov/yellowbook
- Benford's law on journal entries (Journal of Accountancy, Sep 2022): https://www.journalofaccountancy.com/issues/2022/sep/using-benfords-law-reveal-journal-entry-irregularities/
- 26 CFR 1.409A-1(b)(5): https://www.law.cornell.edu/cfr/text/26/1.409A-1
- IRC 422: https://www.law.cornell.edu/uscode/text/26/422
- 17 CFR 230.701: https://www.law.cornell.edu/cfr/text/17/230.701
- SEC Rule 701 C&DIs of 6 March 2026 (DLA Piper summary): https://marketedge.dlapiper.com/2026/03/sec-issues-new-and-revised-guidance-related-to-rule-701/ ; SEC C&DI Section 271 (PwC mirror): https://viewpoint.pwc.com/dt/us/en/sec/cdis/cdis_US/securities_act_rules__1_US/questions_and_answer__14_US/section_271_rule_701_US.html
- ASC 718 graded vesting and the floor (PwC 2.8): https://viewpoint.pwc.com/content/pwc-madison/ditaroot/us/en/pwc/accounting_guides/stockbased_compensat/stockbased_compensat__3_US/chapter_2_measuremen_US/28_awards_with_grade_US.html ; Deloitte Roadmap 3.6: https://dart.deloitte.com/USDART/home/codification/expenses/71x/asc718-10/roadmap-share-based-payments/chapter-3-recognition/3-6-requisite-service-period-for
- SSA 2026 taxable maximum $184,500: https://www.ssa.gov/oact/cola/cbb.html
- DOL, last paycheck: https://www.dol.gov/general/topic/wages/lastpaycheck
- Repo: context/PROJECT_SPEC.md sections 3, 6, 6b, 7, 8, 9, 11; tests/edge-cases/office-of-the-cfo.md sections G, H, J; tests/cases.csv
