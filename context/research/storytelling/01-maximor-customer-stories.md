# Maximor customer stories — workflow-level detail

Researched 2026-09-19 (web). Purpose: the judges said "don't be generic; take 2-3 specific pain points Maximor's actual
customers face and walk through those exact ones in the demo." This file extends section 3 of
[`../maximor-company-intel.md`](../maximor-company-intel.md); it does not repeat it.

**Sourcing key**

- **VERIFIED** — I fetched the primary page (maximor.ai, a press release on GlobeNewswire, a LinkedIn post by Maximor or
  its CEO, TechCrunch, CFO Dive) and the fact was on it.
- **UNVERIFIED** — search snippet, aggregator, or secondary rewrite only.
- **INFERENCE** — my reasoning from the customer's business model. Not something Maximor or the customer said.

**One caveat on every quote below.** The fetch tool returns pages through a small summarising model, not raw HTML. I
asked for verbatim text and cross-checked the important sentences across two separate fetches, but before any quote goes
on a slide, open the URL and eyeball it. Numbers (10 entities, 7 currencies, 66 accounts, 300 MB, etc.) came back
identically on repeated fetches and also match the press release, so I rate them solid.

**What closed since the intel file**

| Gap in `maximor-company-intel.md` | Status now |
|---|---|
| Kiteworks case-study body never retrieved | **Closed.** Full page read at `/case-study/kiteworks`. |
| HiBid unverified | **Closed.** HiBid has a full case study at `/case-study/hibid` (it is in the sitemap). |
| QMCO unverified | **Half closed.** Homepage shows a "Trusted by finance teams at" strip whose only logo is labelled "NASDAQ: QMCO" (VERIFIED). QMCO is Quantum Corporation's ticker, but the name "Quantum" does not appear, and there is no case study, quote or metric. Treat as logo only. |
| "Global cybersecurity company" = Kiteworks? | **Closed by matching facts.** Press release: 10 legal entities, 7 currencies, 20+ bank relationships, 20 → 5 accountants, under 4 weeks. Kiteworks case study: identical numbers. Same customer. |
| "PE-backed roll-up" unnamed | **Closed.** CEO's LinkedIn post names Dura Software with the same numbers (14 business units, 30+ subsidiaries, 7 → 0 audit findings, 70%). |
| Rently 11→3 vs 8→4 | **Explained, not reconciled.** There are actually *three* figures. 8→4 is "within the first month" (Sept 2025 press release, CFO Dive, TechCrunch). 11→3 is the later homepage testimonial. `/why` says "9 to 3-day close". See Rently section. |
| Forbes Aug 2026 article | **Still 403.** Content recovered only via search snippet and a secondary rewrite; both UNVERIFIED. It appears to add no customer beyond Dura. |

---

## 1. Index of every customer, logo and case study found

