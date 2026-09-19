# Office of the CFO — Edge Case Corpus

A test catalogue for finance-agent systems: the scenarios that live in the hard tail.
Every case below is either (a) named explicitly by a winning project in the Maximor
Syndicate hackathon, or (b) a standard failure mode in corporate accounting that a
naive matcher will get wrong.

**Use:** seed your fixture from this, label the ground truth from this file, and score
your system on the route it chooses — not just on whether it matched something.

---

## How to read this

Every case carries an **expected route**. The route matters more than the match: a
system that matches 99% and can't tell you which 1% is wrong is worse than one that
matches 85% and partitions the rest correctly.

| Route | Meaning |
|---|---|
| `AUTO` | Clear unattended. No human sees it. A wrong `AUTO` is the cardinal sin — it is a false auto-post. |
| `PROPOSE` | High confidence, but a human clicks approve. Evidence attached. |
| `ESCALATE` | The system does the investigation and hands over the decision. It names what it doesn't know. |
| `REFUSE` | The system declines to propose anything. "Here is everywhere I looked. You decide." |
| `BLOCK` | The system prevents an action **even when a human approves it**. Persisted with the rule that caused the block. |

Difficulty tags: `T1` a decent matcher should handle it · `T2` separates good from
average · `T3` boss level, most systems fail.

---

## Contents