Maximor has **no customers index page**: `/customers` and `/case-studies` return 404. The sitemap
(<https://www.maximor.ai/sitemap.xml>) lists exactly two case-study URLs. `/case-study/rently` and
`/case-study/dura-software` return 404.

| # | Customer | What exists | Primary URL | Status |
|---|---|---|---|---|
| 1 | **Kiteworks** | Full written case study + a "video case study" teaser on the homepage ("Inside the Kiteworks close, run on Maximor") | <https://www.maximor.ai/case-study/kiteworks> | VERIFIED |
| 2 | **HiBid** | Full written case study | <https://www.maximor.ai/case-study/hibid> | VERIFIED |
| 3 | **Dura Software** | Homepage testimonial, press-release quote, two LinkedIn posts, one blog mention. No case-study page. | <https://www.maximor.ai/>, [GlobeNewswire 2026-08-05](https://www.globenewswire.com/news-release/2026/08/05/3339475/0/en/Maximor-grows-revenue-35x-in-9-months-as-it-elevates-finance-from-task-automation-to-full-autonomy.html), [CEO LinkedIn post](https://www.linkedin.com/posts/ramnandan_one-of-my-favorite-parts-of-building-maximor-activity-7442586121173225473-QF6T), [Maximor LinkedIn post](https://www.linkedin.com/posts/maximor-ai_the-best-ai-rollouts-in-finance-dont-happen-activity-7482792301430292480-Swa1) | VERIFIED |
| 4 | **Rently** | Homepage + `/offer` testimonial, Sept 2025 press release, TechCrunch, CFO Dive, one blog mention. No case-study page. | <https://www.maximor.ai/>, [GlobeNewswire 2025-09-29](https://www.globenewswire.com/news-release/2025/09/29/3157796/0/en/Maximor-get-9m-for-AI-that-takes-on-finance-grunt-work-while-keeping-it-BAU.html) | VERIFIED |
| 5 | **Invst** | Homepage + `/offer` testimonial, Sept 2025 press release. No case-study page. | same two URLs as Rently | VERIFIED |
| 6 | **"NASDAQ: QMCO"** | Logo strip only | <https://www.maximor.ai/> | Logo VERIFIED; company name and any story UNVERIFIED |
| 7 | Anonymous: "$220M Manufacturing, 14 entities, 5-person team" | One-line quote in a blog post | <https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project> | VERIFIED (as an anonymous quote) |
| 8 | Anonymous: "$180M SaaS, 22 entities" | One-line quote in the same blog post | same | VERIFIED (anonymous) |
| 9 | Anonymous: "Growth Equity Portfolio ($400M AUM)", 8 → 22 entities | One-line quote in the same blog post | same | VERIFIED (anonymous) |
| — | Zuora / Tien Tzuo | Listed as a "customer reference" on FeaturedCustomers, but Tzuo is an **angel investor**, not a customer | <https://www.featuredcustomers.com/vendor/maximor> | Not a customer |

Sectors claimed across the 25+ customers: "software, manufacturing, construction, hospitality, and consumer goods"
([GlobeNewswire 2026-08-05](https://www.globenewswire.com/news-release/2026/08/05/3339475/0/en/Maximor-grows-revenue-35x-in-9-months-as-it-elevates-finance-from-task-automation-to-full-autonomy.html), VERIFIED).
No named customer was found in manufacturing, construction, hospitality or consumer goods.

---

## 2. Kiteworks — the cash story (best-sourced, best fit)

Source for everything in this section unless noted: <https://www.maximor.ai/case-study/kiteworks> — VERIFIED.

| Field | Detail |
|---|---|
| Title | "Kiteworks Automates 98% of Cash Transactions with Maximor" |
| Company | Cybersecurity; secure sharing of sensitive content under global data-privacy regulation. $1B+ valuation, 100M+ end users, 3,650+ enterprises and government agencies. Operates across US, EMEA, APAC. |
| Speaker | **Kristine Radhakrishnan, VP Global Controller** (title independently confirmed: [ZoomInfo](https://www.zoominfo.com/p/Kristine-Radhakrishnan/2382021868)) |
| ERP / stack | **NetSuite**, plus "payroll platforms, expense tools, email, and spreadsheets" — Maximor "connected the platform to NetSuite, payroll platforms, expense tools, email, and spreadsheets" |
| Complexity | **10 legal entities, 7 currencies, 66 accounts, 20+ bank relationships** |
| Revenue / headcount | Not stated |

**Before (concrete).** Section heading: "New entities and fragmented systems slowed treasury operations". Twenty
accountants "pulled data from each source, then manually matched, classified, and reconciled transactions" in NetSuite,
following rules that differed by entity. There was no standard process, so audit trails and timely cash visibility were
hard to maintain, and cash-flow forecasting was constrained, which delayed leadership's sequencing of growth initiatives
and the outlook reported to the board.

**What Maximor deployed.** No data migration. Agents analysed historical bank activity and transaction records, then
were configured to apply policy and reconciliation approach **per entity and per situation**. "Transactions are
automatically matched and posted into NetSuite, while new or unusual scenarios are flagged for manager-level oversight."
"Maximor's agents ingest, match, classify, and reconcile transactions." It "generates automated daily cash views by
currency, legal entity, and region." A unified finance context layer was live in under four weeks.

**After.**

- 98% straight-through processing on cash transactions
- Under 4 weeks to go live
- "15 FTEs worth of manual effort saved with automated cash management"
- 20 → 5 accountants for global cash management
- Balance-sheet reconciliations generated in seconds "with full audit traceability across entities and accounts"
  (results heading: "Kiteworks creates audit-ready reconciliations in seconds with Maximor")
- Next steps: "consolidate financial data, translate currencies, and eliminate intercompany transactions"; agents to
  "apply company rule sets across ERP data, sales pipeline reports, and internal databases"

**Quotes (all Kristine Radhakrishnan, VP Global Controller).**

- "Our treasury and cash management was managed by over 20 people working through nonstandard processes."
- "We were spending significant time navigating different currencies and reporting practices just to get numbers we could trust."
- "Critical finance workflows at Kiteworks no longer take hours. With Maximor, they're autonomous, helping our teams manage reconciliations across 10 legal entities more effectively."
- "I was beyond impressed with the speed of implementation given the complexity of our environment."
- "We're very impressed with Maximor's ability to produce accurate financial results and standardize complex finance processes."

**Corroboration.** The Aug 2026 press release describes an unnamed "global cybersecurity company" with the identical
10 / 7 / 20+ / 20→5 / <4 weeks figures
([GlobeNewswire](https://www.globenewswire.com/news-release/2026/08/05/3339475/0/en/Maximor-grows-revenue-35x-in-9-months-as-it-elevates-finance-from-task-automation-to-full-autonomy.html), VERIFIED).
Maximor employees' LinkedIn profiles describe the same deployment (UNVERIFIED, search snippets only).

**Not in the case study (say so if asked).** No mention of short pays, remittance advice, lockbox, resellers, payment
processors, unapplied cash, or wire fees. The Kiteworks story is about *cash/bank-transaction matching, classification
and posting across entities and currencies*, not specifically AR cash application. The video case study was not
retrievable (the homepage only links back to the written page).

**INFERENCE — what their pain likely looks like.** Kiteworks bought totemo, ownCloud, Maytech, DRACOON, Zivver (June
2025) and Nihon Wamnet (Aug 2026)
([Kiteworks press](https://www.kiteworks.com/company/press-releases/kiteworks-makes-three-strategic-acquisitions-in-as-many-weeks-further-elevating-its-vision-for-a-private-content-network-pcn-market/),
[Zivver](https://www.zivver.com/blog/press-release-zivver-joins-kiteworks-group),
[Tracxn](https://tracxn.com/d/acquisitions/acquisitions-by-kiteworks/__jST6682OG7_Gx8CRM4srrVggRywixulaFG3H7Lb44CQ)) —
that is what "new entities" in the case-study heading means. Each acquired company arrives with its own banks, its own
local currency (CHF, EUR, GBP, JPY are all plausible), and its own bookkeeping habits: hence "nonstandard processes" and
"entity-specific rules". Enterprise and government subscriptions sold partly through resellers mean large annual wires
that arrive net of intermediary bank fees and often from a payer whose name is not the invoiced customer. None of that
last sentence is stated by Maximor.

---

## 3. HiBid — the order-to-cash / revenue story

Source for everything in this section unless noted: <https://www.maximor.ai/case-study/hibid> — VERIFIED.

| Field | Detail |
|---|---|
| Title | "HiBid Automates Order-to-Cash End-to-End with Maximor" |
| Company | Auction platform for auctioneers; dual model: marketplace + vertical software. **$2.5B+ GMV a year across 100K+ auctions.** |
| Speaker | **Chris Stiegal, "CFO at HiBid"** per the case study. His own LinkedIn says "VP Finance at HiBid" since Jan 2025 ([LinkedIn](https://www.linkedin.com/in/christopher-l-stiegal/), UNVERIFIED snippet). Use the case study's title on slides but know the discrepancy. |
| ERP / stack | **NetSuite**, a data warehouse, a billing engine, "multiple payment processors" |
| Complexity | "four major streams and more than 50 sub-streams" of revenue, each recognised on a different schedule. The four streams are **not named** on the page. |

**Before (concrete).**

- "HiBid billed customers in advance, at the point of sale, and in arrears"
- "payments arrived by check, wire, ACH, and multiple payment processors"
- Revenue was calculated in Excel across hundreds of thousands of transaction lines: "the workbook reached 300 MB" and
  needed "hard-coded formulas, and careful file management to prevent recalculation errors"
- Cash reconciliation meant manual matching across systems and processors; no consolidated view of billing and payment
- Month-end close took three weeks
- Failed fix #1: "Chris had attempted to integrate the company's data warehouse with NetSuite to streamline
  order-to-cash operations. But even after nearly three months and significant engineering support, the system could not
  reliably handle HiBid's transaction volume"
- Failed fix #2: "after experimenting with generic AI tools like Codex and Claude Code, he found they couldn't
  consistently produce the controlled, accurate, and auditable data required"

**What Maximor deployed.** Connected warehouse, billing engine and processors; built the finance context layer around
HiBid's order-to-cash workflows and rev-rec policies. Agents continuously pull transaction reports, map them to revenue
streams, apply recognition policy, and match / classify / reconcile / post routine cash. "When Maximor encounters an
unfamiliar transaction, it flags the exception for HiBid's finance team." Adoption support: "They also introduced a
shared Slack channel and a Friday touch-base meeting."

**After.** Close 3 weeks → 5 days ("60% faster"); "99%+ accurate, fully auditable" order-to-cash; $2.5B+ GMV through
automated workflows; daily cash visibility. Next: "extend Maximor's agents from cash inflows into cash outflows,
automating accruals, prepaids, and fixed assets."

**Quotes (all Chris Stiegal).**

- "Our revenue recognition, billing, and cash collections were spread across different systems, which made them very manual and complicated. No solution could grasp the challenges and the exceptions that we were dealing with, until Maximor."
- "Maximor gives me confidence in our numbers, confidence in how quickly we can close, and confidence that we have the right foundation to grow as finance becomes autonomous."
- "The Maximor team became true partners from the start. They took joint ownership of our close process and exchanged ideas with us on how to introduce automation in the right places."
- "Maximor sits on top of every system our financials touch. The agents continuously apply our policies across processes, freeing our accounting manager to focus on analyzing HiBid's performance and advising on business initiatives."

**Background on the business (not from Maximor).** HiBid / Auction Flex charge monthly software subscriptions, online
listing/bidding usage fees, a 2% GMV fee on gross auction sales, and per-order advertising charges, invoiced together
([Auction Flex help centre](https://help.auctionflex.com/en/articles/11739682-paying-your-hibid-or-auction-flex-invoice),
[pricing](https://www.auctionflex.com/hibid-pricing.htm) — UNVERIFIED, search snippets). Sandhills Global bought HiBid in
2017 ([Sandhills](https://www.sandhills.com/news/article/24664), UNVERIFIED snippet).

**INFERENCE.** Those four fee types line up neatly with "four major streams" and with "in advance" (subscription), "at
the point of sale" (advertising orders) and "in arrears" (GMV and usage fees) — but Maximor does not say so. The likely
cash pain: processor payouts land as one net deposit covering thousands of small charges minus processor fees and
chargebacks, while auctioneers paying by check or ACH pay one amount against a combined invoice. That is inference.

---

## 4. Dura Software — the close / audit-findings story

| Field | Detail | Source |
|---|---|---|
| Company | "PE-backed holding company with 14 business units and 30+ subsidiaries across multiple continents" | [CEO LinkedIn post](https://www.linkedin.com/posts/ramnandan_one-of-my-favorite-parts-of-building-maximor-activity-7442586121173225473-QF6T) — VERIFIED |
| Speaker | **Sloan Session, CFO** | <https://www.maximor.ai/> — VERIFIED |
| ERP | Not stated. Only: an "intelligent layer over existing ERP without replacement" | [Maximor LinkedIn post](https://www.linkedin.com/posts/maximor-ai_the-best-ai-rollouts-in-finance-dont-happen-activity-7482792301430292480-Swa1) — VERIFIED |
| Before | A process "previously requiring 10–15 people"; 12-day close; 7 audit findings | same LinkedIn posts — VERIFIED |
| Deployed | Phased: **balance-sheet reconciliations first**, then **accruals management with an intelligent dashboard**. "The best AI rollouts in finance don't happen all at once. They compound." | Maximor LinkedIn post — VERIFIED |
| After | Close **12 → 7 days**; audit findings **7 → 0** (within 6 months per press release); **~70%** reduction in back-office headcount and consulting spend; the 10–15-person process "now runs with two (a controller and assistant)" | homepage, CEO post, [GlobeNewswire 2026-08-05](https://www.globenewswire.com/news-release/2026/08/05/3339475/0/en/Maximor-grows-revenue-35x-in-9-months-as-it-elevates-finance-from-task-automation-to-full-autonomy.html) — VERIFIED |

**Quotes (Sloan Session).**

- "You're not buying software. You're buying back your team's judgement." — <https://www.maximor.ai/> VERIFIED
- "We looked at plenty of tools that automate individual finance tasks — you still end up with your team stitching the work together and owning every outcome. With Maximor, it takes responsibility for the whole workflow, not just the task." — GlobeNewswire 2026-08-05, VERIFIED
- "It runs the operation but, critically, it knows when to pull us in." — continuation of the above as reported in the Forbes piece; seen only via a [secondary rewrite](https://streamlinefeed.co.ke/news/maximor-bets-agentic-ai-can-run-finance-autonomously). **UNVERIFIED** (Forbes itself still 403).
- "If we can't automate balance sheet recs, we can't automate anything." — appears in the related-post panel of the Maximor LinkedIn page, attributed to Session. **UNVERIFIED** (I could not open the post it comes from).
- A Maximor blog attributes to Dura (speaker unnamed): "When buyers saw our audit trails... that confidence translated directly into our exit multiple." — <https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production> VERIFIED as text on the page; the speaker is not identified there.

**Background.** San Antonio holding company founded 2017 that buys and permanently holds hyper-niche B2B software
companies; 15+ acquisitions including 6Connex, Moki, Nordic IT, Revegy, SecureVideo; a Brazilian acquisition
([Newswire](https://www.newswire.com/news/dura-software-expands-portfolio-to-brazil-with-publica-es-online-22254362),
[acquirers.com](https://www.acquirers.com/post/the-niche-software-acquirer-based-in-texas) — UNVERIFIED snippets).

**INFERENCE.** Thirty-plus small subsidiaries each with its own bank account, its own chart-of-accounts quirks and a
part-time bookkeeper: the seven audit findings were most likely un-reconciled balance-sheet accounts, unsupported
accruals and intercompany balances that did not eliminate. That matches what Maximor chose to automate first (balance
sheet recs, then accruals), but the content of the seven findings is not public.

---

## 5. Rently — the revenue-recognition / close story

| Field | Detail | Source |
|---|---|---|
| Company | "Proptech business with global operations across three countries"; "software tools for the rental housing industry" | [GlobeNewswire 2025-09-29](https://www.globenewswire.com/news-release/2025/09/29/3157796/0/en/Maximor-get-9m-for-AI-that-takes-on-finance-grunt-work-while-keeping-it-BAU.html), [CFO Dive](https://www.cfodive.com/news/startup-raises-9m-rescue-finance-teams-buried-reconciliations-agentic-ai/761444/) — VERIFIED |
| Speaker | **Dustin Neal, CFO** | <https://www.maximor.ai/> — VERIFIED |
| ERP / stack | Not stated anywhere I could find | — |
| Before | "Repetitive accounting work requiring incremental hiring"; revenue recognised "across thousands of contracts" | press release; homepage — VERIFIED |
| After | see the numbers table below | |

**The conflicting numbers, laid out.**

| Claim | Where | When |
|---|---|---|
| Close **8 → 4 days** "within the first month of using the Maximor platform"; "avoided two additional accounting hires"; ~50% of team capacity redirected | [GlobeNewswire 2025-09-29](https://www.globenewswire.com/news-release/2025/09/29/3157796/0/en/Maximor-get-9m-for-AI-that-takes-on-finance-grunt-work-while-keeping-it-BAU.html), [CFO Dive](https://www.cfodive.com/news/startup-raises-9m-rescue-finance-teams-buried-reconciliations-agentic-ai/761444/), [TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/) — all VERIFIED | Sept 2025 |
| Close **11 → 3 days**; $350K annual savings; "freeing eight days for strategy and cutting audit issues by over 90%" | <https://www.maximor.ai/>, <https://www.maximor.ai/offer> — VERIFIED | current site |
| "**9 to 3**-day close, $300K+ savings, avoided 2 hires" next to a "$350K Savings" tile — unlabeled, but the $350K and "avoided 2 hires" match Rently | <https://www.maximor.ai/why> — VERIFIED as text; attribution to Rently is INFERENCE | current site |

INFERENCE: 8→4 is the first-month result and 11→3 is a later, steadier-state result measured from a different baseline.
Maximor never reconciles them, and the 9→3 on `/why` shows their own site is not consistent. **Do not put a Rently
close-days number on a slide without saying which source it is from.** The safest single phrase is the press-release
one: "8 days to 4 within the first month."

**Quotes (Dustin Neal, CFO).**

- "We cut our close from 11 days to 3 and automated revenue recognition across thousands of contracts, freeing eight days for strategy and cutting audit issues by over 90%." — <https://www.maximor.ai/> VERIFIED
- "With Maximor, our team delivers reliable, audit-ready outputs efficiently while freeing up nearly 50% of our capacity for strategic work." — GlobeNewswire 2025-09-29 VERIFIED
- A Maximor blog labels Rently a "$220M Portfolio Company" and attributes (speaker unnamed): "Every journal entry has complete source lineage, policy references, and review trails. Our auditors were impressed." — <https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production>. VERIFIED as text on the page; whether $220M is revenue or valuation is not stated, and I would not repeat the figure.

**INFERENCE.** Rently sells self-touring and smart-home software to rental operators *and* manufactures its own smart
locks and hubs ([Rently](https://use.rently.com/company/),
[PR Newswire](https://www.prnewswire.com/news-releases/rently-introduces-smart-bolt-bluetooth-lock-302131873.html) —
UNVERIFIED snippets). A contract that bundles hardware (point-in-time revenue) with a multi-year SaaS subscription
(ratable) and possibly installation is a textbook ASC 606 multi-element allocation problem; "thousands of contracts"
each needing an SSP allocation and a schedule is the spreadsheet that ate their close. Three countries adds
intercompany and FX. None of this is stated by Rently or Maximor.

---

## 6. Invst — the allocations / reporting story

| Field | Detail | Source |
|---|---|---|
| Company | "Multi-billion-dollar AUM registered investment advisor" | [GlobeNewswire 2025-09-29](https://www.globenewswire.com/news-release/2025/09/29/3157796/0/en/Maximor-get-9m-for-AI-that-takes-on-finance-grunt-work-while-keeping-it-BAU.html) — VERIFIED |
| Speaker | **Dipen Mehta, CFO / COO** | <https://www.maximor.ai/> — VERIFIED |
| Deployed | "Automated reconciliations, allocations, and reporting"; ASC 606 rev rec end to end | press release; homepage — VERIFIED |
| After | 4-day close; $250K annual savings; "advisor-level profitability insights previously impractical to obtain"; `/why` tile: "Automated reporting, cut close to 3 days, $250K savings" (note: 3 there, 4 elsewhere) | homepage, press release, <https://www.maximor.ai/why> — VERIFIED |

**Quotes (Dipen Mehta).**

- "Maximor automated our ASC 606 revenue recognition end-to-end. We now close in 4 days with audit-ready schedules and usage-based billing." — <https://www.maximor.ai/> VERIFIED
- Longer form: "...eliminating contract parsing headaches, revenue spreadsheets and errors. We now close in 4 days with audit-ready revenue schedules, with usage based billing" — [FeaturedCustomers](https://www.featuredcustomers.com/vendor/maximor), UNVERIFIED (aggregator; truncated).

Background: Indianapolis RIA formed 2016, about $1.6B AUM, 33 advisors, fees are %-of-AUM plus hourly and fixed
([FINTRX](https://fintrx.com/firms/firm/invst-llc-282863), UNVERIFIED snippet). Note "$1.6B" vs Maximor's
"multi-billion-dollar".

**INFERENCE.** Advisory fees are billed quarterly on AUM, then split between the firm and each advisor under individual
payout grids; custodians (Schwab, Fidelity) remit one net deposit for thousands of client accounts. "Advisor-level
profitability" means allocating that one deposit, and shared overhead, to 33 advisors — an allocation spreadsheet. Weak
fit with our build; I would not stage it.

---

## 7. NASDAQ: QMCO and the anonymous customers

- **QMCO.** The homepage strip "Trusted by finance teams at" shows one logo, labelled "NASDAQ: QMCO"
  (<https://www.maximor.ai/>, VERIFIED). QMCO is the ticker of Quantum Corporation, a data-storage company
  ([investors.quantum.com](https://investors.quantum.com/)). A targeted search for Maximor + Quantum returned nothing
  linking them. No story to tell; do not name Quantum on a slide.
- **Anonymous quotes** from <https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project> (VERIFIED as
  text; identities unknowable):
  - $220M manufacturing, 14 entities, 5-person team: "Two hours total to get started with Maximor. And now we close in 5 days."
  - $180M SaaS, 22 entities: "We were mid-Series C refinancing without a single hour to spare. Maximor implemented everything. We didn't build, map, or configure a single rule. It just worked."
  - Growth-equity portfolio, $400M AUM: "This was 3 hours total across 8 weeks. We scaled from 8 to 22 entities without adding finance headcount."
  - An unnamed controller on DIY agent platforms: "I don't know how confident I am at building an agent for myself that won't screw it up." Her team went back to Excel.
- The fear Maximor says CFOs voice: "We tried automation. The AI misclassified a $450K transaction. My controller lost
  trust." (<https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production>, VERIFIED, unattributed.)
  This is the sentence our deterministic kernel answers.

---

## 8. Transaction-level detail: what exists and what does not

**Hunted for and NOT found in any Maximor customer material:** one wire for many invoices; remittance advice by email;
payments from a parent entity; bank fees causing short pays; Stripe payouts net of fees; lockbox; a deferred-revenue
schedule rebuilt by hand; an auditor asking for support nobody could find. Maximor's case studies are written at the
"20 accountants, 66 accounts" level, not the single-transaction level. A search snippet that looked like a match
("cash goes unapplied when remittance is missing, a payment is short or one settlement covers many invoices") is from a
Zone & Co article that does not mention Maximor
(<https://www.zoneandco.com/articles/ai-cash-application-software-for-matching-and-posting>). Do not attribute it to
Maximor.

**What DOES exist — and it is better than an anecdote.** Maximor's own homepage and `/why` page carry product mock-ups
with named rules and dollar amounts. These are Maximor's own picture of the work, so re-staging them is quoting the
sponsor back to itself. All VERIFIED on <https://www.maximor.ai/> and <https://www.maximor.ai/why>.

| Maximor's mock-up text | What it depicts |
|---|---|
| "SHORT-PAY-01 · short ≤ $50 → auto-close" | A named, thresholded short-pay write-off policy |
| "Acme Freight #4471 −$38 posted & closed" | Short pay under the threshold, auto-written-off |
| "Byte Foods #7729 −$495 awaiting you" | Short pay over the threshold, escalated to a human |
| "Acme Freight $12,442 · auto-posted SHORT-PAY-01" / "Byte Foods · $9,405 over policy, with you" (`/why`) | Same pair, shown with the invoice amounts |
| "ACCRUE-01 · no invoice by Day 2 → accrue" / "Osprey Media #2210 $12,000 accrued · reversal set" / "NovaTech retainer #0417 $48,000 awaiting you" | Accrual policy + one escalation |
| "REV-REC-01 · recognize ratably, 12 mo" / "**Northwind** ACV $120k $10k/mo schedule live" / "Vantiv true-up #8841 +$9,400 awaiting you" | Rev-rec policy + one escalation. **Maximor's own demo customer is called Northwind; so is our fixture company.** |
| "Agents derive policy from how your team already works, apply it" and learn policies "from the systems and files you already use" (`/why`) | Policy compilation from prior human bookings |
| "When it's confident, it acts. When it isn't, it escalates to your team – and remembers the answer, so it never asks twice." ([blog](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance)) | Ask once, remember |
| "the answers live in a controller's head, in an analyst's inbox, in a worksheet named FINAL_v7_USE_THIS" (same blog) | Context scattered across people and inboxes |
| "Where nothing was ever written down, it asks why." (same blog) | The Slack question |

Collision warning on the name: our fixture is "Northwind Systems" as the *company being closed*; Maximor's mock-up uses
"Northwind" as a *customer of* the company being closed. Harmless, but a judge may notice. Either lean into it with one
sentence or do nothing; do not rename mid-hackathon on my say-so.

---

## 9. Re-stageable demo scenarios, ranked

Ranked on (a) strength of sourcing and (b) fit with what we have actually built. "Justifying sentence" is the exact
customer or Maximor sentence to put on screen.

### 1. Short pay under and over the write-off line — Maximor's SHORT-PAY-01, learned instead of configured
- **Sourcing: strong** (Maximor's own homepage, VERIFIED) — but it is a product mock-up, not a customer anecdote. Say so.
- **Fit: exact.** Cash application with short-pay handling; policy compiled from how humans booked prior-quarter
  wire-fee write-offs; run 1 → learn → run 2 with zero model calls.
- **Justifying sentence:** "SHORT-PAY-01 · short ≤ $50 → auto-close … Acme Freight #4471 −$38 posted & closed … Byte Foods #7729 −$495 awaiting you" (<https://www.maximor.ai/>), plus "Agents derive policy from how your team already works" (<https://www.maximor.ai/why>).
- **Staging:** two bank lines. A −$38 short pay: our compiled policy (derived from last quarter's write-offs, not typed
  in) closes it with no model call. A −$495 short pay: over the line, goes to scenario 2. The pitch: Maximor shows the
  rule; we show where the rule comes from.

### 2. The $495 nobody can explain — inbox first, then ask once in Slack, never again
- **Sourcing: strong** for the principle (Maximor CEO's blog, VERIFIED; HiBid and Kiteworks both describe exception
  flagging, VERIFIED). No customer describes this exact transaction.
- **Fit: exact.** Investigator agent over the CEO's Gmail; Slack question to the account owner; scoped fact.
- **Justifying sentence:** "When it isn't [confident], it escalates to your team – and remembers the answer, so it never asks twice." and "the answers live in a controller's head, in an analyst's inbox, in a worksheet named FINAL_v7_USE_THIS" (<https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance>). Customer echo: "No solution could grasp the challenges and the exceptions that we were dealing with" — Chris Stiegal, HiBid (<https://www.maximor.ai/case-study/hibid>).
- **Staging:** the same short pay recurs next month; the stored fact applies inside its scope and the agent stays
  silent. Show a second customer where the fact does *not* apply, to prove scope.

### 3. Kiteworks: entity-specific rules, 7 currencies, 20+ banks — one policy per entity, flagged only when new
- **Sourcing: strongest of all** (full case study + press release, VERIFIED, named controller).
- **Fit: partial.** We have one entity on a QuickBooks sandbox, not 10 on NetSuite. We can honestly stage the
  *mechanism* (policy scoped per entity / per customer; unfamiliar pattern → flagged, not guessed) and one
  foreign-currency wire that arrives short because of intermediary bank fees. The wire-fee link to Kiteworks is
  INFERENCE; say "companies like Kiteworks", never "Kiteworks had this".
- **Justifying sentence:** "Our treasury and cash management was managed by over 20 people working through nonstandard processes." — Kristine Radhakrishnan, VP Global Controller (<https://www.maximor.ai/case-study/kiteworks>); and "Transactions are automatically matched and posted into NetSuite, while new or unusual scenarios are flagged for manager-level oversight."
- **Staging:** use as the *framing* story for scenarios 1 and 2 — "this is what 20 people were doing by hand".

### 4. "Codex and Claude Code couldn't produce auditable data" — the kernel and the workpaper
- **Sourcing: strong** (HiBid case study, VERIFIED) and unusually pointed: a named customer tried generic coding agents
  and rejected them on auditability.
- **Fit: exact.** Deterministic kernel re-checks every entry's workpaper with tick marks and rejects if one character of
  quoted evidence changes; audit pack with sampling, re-performance, control tests.
- **Justifying sentence:** "after experimenting with generic AI tools like Codex and Claude Code, he found they couldn't consistently produce the controlled, accurate, and auditable data required" (<https://www.maximor.ai/case-study/hibid>). Pair with the CFO fear: "The AI misclassified a $450K transaction. My controller lost trust." (<https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production>) and Dura's "audit findings 7 → 0".
- **Staging:** tamper with one character of a quoted email in a workpaper on stage; the kernel rejects the entry. Then
  open the audit pack. This is the answer to "why not just use an LLM".

### 5. Dura Software: from 7 audit findings to 0 — AP duplicate obligations and accruals as control tests
- **Sourcing: strong on the numbers** (CEO LinkedIn, press release, VERIFIED); **weak on content** — what the seven
  findings were is not public.
- **Fit: moderate.** AP three-way match + duplicate-obligation detection and the audit pack's control tests are the kind
  of control that clears findings, and Maximor's own ACCRUE-01 mock-up ("no invoice by Day 2 → accrue … NovaTech
  retainer #0417 $48,000 awaiting you") gives an on-brand AP-side example. The link from Dura's findings to duplicate
  payables is INFERENCE.
- **Justifying sentence:** "With Maximor, it takes responsibility for the whole workflow, not just the task." — Sloan Session, CFO, Dura Software ([GlobeNewswire](https://www.globenewswire.com/news-release/2026/08/05/3339475/0/en/Maximor-grows-revenue-35x-in-9-months-as-it-elevates-finance-from-task-automation-to-full-autonomy.html)).
- **Staging:** shortest of the five; one duplicate vendor obligation caught, shown as a passed control in the audit pack.

**Not recommended to stage:** HiBid's 300 MB revenue workbook and Rently's thousands-of-contracts rev rec (great
stories, but our build has no ASC 606 schedule engine — mention them in the narration, do not pretend to demo them);
Invst (allocations; no fit); QMCO (no story exists).

**Suggested three for the judges' "2-3 pain points":** Kiteworks as the frame (#3) → short pay learned-policy (#1) →
the unexplained short pay, inbox then Slack once (#2), closing on HiBid's Codex/Claude Code sentence and the kernel
(#4) as the reason to trust it.

---

## 10. Could not retrieve — stated plainly

- Forbes, 2026-08-05 (David Prosser): HTTP 403 again. Known only through a search snippet and a Kenyan rewrite.
- The Kiteworks **video** case study: the homepage teaser links to the written page; no video URL found.
- Rently, Invst, Dura: no case-study pages exist on maximor.ai (404 / not in sitemap). Their ERPs are not stated anywhere.
- The LinkedIn post containing Session's "balance sheet recs" quote: seen only as a related-post excerpt.
- G2 / Capterra reviews: none surfaced. FeaturedCustomers has 3 visible references and "2 more locked".
- HiBid's four revenue streams are not named by Maximor.
- No Maximor customer material describes a single transaction. The transaction-level detail in section 8 is Maximor's
  product mock-up, not a customer's words.