- [A. Bank reconciliation and cash matching](#a-bank-reconciliation-and-cash-matching)
- [B. Accounts payable, invoices and three-way match](#b-accounts-payable-invoices-and-three-way-match)
- [C. Revenue, AR and cash application](#c-revenue-ar-and-cash-application)
- [D. Accruals and period-end judgment](#d-accruals-and-period-end-judgment)
- [E. Multi-entity, intercompany and treasury](#e-multi-entity-intercompany-and-treasury)
- [F. Data, ingestion and infrastructure](#f-data-ingestion-and-infrastructure)
- [G. Control, authority and learning](#g-control-authority-and-learning)
- [H. Boss-level cases, in full](#h-boss-level-cases-in-full)
- [I. Minimum viable fixture](#i-minimum-viable-fixture)
- [J. Scoring rubric](#j-scoring-rubric)

---

## A. Bank reconciliation and cash matching

The canonical workflow. Two independent records of the same reality; every difference
must have a name.

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| A-01 | **Deposit in transit** — book records a 30 Sept deposit, bank shows it 2 Oct | Naive matcher calls it unmatched and flags an error | Recognise as a timing difference. It is a reconciling item, **not** a journal entry | `AUTO` | T1 |
| A-02 | **Outstanding check** — check 1042 issued 22 Sept, still uncleared at month end | Same as above; also must not be double-counted next month when it clears | Timing difference. Carry forward, expect it to clear | `AUTO` | T1 |
| A-03 | **Wire fee netted from a receipt** — book 8,250.00, bank credits 8,232.50 | Amounts don't match, so exact/tolerance passes both miss it | Match on counterparty + date + plausible fee delta. Propose a journal entry for the 17.50 to bank charges | `PROPOSE` | T2 |
| A-04 | **Standalone bank charge** — bank debits 300.00, no book entry exists at all | Nothing to match against; easy to leave in an undifferentiated "unmatched" pile | Recognise as an error of omission. Propose Dr bank charges / Cr cash | `PROPOSE` | T1 |
| A-05 | **Many-to-one** — one 18,400 wire settles four open invoices | Subset-sum; explodes combinatorially if unbounded | Bound the search by counterparty and date window first, then solve. Show which four | `PROPOSE` | T2 |
| A-06 | **One-to-many** — a single payment run posts as one book entry, settles as three bank debits | The inverse shape; most matchers only implement many-to-one | Symmetric handling | `PROPOSE` | T2 |
| A-07 | **Processor payout net of fees** — Stripe deposits 9,420.00 covering 9,700.00 of gross revenue | The deposit will *never* equal the invoice. Cited by Tickmark | Expand one payout into three rows: bank at net, revenue at gross, fee as expense | `PROPOSE` | T3 |
| A-08 | **FX receipt** — customer invoiced EUR 10,000, bank credits USD 10,842.16 | Rate is unknown to the matcher; also produces a realised FX gain/loss | Match on counterparty + invoice ref, derive implied rate, post the FX difference separately | `ESCALATE` | T3 |
| A-09 | **Descriptor mutation across periods** — `GUSTO PAYROLL` in March, `GUSTO TAX COLLECTION` in April | A rule learned from one month's wording silently fires zero times the next. Tickmark's exact bug | Never cut a predicate from one statement's literal string. Match on a stable key | `AUTO` after normalisation | T3 |
| A-10 | **Abbreviated trading name** — `ACME CLOUD SVCS` on the bank, `Acme Cloud Services Inc.` in the ledger | Pure string similarity is fragile and will also produce false positives | Entity resolution with a confidence score; explanation must state the semantic link, not restate the amounts | `PROPOSE` | T2 |
| A-11 | **Memo describes the spend, not the payee** — ledger says "Q3 conference booth", bank says `CASCADE EVENTS LLC` | No lexical overlap whatsoever. Close Controller's fixture includes this deliberately | This is where the model tier earns its place. Rules should correctly leave it alone | `PROPOSE` | T3 |
| A-12 | **Transposed reference** — invoice `10432` entered as `10423` | Exact match fails; fuzzy on the number alone is dangerous | Match on amount + counterparty + near-reference, flag the transposition explicitly | `PROPOSE` | T2 |
| A-13 | **True duplicate payment** — same vendor, same amount, same invoice ref, 3 days apart | Missing it costs real money. Over-flagging it annoys everyone | Detect and block. This is the one that must never `AUTO` through | `BLOCK` | T2 |
| A-14 | **False duplicate** — same vendor, same amount, same day, two legitimate invoices | A naive duplicate rule destroys a valid payment | Distinguish on invoice reference / PO. Do not suppress | `AUTO` | T3 |
| A-15 | **Returned ACH / NSF** — a receipt posts, then reverses 4 days later | Both legs match independently; net effect is zero but AR is now wrong again | Pair the reversal to its original, reopen the receivable | `PROPOSE` | T2 |
| A-16 | **Stale-dated check clears** — check written in March clears in September | Outside any reasonable date window | Widen the window for outstanding items specifically; don't apply the same tolerance everywhere | `PROPOSE` | T2 |
| A-17 | **Void and reissue** — check 1042 voided, check 1099 issued, same payee, same amount | Looks exactly like a duplicate | Recognise the void entry; link the pair | `ESCALATE` | T3 |
| A-18 | **Ambiguous same-amount pair** — two 4,500.00 debits on the same day to different vendors | Any 1:1 matcher will pick one arbitrarily and be right 50% of the time | Refuse to guess. Present both candidates | `ESCALATE` | T2 |
| A-19 | **Internal transfer / sweep** — 50,000 moves between the company's own two accounts | Booked as revenue or expense by a careless system; also double-counts cash | Recognise both legs, net to zero, never touch P&L | `AUTO` | T2 |
| A-20 | **Partial payment with deduction** — customer pays 9,850 against a 10,000 invoice | Is the 150 a short-pay dispute, a discount taken, or a fee? | Match to the invoice, classify the 150, escalate if the reason isn't derivable | `ESCALATE` | T2 |
| A-21 | **Overpayment** — customer pays 12,000 against a 10,000 invoice | Creates a credit on account, not revenue | Apply 10,000, park 2,000 as customer credit | `PROPOSE` | T2 |
| A-22 | **Zero and negative rows** | Division by zero in percentage logic; sign-flip bugs | Handle explicitly; a 0.00 line is valid data | `AUTO` | T1 |
| A-23 | **Statement crosses the period boundary** — a statement covering 25 Sept to 5 Oct | Half the rows belong to a period that may already be closed | Split on cutoff; refuse to post the October half into September | `BLOCK` on the wrong-period half | T2 |
| A-24 | **Amended statement** — bank re-issues the statement with a corrected line after you reconciled | Your workpaper now looks clean but rests on evidence that changed underneath it. Meridian's core insight | Invalidate downstream state, mark the reconciliation stale, re-run | `ESCALATE` | T3 |
| A-25 | **Bank error** — bank posts 4,500 where the instruction was 4,050 | Genuinely the bank's fault; correcting entry arrives days later | Flag as a difference requiring external confirmation. Do not force a plug entry | `ESCALATE` | T3 |

---

## B. Accounts payable, invoices and three-way match

Roughly 12.5% of invoices need manual rework, they take 45–60 minutes each, and they
consume 60–70% of an AP team's time. Everyone automates the clean ones. This section
is the actual market.

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| B-01 | **Quantity variance / short ship** — PO 200 units, GRN 196, invoice 200 | Paying the invoice as presented overpays for 4 units | Pay 196 × PO price. Short-pay the rest with a stated reason | `PROPOSE` | T1 |
| B-02 | **Price variance (PPV)** — PO at 18.00/unit, invoice at 18.50 | Within tolerance it's noise; outside it's an unauthorised increase | Compare to tolerance policy, propose the correct payable, flag the variance | `PROPOSE` | T1 |
| B-03 | **Both at once** — 196 received, invoiced at 18.50 for 200 | Two independent variances compound; systems report one and miss the other | Report both, compute the policy-correct payable (196 × 18.00) | `ESCALATE` | T2 |
| B-04 | **Over-receipt** — GRN 204 against a PO of 200 | Do you pay for goods you didn't order? | Policy-dependent. Escalate with the over-receipt tolerance stated | `ESCALATE` | T2 |
| B-05 | **No PO** — invoice arrives with no purchase order at all | Two-way match only; no independent confirmation of price | Route by spend category and amount. Never auto-clear above the no-PO threshold | `ESCALATE` | T1 |
| B-06 | **Services with no GRN** — consulting invoice, nothing was ever "received" | Three-way match is structurally impossible | Substitute an acceptance/approval record as the third leg, or escalate | `ESCALATE` | T2 |
| B-07 | **Split delivery** — one PO, three GRNs across two months | Each GRN individually under-matches the invoice | Accumulate receipts against the PO line, match on the running total | `PROPOSE` | T2 |
| B-08 | **Multiple invoices against one PO** — vendor bills in four instalments | Each invoice looks like a partial mismatch | Track PO consumption; flag when cumulative invoicing exceeds the PO | `PROPOSE` | T2 |
| B-09 | **One invoice spanning multiple POs** | Line-level allocation required; most matchers work at header level | Allocate lines to POs, match each | `ESCALATE` | T3 |
| B-10 | **Unit-of-measure mismatch** — PO in cases of 12, invoice in individual units | Quantities look wildly different; amounts may still agree | Normalise UOM before comparing. If no conversion is known, refuse | `REFUSE` if no conversion | T3 |
| B-11 | **Freight not on the PO** — invoice adds a 180.00 shipping charge | Total exceeds PO, but the charge may be legitimate | Separate goods variance from freight variance; apply the freight policy | `PROPOSE` | T2 |
| B-12 | **Tax variance** — VAT applied at the wrong rate, or applied to a non-taxable item | Small amounts, large compliance consequences | Recompute tax from the rate table; flag any difference regardless of size | `ESCALATE` | T2 |
| B-13 | **Exact duplicate invoice** — same invoice number submitted twice | Straightforward if you index on vendor + invoice number | Block the second | `BLOCK` | T1 |
| B-14 | **Near-duplicate** — vendor reissues with a new invoice number, same amount, same period | Invoice number index misses it entirely | Fuzzy duplicate detection on vendor + amount + date proximity, escalate rather than block | `ESCALATE` | T3 |
| B-15 | **Internal inconsistency** — invoice header total 1,250.00, line items sum to 1,205.00 | Extraction is silently wrong, or the invoice itself is wrong | Never accept. Internal consistency is a free validator — use it | `REFUSE` | T2 |
| B-16 | **Credit memo** — negative invoice against a prior overbilling | Sign conventions break; may be applied to the wrong invoice | Apply to the specific original, never to an arbitrary open balance | `PROPOSE` | T2 |
| B-17 | **Vendor bank details changed** — invoice carries a new remit-to account | The single highest-value fraud vector in AP | Block payment pending out-of-band confirmation. Never auto-clear | `BLOCK` | T2 |
| B-18 | **Duplicate vendor master records** — "Northwind Supply" and "Northwind Supply Co" as two vendors | Duplicate payment protection fails because the key differs | Entity resolution at the vendor-master level, not just the transaction level | `ESCALATE` | T3 |
| B-19 | **Currency mismatch** — PO in USD, invoice in EUR | Comparing amounts directly is meaningless | Convert at the contractual rate, not today's spot | `ESCALATE` | T3 |
| B-20 | **Early payment discount** — 2/10 net 30, paid on day 8 | The correct payable depends on the *payment date*, which hasn't happened yet | Compute both amounts, propose with the discount deadline surfaced | `PROPOSE` | T2 |
| B-21 | **Retainage** — construction invoice with 10% held back until completion | Payable ≠ invoice total by design | Recognise the holdback as a separate liability | `ESCALATE` | T3 |
| B-22 | **Deposit already applied** — 30% prepayment made two months ago | Paying the full invoice double-pays the deposit | Net the prepayment; this is a duplicate-payment case wearing a different costume | `BLOCK` if unnetted | T3 |
| B-23 | **Invoice dated into a closed period** | Posting it reopens a signed-off month | Route to the current period with a stated reason, or block | `BLOCK` | T2 |
| B-24 | **Over the approver's limit** — 14,000 invoice, Controller limit 10,000 | The approval succeeds in most systems because nobody checks | Block, route to the next authority level | `BLOCK` | T2 |
| B-25 | **Evidence in a portal with no API** — the delivery note only exists in the supplier's web portal | The decision is easy; gathering the evidence is the work. Tieout's core observation | Browser automation with a saved session; screenshot everything read | `PROPOSE` | T3 |
| B-26 | **Vendor statement disagreement** — vendor says 84,200 outstanding, your AP subledger says 61,750 | Requires reconciling two whole populations, not two rows | Produce the difference itemised: invoices they have that you don't, and vice versa | `ESCALATE` | T3 |

---

## C. Revenue, AR and cash application

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| C-01 | **Multi-element bundle** — 27,000 contract = platform + implementation, no prices stated | Revenue must be allocated by standalone selling price, not by what the contract says | Allocate by SSP ratio; recognise implementation at a point in time, platform over time | `ESCALATE` | T3 |
| C-02 | **Mid-term upgrade** — customer adds 10 seats in month 7 | Prospective treatment or cumulative catch-up? Materially different answers | Determine whether the additional goods are distinct and priced at SSP | `ESCALATE` | T3 |
| C-03 | **Usage overage straddling cutoff** — usage through 30 Sept billed 5 Oct | Revenue belongs to September, invoice is October | Accrue unbilled revenue (contract asset) in September | `PROPOSE` | T2 |
| C-04 | **Mid-term cancellation with refund** | Reverses deferred revenue and possibly recognised revenue | Reverse remaining deferred, compute refund, never delete the original entries | `ESCALATE` | T2 |
| C-05 | **Cash with no remittance advice** — 24,180.00 lands, no indication of which invoices | Extremely common. The amount rarely matches one invoice exactly | Subset-sum over that customer's open invoices; if several combinations fit, refuse to pick | `ESCALATE` | T2 |
| C-06 | **Remittance disagrees with the cash** — advice lists 25,000, bank shows 24,180 | Which is authoritative? | Apply per the advice, treat the 820 as a separate short-pay to be classified | `ESCALATE` | T2 |
| C-07 | **Paid to the wrong entity** — customer of the UK sub pays the US parent's account | Cash is in the wrong legal entity; creates an intercompany position | Flag as misdirected, propose the intercompany settlement | `ESCALATE` | T3 |
| C-08 | **Short-pay claiming an unissued credit** — customer deducts 1,200 for a credit you haven't issued | A dispute, not a payment error | Open a deduction case; do not write it off silently | `ESCALATE` | T2 |
| C-09 | **Unbilled AR / contract asset** — work delivered, invoice not yet raised | Invisible to any system driven by the billing feed | Derive from the delivery record, not the invoice record | `ESCALATE` | T3 |
| C-10 | **Acceptance clause in prose** — "revenue recognised upon written customer acceptance" | The clause is buried in a PDF and changes the timing entirely | Extract and surface. Do not recognise without the acceptance document | `REFUSE` without acceptance | T3 |
| C-11 | **Bad debt write-off** — 18,000 receivable from a customer now in administration | Removing it looks like data loss to an auditor | Post an allowance/write-off entry with approval; never delete the invoice | `ESCALATE` | T2 |
| C-12 | **Rebate / variable consideration** — annual volume rebate earned retroactively | Revenue already recognised is now partly wrong | Estimate and accrue against revenue; true-up at year end | `ESCALATE` | T3 |

---

## D. Accruals and period-end judgment

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| D-01 | **Post-close invoice for prior-period service** — AWS September bill arrives 8 Oct, close is 6 Oct | September must bear the cost with no document in hand | Accrue 22,400 in September from usage data, reverse 1 Oct | `PROPOSE` | T1 |
| D-02 | **Unreversed accrual** — the September accrual is never reversed and the invoice posts in October | The cost lands twice. Silent, and nobody notices for a quarter | Detect accruals with no matching reversal; this is a great automated control | `ESCALATE` | T2 |
| D-03 | **Accrual true-up** — accrued 22,400, actual invoice is 24,180 | The 1,780 difference has to go somewhere | Post the difference to the same account in the current period | `AUTO` if immaterial | T2 |
| D-04 | **Recurring cost that stopped** — a vendor billed monthly for 14 months, nothing in September | Is the invoice missing, or did the service end? Tickmark's "costs incurred but never invoiced" | Flag the gap. Do not accrue silently, do not ignore silently | `ESCALATE` | T3 |
| D-05 | **Mid-month prepaid start** — insurance policy starts 17 September | Proration, not a clean twelve-way split | Prorate day-count; state the convention used | `AUTO` | T2 |
| D-06 | **Asset placed in service mid-period** | Depreciation convention (half-month, mid-quarter) changes the number | Apply the company's stated convention consistently | `AUTO` | T2 |
| D-07 | **Cutoff on shipment** — goods shipped 30 Sept, invoiced 2 Oct, terms FOB shipping point | Revenue belongs to September; the billing system says October | Use the shipping record, not the invoice date | `ESCALATE` | T3 |
| D-08 | **Capitalise or expense** — 42,000 of internal software development | Judgment call with a large P&L impact | Never decide alone. Present the policy and the facts | `REFUSE` | T3 |
| D-09 | **Immaterial difference** — a 3.14 variance on a 2.1M account | Chasing it wastes a human's afternoon; a system that flags everything is unusable | Apply materiality. Log it, don't queue it. Being pragmatic here is correct behaviour, not laziness | `AUTO` | T2 |
| D-10 | **Immaterial but suspicious** — a 3.14 variance in a fraud-sensitive account, third month running | Materiality alone would suppress it | Pattern beats threshold. Escalate the recurrence | `ESCALATE` | T3 |

---

## E. Multi-entity, intercompany and treasury

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| E-01 | **Intercompany mismatch** — seller booked 100,000, buyer booked 95,000 | Both sides are internally consistent and disagree | Establish which source is authoritative before proposing anything | `ESCALATE` | T2 |
| E-02 | **Disputed intercompany with missing confirmation** — service acceptance contested, no signed confirmation | Meridian's IC-1047. The temptation is to book a plug and go green | Leave it open. Keep the uncertainty visible rather than converting it into an unsupported posting | `REFUSE` | T3 |
| E-03 | **Elimination on consolidation** — intercompany revenue and cost must net to zero at group level | Missing it inflates group revenue | Generate elimination entries; verify the group total | `PROPOSE` | T3 |
| E-04 | **Prohibited lending pair** — an Irish sub lending upstream to a US parent is a deemed dividend under IRC §956 | The obvious answer is the illegal one. Sluice's central case | Encode as a hard constraint with its legal justification in prose, quotable in the memo | `BLOCK` | T3 |
| E-05 | **Covenant floor breach** — a transfer would drop an entity below its contractual minimum | A plausible-looking plan that breaches a covenant ends up in a board pack | Hard constraint per entity per day. Never in the option set | `BLOCK` | T3 |
| E-06 | **Settlement lag across holidays** — a wire sent Thursday lands after a UK bank holiday | Weekend-only logic produces plans a real bank rejects | Resolve against a per-country holiday calendar, on both sending and receiving side | `AUTO` | T3 |
| E-07 | **Loan maturity inside the horizon** | The plan must include the mandatory repayment leg, priced like the draw | Model repayment as a first-class leg | `PROPOSE` | T3 |
| E-08 | **Infeasible day** — no legal set of transfers covers every shortfall | The failure mode is producing a plausible plan anyway | Name the binding constraint, rank the available remedies by business cost, escalate. Contractual breaches never enter the option set | `ESCALATE` | T3 |
| E-09 | **Restricted cash** — 400,000 sitting in an account that cannot be swept | Looks available in the balance; isn't | Tag restricted balances; exclude from positioning | `AUTO` | T2 |
| E-10 | **FX translation vs transaction** — a EUR balance revalued at period-end rate | Translation goes to OCI, transaction gains to P&L. Easy to conflate | Apply the correct treatment per item type | `ESCALATE` | T3 |

---

## F. Data, ingestion and infrastructure

The unglamorous section where most systems actually die.

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| F-01 | **Thousands separator splits the CSV field** — unquoted `1,240.00` parses as `1` | Tickmark's bug. "Reading twelve hundred as twelve is an accounting error, not a parsing inconvenience" | Refuse any row whose field count disagrees with the header, and say why | `REFUSE` | T2 |
| F-02 | **Ambiguous date format** — `03/04/2026` | DD/MM vs MM/DD is undecidable below the 13th | Infer from the file's full distribution; if still ambiguous, refuse the file rather than half of it | `REFUSE` | T2 |
| F-03 | **Two dates per transaction** — posted date vs value date differ | Using the wrong one throws every tolerance window off by a day | Store both. Match on value date, report on posted date | `AUTO` | T2 |
| F-04 | **Sign convention flip** — one source expresses debits as negative, another as positive | Silently inverts your entire reconciliation | Detect from the data, don't assume; assert the sum against a known control total | `REFUSE` on mismatch | T2 |
| F-05 | **Re-ingesting the same file** | Records everything twice. Worse than missing it, because it's silent | Idempotency on `source_system + source_id` | `AUTO` (dedupe) | T1 |
| F-06 | **Source amended after ingestion** — a corrected file replaces one you already processed | Your workpaper looks fresh but its evidence changed underneath it | Version evidence; invalidate downstream state; force a re-run | `ESCALATE` | T3 |
| F-07 | **Float drift** — `0.1 + 0.2 !== 0.3` | Reconciliations that never tie; plans wrong by a cent and rejected by a bank | Integer minor units below the presentation layer, everywhere | — | T1 |
| F-08 | **Non-two-decimal currencies** — JPY has 0 minor units, KWD has 3 | Hard-coded ×100 corrupts the amount | Store minor-unit exponent with the currency | `AUTO` | T3 |
| F-09 | **Model invents a year** — an extracted fact dated 2024 in a 2026 close | A silently wrong year is exactly the bad evidence that must never reach a human. Tieout's day-one bug | Reject any fact dated outside the open fiscal window | `REFUSE` | T2 |
| F-10 | **Reasoning model returns empty content** — the budget is spent in a `reasoning` field | `content or ""` renders an empty string straight into an approval memo. Hit independently by Tieout *and* Sluice | Raise on `finish_reason == "length"`. Never render an empty model response | `REFUSE` | T2 |
| F-11 | **Interrupted run** — the worker dies halfway through a close | Partial state that looks complete | Checkpoint and resume; never present a partial close as finished | `ESCALATE` | T3 |
| F-12 | **Malformed export** — merged cells, a footer row, a blank header | `pandas.read_csv` succeeds and produces garbage | Validate structure before content | `REFUSE` | T1 |
| F-13 | **Whitespace and encoding** — non-breaking spaces, trailing tabs in vendor names | Two identical vendors that never compare equal | Normalise aggressively, but keep the raw string as evidence | `AUTO` | T1 |
| F-14 | **Scanned or handwritten document** | OCR confidence is low and the system doesn't know it | Propagate extraction confidence into the routing decision | `ESCALATE` | T2 |

---

## G. Control, authority and learning

The governance edge cases. Several winners built their entire demo around these.

| ID | Scenario | Why it breaks systems | Correct behaviour | Route | Tag |
|---|---|---|---|---|---|
| G-01 | **A human approves a duplicate payment** at the end of a long close | Every system trusts the human click. Close Controller's signature case | Block it anyway. Persist the block with the rule that caused it — "a refusal you cannot point at afterwards is indistinguishable from a bug" | `BLOCK` | T3 |
| G-02 | **Preparer equals approver** | Segregation of duties violated, and nothing complains | Enforce at the storage layer, not in a prompt | `BLOCK` | T2 |
| G-03 | **Posting into a closed period** | Reopens a signed-off month silently | Reject; correct via a new entry in the current period | `BLOCK` | T1 |
| G-04 | **Learned rule exceeds its approver's authority** — a Controller-approved rule later clears a 50,000 invoice | The rule outlives the authority that created it. Tieout's fix | A learned rule inherits the ceiling of whoever approved it | `BLOCK` | T3 |
| G-05 | **One correction, generalised into a rule** | One example is an anecdote. Tickmark refuses explicitly and says so out loud | Require a second agreeing correction, cite both verbatim, backtest against every closed period before adoption | `REFUSE` to learn | T3 |
| G-06 | **Rule fails its backtest** — the proposed rule would have mis-cleared three prior-period items | Adopting it bakes in a systematic error | A rule that failed its replay cannot be adopted at all | `BLOCK` | T3 |
| G-07 | **Contradicting correction** — a human now decides the opposite of an existing rule | Editing the rule destroys the audit trail | New version. The old one stays on the record, marked superseded | `PROPOSE` | T2 |
| G-08 | **Rule learned too wide** — the model drafts a tolerance of ±5% when the case was ±0.5% | An agent that widens its own rules is not a feature, it is an incident | Clamp: never wider than the class ceiling, never narrower than the case it was learned from. Pin to the specific counterparty | `AUTO` (clamped) | T3 |
| G-09 | **Rule pinned to a mutating descriptor** | Fires zero times next period (see A-09) | Pin to a stable key, not a statement string | — | T3 |
| G-10 | **Confidently wrong auto-post** — the system clears something incorrectly with 0.94 confidence | The cardinal failure. Nobody reviews what was cleared unattended | Auto-clear *precision* is the number that must not move. Your eval should exit non-zero on any false auto-post | — | T3 |
| G-11 | **Uncalibrated confidence** — 0.9 doesn't mean nine in ten | All your routing is then decoration | Derive confidence from a written checklist so a judge can read it and predict the number | — | T3 |
| G-12 | **Explanation restates the input** — "btx_0004 for -$1450.00 matches gle_0003 for -$1450.00" | Tells the reviewer what they are already looking at | Demand the semantic link in the reviewer's terms | — | T2 |

---

## H. Boss-level cases, in full

Six scenarios worth building as complete, scripted demo moments rather than fixture rows.

### H-1 · The human approves the duplicate

An invoice from Northwind Supply for 3,150.00 has already been paid on 9 September. A
near-identical invoice arrives on 22 September — same vendor, same amount, a new
invoice number. The reviewer, twelve exceptions into a long queue, clicks approve.

The system blocks the posting, names the rule (`DUPLICATE_PAYMENT`), shows the original
payment with its bank line, and persists the blocked attempt. **The block is the demo.**
Nobody else in the room will have built a system that overrules its own user.

### H-2 · The processor payout that can never tie

A Stripe deposit of 9,420.00 lands. It corresponds to 9,700.00 of gross invoices less
280.00 of processing fees. No matcher expecting deposit = invoice will ever clear this,
and every subscription business has hundreds of them a month.

Correct output is three rows from one deposit: cash at net, revenue at gross, fee as
expense — and a reconciliation that ties to the cent afterwards.

### H-3 · The rule that dies next month

Learn a coding rule from `GUSTO PAYROLL` in September. In the October data the same
vendor appears as `GUSTO TAX COLLECTION`. If your rule is a substring predicate cut from
one statement's wording, it fires zero times and nothing complains — your automation rate
silently drops and the exceptions look like new problems.

Demonstrate that your rule survives, or that your system detects the decay. Either is a
strong moment; neither is common.

### H-4 · The invoice whose evidence lives behind a login

A short-shipped invoice from Kestrel Manufacturing. The PO is in the ERP, the dispute
thread is in email, and the delivery note exists **only** in the supplier's web portal,
which has no API. Gathering the three pieces is 45 minutes of a human's day; the decision
itself takes ten seconds.

Automate the investigation, not the judgment. Then have a human decide once and watch the
next identical case clear itself, citing that rule and that approver by name.

### H-5 · The day with no legal answer

Six entities, three currencies. The German subsidiary breaches its covenant floor on day
7. The parent has plenty of cash, but lending from the entity that has it is prohibited.
Every legal transfer combination still leaves a 475,000 shortfall.

The wrong output is a plausible-looking plan. The right output names the binding
constraint, ranks the real remedies (draw the revolver, breach a soft internal policy with
sign-off, delay a payable) by business cost, and refuses to put a contractual covenant
breach in the option set at any rank.

### H-6 · The evidence that changed underneath you

You reconcile intercompany pair IC-1047 on day 3. On day 4 the counterparty issues a
credit note dated into the period, invalidating the invoice your reconciliation rests on.

The workpaper still looks clean. A balanced journal is not necessarily a correct journal,
and a fresh-looking workpaper is not safe if its evidence changed underneath it. Version
the evidence, invalidate the downstream state, and show the system catching itself.

---

## I. Minimum viable fixture

If you only have time to seed twenty cases, seed these. They cover every route, both
tiers of the matcher, and all six demo beats.

| # | Case | What it proves |
|---|---|---|
| 1 | A-01 deposit in transit | Timing vs error distinction |
| 2 | A-02 outstanding check | Same, opposite direction |
| 3 | A-03 netted wire fee | Amount-with-deduction pass |
| 4 | A-04 standalone bank charge | Proposes a journal entry from nothing |
| 5 | A-05 many-to-one | Subset-sum, bounded |
| 6 | A-07 processor payout | Domain knowledge nobody else has |
| 7 | A-10 abbreviated trading name | Entity resolution, model tier |
| 8 | A-11 memo describes the spend | Rules correctly leave it alone |
| 9 | A-12 transposed reference | Fuzzy without being reckless |
| 10 | A-13 true duplicate | Blocks |
| 11 | A-14 false duplicate | Doesn't over-block |
| 12 | A-18 ambiguous same-amount pair | Refuses to guess |
| 13 | A-19 internal transfer | Doesn't touch P&L |
| 14 | B-01 + B-02 combined variance | Three-way match, two variances |
| 15 | B-15 header ≠ line items | Internal-consistency validator |
| 16 | B-17 changed bank details | Fraud block |
| 17 | D-01 + D-02 accrual and its reversal | Period-end judgment, and the control that catches the miss |
| 18 | F-01 thousands separator | Ingestion refusal with a stated reason |
| 19 | G-01 human approves a duplicate | The veto |
| 20 | G-05 single correction | Refuses to learn |

Seed each of the learnable cases **twice** — once before the human decides, once after —
so the loop is demonstrable rather than described.

---

## J. Scoring rubric

Report these five numbers. They are what the winning projects put on stage.

| Metric | Definition | Target |
|---|---|---|
| **Auto-clear rate** | share of transactions cleared unattended | 70–85% is credible; higher invites suspicion |
| **Auto-clear precision** | share of auto-cleared items that were correct | **100%. This is the number that must not move.** |
| **False auto-posts** | count of incorrect unattended postings | **0.** Your eval should exit non-zero on any. |
| **Exception recall** | share of seeded exceptions the system surfaced | 100% |
| **Cost per 1,000 transactions** | model spend | compare against a rules-disabled baseline |

Two rules for the rubric itself:

1. **Run a falsifiable baseline.** Add a flag that disables your deterministic tier and
   routes everything through the model. If your tiered architecture doesn't beat it, you
   have a diagram rather than a finding.
2. **Report the unflattering number.** One winning team discovered their headline saving
   was inflated by an accounting artefact, recomputed it, found their system was actually
   marginally *worse* on that measure, and published both. To a judge who has spent a
   career in finance, that reads as competence.

---

## Sources

Cases marked with a project name come from the writeups of winning submissions to
**Syndicate by Maximor** (Devpost, Sept 2026): Tickmark, Close Controller, Tieout,
Meridian and Sluice. The remainder are standard corporate-accounting failure modes.
Figures quoted from those writeups are the teams' own claims and are not independently
verified.
