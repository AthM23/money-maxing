# Maximor blog and founder voice: pains, beliefs, vocabulary

Researched 2026-09-19 for the demo narrative. Scope: Maximor's blog, resource pages, persona pages and the founders' public voice (LinkedIn, press releases, the Foundation Capital podcast). Case studies are out of scope (see `01-maximor-customer-stories.md`). Product and company facts already in `../maximor-company-intel.md` and the workshop slides in `../maximor-workshop-slides.md` are not repeated here.

**How to read the sourcing.**
- Every page marked FETCHED was retrieved with WebFetch today. WebFetch passes the page through a small summarizer model, so quotes are "as returned by the fetch". Where I asked for sentence-by-sentence output (LinkedIn posts, the close assessment, the autonomous-finance essay) the wording is very likely exact. **Spot-check any quote in a browser before it goes on a slide.**
- UNVERIFIED = seen only in a search-result snippet, page not fetched (Forbes and X are blocked: 403 / 402).
- The blog pages all show "Published Sep 15, 2026, 8:51 PM UTC". That is a site-wide republish timestamp, not the post date. Dates below are the ones shown on the blog index.
- `/webinars`, `/newsroom`, `/glossary` all return 404. There is no glossary and no webinar archive. The sitemap lists 13 blog posts, 1 guide, 2 case studies.

---

## 1. Blog and resource index

Source for the list: [sitemap.xml](https://www.maximor.ai/sitemap.xml), [blog index](https://www.maximor.ai/blog), [resources](https://www.maximor.ai/resources). All FETCHED.

### Blog posts (13, all read)

| # | Title | Date | URL | Gist |
|---|---|---|---|---|
| 1 | What We Mean by Autonomous Finance (byline: Ramnandan Krishnamurthy) | Aug 13, 2026 | [link](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance) | The manifesto. "Human runtime": the software holds records, people execute the logic. Product is built around the 1%. |
| 2 | Why Your Revenue Forecast Breaks When Customers Control the Meter | Sep 7, 2026 | [link](https://www.maximor.ai/blog/revenue-forecast-breaks-customers-control-meter) | Consumption revenue is demand modeling, not pipeline. Forecast and recognition drift when they live in different systems. |
| 3 | The Tax Liability Accumulating While Nobody is Looking | Sep 7, 2026 | [link](https://www.maximor.ai/blog/indirect-tax-usage-based-billing) | AI companies sell for months before asking if inference is taxable. State-by-state classification, escheatment vs breakage. |
| 4 | The Metrics Investors Trust Least In Consumption Businesses | Sep 2, 2026 | [link](https://www.maximor.ai/blog/metrics-investors-trust-least-consumption-businesses) | ARR, RPO and NRR strain under consumption. Metrics should surface from one reconciled source. |
| 5 | The Allocation Problem Hiding in Hybrid AI Contracts | Sep 2, 2026 | [link](https://www.maximor.ai/blog/allocation-problem-hybrid-ai-contracts) | SSP allocation is "the least automated step". "The judgment stays yours." |
| 6 | What Belongs In Cost Of Revenue When Inference Is The Product | Sep 1, 2026 | [link](https://www.maximor.ai/blog/cost-of-revenue-inference-product) | Inference cost classification moves gross margin. Admits weights-as-software is unsettled. |
| 7 | 5 Revenue Checks Every Usage-Based CFO Should Run | Aug 21, 2026 | [link](https://www.maximor.ai/blog/usage-based-revenue-checks-cfo) | "The invoice says one number. The recognition rules say another." Five checks, each with gap / identify / close. |
| 8 | Can Your Usage-Based Revenue Recognition Survive an Audit? | Aug 19, 2026 | [link](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit) | Audit risk is not wrong numbers, it is unprovable numbers. Judgment in one controller's memory. |
| 9 | 9 Finance Predictions for 2026 That Will Get You Promoted (or Sidelined) | Dec 23, 2025 | [link](https://www.maximor.ai/blog/9-predictions-for-2026) | Provocations: 5-day close is table stakes; "Human in the Loop" is code for slow; confidence-tiered autonomy. |
| 10 | Will Finance Reporting Accuracy Hold in Production? | Dec 15, 2025 | [link](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production) | PE-flavored objection handler: 86% of CFOs saw inaccurate AI output; "The AI did it" is not an answer in diligence. |
| 11 | We Don't Have Bandwidth for an Automation Project? | Dec 15, 2025 | [link](https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project) | Traditional automation costs 250-350 internal hours. Done-For-You, 4 hours of controller time. |
| 12 | Is My Financial Data Secure with Maximor's AI? | Dec 15, 2025 | [link](https://www.maximor.ai/blog/is-my-financial-data-secure-with-maximors-ai) | SOC 1/2, ISO 27001, private VPC, immutable logs. Auditors reject AI output without traceability. |
| 13 | Maximor Raises $9M Seed... Without Rip-and-Replace | Sep 29, 2025 | [link](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace) | Launch post. "Nights and weekends", "Finance doesn't need another ERP." |

Pattern worth noticing: 7 of the 13 posts (all of Aug-Sep 2026) are about usage-based / AI-company revenue accounting. That is the segment they are marketing to right now. None of the 13 is about cash application, AR or AP. Cash shows up in the close assessment, the LinkedIn posts and the press release instead.

### Other pages read

| Page | URL | Gist |
|---|---|---|
| Close readiness assessment (10 yes/no questions) | [link](https://www.maximor.ai/close-assessment) | **The single most useful page for us.** Three "gaps": revenue, cash, knowledge. Question 5 is our demo. |
| Controller persona page | [link](https://www.maximor.ai/controller) | "Own the close. Stop preparing it." Map / Modernize / Memorize. "Rules that write themselves". |
| CFO persona page | [link](https://www.maximor.ai/cfo) | 20 hours saved per accountant per week; 70% less audit prep; 40% lower audit and consulting fees. |
| Usage-based rev rec playbook (gated guide) | [link](https://www.maximor.ai/guide/usage-based-rev-rec) | Six "judgment calls that stall an AI-native close". |
| 7 "Jujitsu Moves" infographic | [link](https://www.maximor.ai/infographics-jujitsu) | "Kill Your Worst Spreadsheet First", "Slow Down to 99.9% Accuracy", "Don't Rip and Replace. Orchestrate." |
| 5-day close offer | [link](https://www.maximor.ai/cfo-offer-all) | "5-Day Audit-Ready Close, Done-For-You. Guaranteed." $10,000 back if targets missed in 60 days. |
| Partnerships | [link](https://www.maximor.ai/partnerships) | PE/VC, transformation, accounting implementation, tech partners. 12 -> 7 day close. |
| CFO benchmark (Wakefield, 100 CFOs, $50M-$500M) | [link](https://www.maximor.ai/cfo-benchmark) | 96 / 14 / 97. Already in company intel. New: Ram's quote and the Kiva Brands CFO quote. |
| Benchmarking survey (the questionnaire) | [link](https://www.maximor.ai/benchmarking-survey) | 16 questions, no results on page. |
| /why | [link](https://www.maximor.ai/why) | Vocabulary source: unified finance context layer, policy layer, continuous close. |

---

## 2. Per-post notes

### 2.1 What We Mean by Autonomous Finance (Ram, Aug 13, 2026) — read this one twice

[Blog](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance) and Ram's [LinkedIn version](https://www.linkedin.com/posts/ramnandan_what-we-mean-by-autonomous-finance-activity-7492993910693142528-zsj2). Both FETCHED.

**(a) Pain scenario.** Walk into any finance org and ask where the logic lives. The LinkedIn version gives three concrete questions nobody's software can answer:
- "Why does this customer's contract get recognized the way it does?"
- "What is that vendor on different payment terms than the one next to it?"
- "What counts as material at 11pm on the 4th day of close?"

The answers live "in a controller's head, in an analyst's inbox, in a worksheet named FINAL_v7_USE_THIS." Revenue booked wrong in Q1 surfaces in Q3. Cash gets reconciled in spreadsheets despite the ERP spend. Close lands in the second week.

**(b) Numbers.** None externally sourced. 99/1 is a design stance, not a measurement. (Press release says 98/2 measured; see 2.14.)

**(c) Verbatim.**
- "Finance automation did not stall because the tools were weak. It stalled because the work was never in the tools."
- "Every finance team on earth runs on a policy that is written down nowhere."
- "There's a name for this arrangement: human runtime."
- "The software holds the records. But people still execute the process – interpret the contract, apply the policy, catch the exception – at human speed and human cost."
- "Within this system, the software is nothing more than a filing cabinet people work next to."
- "Software that stops one step short of doing the work isn't automation. It's homework."
- "Intelligence is becoming cheap. Accountability is not."
- "When it's confident, it acts. When it isn't, it escalates to your team – and remembers the answer, so it never asks twice."
- "Our conviction is that the 99% that runs autonomously is table stakes. Our product is built around the remaining 1%."
- "Every action it takes carries its own evidence: what it did, why, and based on what."
- "People were never meant to be the runtime. They were meant to be the strategic judgment."
- "...the instinct that a number can be technically correct and still wrong."
- "The finance professionals we work with didn't enter the field hoping to tick and tie until midnight."

**(d) Fix claimed.** Learns from contracts, policies and past decisions; then "Bills the customer. Applies the cash. Books the accrual. Reconciles the ledger." Confidence-gated action, escalation with memory, evidence on every action.

**(e) Limitation / roadmap.** "General-purpose AI will not take on that liability. But someone has to." The product is defined by the 1%: "knowing when to stop, what to escalate, whom to bring in, and how to show your work." They tell you where they think the hard part is. It is exactly where our build sits. Examining every transaction rather than sampling is framed as the direction, pushing error and fraud rates "toward zero".

### 2.2 Can Your Usage-Based Revenue Recognition Survive an Audit? (Aug 19, 2026)

[FETCHED](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit)

**(a) Pain.** Metering platform captures consumption, billing engine rates it, CRM holds terms, ERP posts entries. The auditor's "why" needs all four, reconciled by hand. After a mid-term modification: "The sales team updates the CRM. The billing team may or may not update the invoice logic. The revenue schedule in the ERP often remains untouched until someone catches the discrepancy during close, or during the audit." At 50 contracts a senior accountant can prep audit support by hand; at 500 it takes weeks.

**(b) Numbers.** 50 vs 500 contracts is illustrative, unsourced. No third-party data.

**(c) Verbatim.**
- "Auditors do not just check whether your numbers are correct. Auditors check whether you can prove they are correct."
- "The audit risk is not that the numbers are wrong. The risk is that no one can demonstrate why they are right."
- "The audit trail exists, but assembling it is a project, not a query."
- "When those decisions live in a controller's head or a spreadsheet formula with no trail, the auditor cannot verify the logic."
- "When that person is unavailable, the trail goes cold."
- "Every recognition decision traces to logic an auditor can read without a guided walkthrough."

**(d) Fix.** "The audit trail should generate as recognition happens, not get reconstructed during audit prep." "Policy decisions are encoded in the platform, not memorized by the team."

**(e) Gap.** Nothing about auditor sampling, re-performance, tick marks or workpaper format. They claim traceability; they do not describe the auditor-side procedure. Our audit pack (sampling + re-performance) is a visible extension.

### 2.3 5 Revenue Checks Every Usage-Based CFO Should Run (Aug 21, 2026)

[FETCHED](https://www.maximor.ai/blog/usage-based-revenue-checks-cfo)

**(a) Pain.** Tiered rates: invoiced at $0.01/token x 10,000 = $100, blended rate later says about $60, so the error "runs toward over-recognition, not under-billing." Prepaid credits drift between the deferred revenue account and the metering system. December usage rated in January with no documented lookback.

**(c) Verbatim.** "The invoice says one number. The recognition rules say another." / "Require that every modification flows through a single workflow that updates CRM, billing, and recognition together." / accounting conclusion "documented at modification, not reconstructed during close."

**(d) Fix.** "a reconciliation layer that connects metering data, billing logic, contract terms, and revenue schedules into one traceable model, layered on top of the existing ERP." Checks run "continuously".

**(e)** Outcome-based pricing is explicitly left out of the five checks. Format is useful for us: each check is Gap / Identify / Close. That is the shape of a drift comparator.

### 2.4 Will Finance Reporting Accuracy Hold in Production? (Dec 15, 2025)

[FETCHED](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production)

**(a) Pain.** Controllers spend 60+ hours a month on reconciliations; 12+ day close across 10-40 entities. Buyer diligence finds errors and discounts the exit multiple.

**(b) Numbers.** Wakefield Research, Oct 2025 (Maximor-commissioned): 86% of CFOs encountered inaccurate or hallucinated AI data; 67% say oversight is extremely/very critical; 88% use at least one AI tool; 40% fully integrated. Unsourced in the post: 10-20% exit multiple discount; 80%+ cash auto-posting; 90%+ accrual automation; $2.1M across 7 portfolio companies; "80% reduction in audit PBC scramble".

**(c) Verbatim (customer-voice quotes, unnamed).**
- "We tried automation. The AI misclassified a $450K transaction. My controller lost trust."
- "When buyers ask 'How did you calculate this?', I need better than 'The AI did it.'"
- "Multi-currency Intercompany eliminations across 20 entities break every vendor's templates."
- "Every journal entry has complete source lineage, policy references, and review trails."

**(d) Fix.** Audit-Ready AI Agents; every entry carries source lineage, policy reference, calculation log, review trail.

**(e) Limitation.** "System operates read-only until full trust is established." Guarantee threshold is 80%, not 99%. Human review shrinks to 2-3 hours then 30 minutes a month; it does not vanish.

### 2.5 We Don't Have Bandwidth for an Automation Project? (Dec 15, 2025)

[FETCHED](https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project)

**(a) Pain.** A senior accountant spends 40+ hours a month on bank and card reconciliations. 15-day closes. A controller abandoned workflow software after a 4-month implementation; "Teams quietly revert to Excel and paper processes while the meter for the unused platform keeps running." Templates break on "multi-currency IC, non-standard bank formats, hybrid pricing" and teams "realize they need to become prompt engineers".

**(b) Numbers.** 250-350+ hours of internal time for a traditional implementation (their own build-up). APQC: 15+ day closers spend 40-60% more per revenue dollar on finance ops (as cited by the post; I did not check APQC). Gartner: 70%+ cite time as the constraint; 100-150 hours a month of manual reconciliation (attribution is loose in the post). Maximor: 70-80% cash/bank auto-posting; Day 5 close within 60 days.

**(c) Verbatim.** Controller: "I don't know how confident I am at building an agent for myself that won't screw it up." Growth equity CFO: "We scaled from 8 to 22 entities without adding finance headcount."

**(d) Fix.** Done-For-You: forward-deployed finance engineers build in parallel; controller gives two 90-minute reviews; read-only until the controller is "100%" confident.

**(e)** Edge cases need "quick monthly check-ins". Non-standard bank formats and LATAM/EMEA CSVs are named as hard.

### 2.6 9 Finance Predictions for 2026 (Dec 23, 2025)

[FETCHED](https://www.maximor.ai/blog/9-predictions-for-2026)

The tone here is deliberately provocative; it shows what they like to argue about.

- **#2 "Close in 5 Days or Start Updating Your Resume."** APQC: top quartile closes in 4.8 days, median 6.4, bottom quartile 10+. "Speed to Close becomes the primary metric for operational competence."
- **#3 "Your 'Experienced' Team Is More Dangerous Than AI Hallucinations."** Spreadsheet-error studies (94% / 88-90% figures as cited by the post; our own `finance-pain-points.md` has a do-not-use list, check it before reusing these). "AI errors are systematic, traceable, and fixable."
- **#6 "'Human in the Loop' Is Code for 'We Like Being Slow.'"** "Smart companies will roll out confidence-tiered autonomy." Cites 76% of enterprises using HITL for high-stakes exceptions only.
- **#8** "Prediction without context is just gambling with better graphics." Cites Gartner: over 40% of agentic AI projects cancelled by 2027.
- **#9** The monthly finance meeting is dead.
- Closing claims: "99.9% accuracy and audit-grade automation".

**Why this matters for us:** do not pitch "human in the loop" as a virtue. Their stance is that a human on every item is slowness. The virtue is a human on the *right* item, once. See founder beliefs, section 4.

### 2.7 Is My Financial Data Secure with Maximor's AI? (Dec 15, 2025)

[FETCHED](https://www.maximor.ai/blog/is-my-financial-data-secure-with-maximors-ai)

Pain: "Finance data sprawls across ERPs, spreadsheets, and email"; auditors reject AI output without immutable logs. Quotes: "No shadow AI tools, no rogue access. Everything is traceable." / "Every number traces to source with cryptographic proof." Claims SOC 1 Type II, SOC 2 Type II, ISO 27001, GDPR, field-level encryption, optional private VPC, "cryptographically-sealed logs". Does not name any LLM vendor or state a training-data policy.

### 2.8 Maximor Raises $9M (Sep 29, 2025)

[FETCHED](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace)

Pain: "Finance teams spend nights and weekends pulling data from fragmented systems, reconciling accounts, parsing contracts, and building reports — all by hand." Post-ERP-migration teams are still "stuck in spreadsheets, chasing the close." Numbers (unsourced in the post): 75% of accountants nearing retirement; CPA pipeline down 30% in a decade. Verbatim: "Finance leaders don't want disruption. They want business-as-usual" / "Agents do the heavy lifting of prep; finance teams provide oversight". Roadmap: "doubling down on product development across key controllership workflows".

### 2.9 Why Your Revenue Forecast Breaks... (Sep 7, 2026)

[FETCHED](https://www.maximor.ai/blog/revenue-forecast-breaks-customers-control-meter)

"A single large customer's engineering decision can move a quarter." Silent churn: "Usage falls to zero while the contract stays active." Fix: "The planning model and the close run on one source of truth, not two disconnected exercises." Verbatim worth keeping: "When those two exercises live in different systems, they drift." Cites Snowflake's 10-K warning that RPO is not indicative of future product revenue.

### 2.10 The Tax Liability Accumulating While Nobody is Looking (Sep 7, 2026)

[FETCHED](https://www.maximor.ai/blog/indirect-tax-usage-based-billing)

One product, four state treatments (Texas taxes 80% as data processing; Washington taxes in full; California and Florida exempt, per the post). Unused credits may be escheatable: "It is never breakage revenue." Honest scoping: "This is not a tax manual." Only product tie-in: "When recognition, cash application, and the close run on their own, the finance team recovers capacity to scope quiet exposures." Signals tax is *not* a product today.

### 2.11 The Metrics Investors Trust Least (Sep 2, 2026)

[FETCHED](https://www.maximor.ai/blog/metrics-investors-trust-least-consumption-businesses)

"ARR is not GAAP revenue and is not a forecast of revenue." "Vagueness is what draws the comment." (SEC comment letters.) Fix: indicators "surface from one reconciled source, rather than being reassembled from separate subledgers each period."

### 2.12 The Allocation Problem Hiding in Hybrid AI Contracts (Sep 2, 2026)

[FETCHED](https://www.maximor.ai/blog/allocation-problem-hybrid-ai-contracts)

"It is the least automated step, because it turns on estimates most billing systems never make." "Allocation resists templating. It runs on judgment a billing system was never built to hold." "An option creates a material right. A commitment does not." Product claim: "it captures that judgment at inception and applies it consistently across the portfolio." And the line that states their division of labor: "The judgment stays yours. The engine that applies it at scale is the platform's."

### 2.13 What Belongs In Cost Of Revenue When Inference Is The Product (Sep 1, 2026)

[FETCHED](https://www.maximor.ai/blog/cost-of-revenue-inference-product)

ICONIQ Jan 2026 (as cited): AI gross margins 41% (2024), 45% (2025), about 52% projected 2026. Admits uncertainty: "Whether a trained model's weights are 'software' under either standard is not settled." One sentence doubles as a description of their own cost curve: "As a system handles the same kinds of work repeatedly, the team optimizes models, caching, and prompts. The cost to produce a unit of output then tends to fall over the life of a deployment." (Compare workshop slide 10.)

### 2.14 Close readiness assessment — the ten questions, verbatim

[FETCHED](https://www.maximor.ai/close-assessment). This is Maximor's own checklist of where a close hurts. Each question is a pain they consider common enough to score prospects on.

Revenue gap
1. "Does your revenue team close later than the rest of the books because they're still working through contract allocations?"
2. "When a contract is modified mid-quarter, does someone manually determine the accounting treatment and rework the allocation in a spreadsheet?"
3. "If an auditor asked you to trace a signed contract to the revenue recognized on it this quarter, would that take more than fifteen minutes?"

Cash gap
4. "Do your clearing or suspense account balances grow month over month, requiring manual cleanup before the close can finish?"
5. **"When a customer sends one payment covering multiple invoices — or short-pays by a small amount — does someone have to match it by hand?"**
6. "Is bank reconciliation something that happens in the last few days of close rather than continuously through the month?"

Knowledge gap
7. "If your controller were unreachable for an entire close cycle, would the close suffer because the team can't hold the same standard without them?"
8. "Are your accruals and prepaids run from spreadsheets that someone has to remember to reverse or amortize each period?"
9. "When you add a new entity — through acquisition or expansion — does it increase your days-to-close for at least two quarters?"
10. "When your auditors request workpapers, does your team spend more than a day assembling them from spreadsheets, emails, and shared drives?"

Our build answers 4, 5, 6 (cash application with short-pays), 7 (scoped facts and compiled policies outlive the person), and 10 (audit pack). That is five of their ten, by their own wording. The [cash automation page](https://www.maximor.ai/cash-automation) itself never mentions short-pays, remittances, deductions or suspense accounts (FETCHED, checked term by term), so the public depth on this pain is one assessment question.

### 2.15 Press release, Aug 5, 2026 (35x growth)

FETCHED via [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html) and [Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance). Not repeating the numbers in company intel. New for storytelling:
- "They work inside the existing stack, taking action where finance teams already work: posting entries in the ERP, reconciling bank accounts, capturing bills, chasing approvals, sending invoices and **escalating judgment calls in Slack**."
- "The remaining 2% are escalated when Maximor encounters a decision it has not seen before. Once the team resolves it, the system learns how to handle it next time."
- "The ERP remains the system of record, while Maximor becomes the system of action across it."
- Sloan Session (Dura): "...It runs the operation but, critically, it knows when to pull us in."
- Ashu Garg (Foundation Capital): "Maximor is moving the category from automation to autonomy." and "Finance software has spent years automating individual tasks while leaving the team responsible for stitching the work together."
- Customers "cut repetitive finance work by about 90% and audit exceptions by about 75%, according to the company."
- [cfotech.news](https://cfotech.news/story/maximor-expands-autonomous-finance-platform-after-growth) (FETCHED): pricing is for work that goes live, not seats.

**Consequence for our pitch:** "asks in Slack and learns" is already their public claim. Saying it is not differentiation. What they do not say anywhere I read: that the stored answer has a *scope*, that repeated answers get *compiled into an approved policy*, or that a re-run costs *zero model calls*. Those three are where to put the emphasis.

---

## 3. The pains Maximor talks about most, ranked

Ranked by how often the pain appears across posts, pages and founder posts, weighted by where they put it (headline vs aside).

| # | Pain | Persona | The moment it hurts | Sources (2+ each) |
|---|---|---|---|---|
| 1 | **The policy was never written down ("human runtime").** Logic lives in the controller's head, an analyst's inbox, FINAL_v7_USE_THIS. | Controller; the staff accountant who inherits the work | "11pm on the 4th day of close" deciding what is material; the cycle the controller is unreachable; the new hire's first close | [Autonomous finance essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance); [Ram LinkedIn](https://www.linkedin.com/posts/ramnandan_what-we-mean-by-autonomous-finance-activity-7492993910693142528-zsj2); [Ajay LinkedIn "a prompt isn't a policy"](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_we-made-a-film-about-cfos-afraid-of-autonomous-activity-7494138015015940096-tmuQ); [audit post "the trail goes cold"](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit); [close assessment Q7](https://www.maximor.ai/close-assessment); [Ram 2025 "details customers never write down"](https://www.linkedin.com/posts/ramnandan_we-feel-this-shift-deeply-at-maximor-ai-activity-7348096156079452161-Z6WH); workshop slide 5 |
| 2 | **Being right is not enough; you have to prove it.** Evidence is assembled after the fact from spreadsheets, emails and shared drives. | Controller, external auditor, CFO in diligence | PBC requests at audit fieldwork; buyer diligence ("How did you calculate this?"); the 15-minute contract-to-revenue trace | [audit post](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit); [close assessment Q3, Q10](https://www.maximor.ai/close-assessment); [accuracy post](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production); [security post](https://www.maximor.ai/blog/is-my-financial-data-secure-with-maximors-ai); [Ajay podcast](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor); [/cfo "70% less audit prep"](https://www.maximor.ai/cfo) |
| 3 | **Tools stop one step short; a person carries the work across every gap.** Matching is easy, the off-amount is where the human gets pulled in. | AP/AR analyst, senior accountant; CFO who wants one view | The invoice that does not match its PO; the hand-off between AR tool, close tool and cash forecast | [essay "It's homework"](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance); [Ram "YC playbook"](https://www.linkedin.com/posts/ramnandan_the-yc-playbook-is-dead-it-was-built-for-activity-7505279206369599488-ZM2Q); [Ram "A CFO doesn't need a close tool"](https://www.linkedin.com/posts/ramnandan_a-cmo-doesnt-need-a-paid-ads-tool-a-cro-activity-7505641686589599744-9eGg); [Maximor LinkedIn "picks up work somewhere in the middle"](https://www.linkedin.com/company/maximor-ai); [press release, Garg + Session](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html) |
| 4 | **Cash is still reconciled by hand.** Multi-invoice and short payments matched manually, suspense balances growing, bank rec crammed into the last days. | AR analyst / cash accountant, senior accountant | Last few days of close; every morning someone assembles the cash position | [close assessment Q4-6](https://www.maximor.ai/close-assessment); [Kiteworks LinkedIn post: 20 accountants, 66 accounts, 7 currencies](https://www.linkedin.com/company/maximor-ai); [bandwidth post: 40+ hours a month on bank and card recs](https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project); [CFO Dive "buried in reconciliations"](https://www.cfodive.com/news/startup-raises-9m-rescue-finance-teams-buried-reconciliations-agentic-ai/761444/); [TechCrunch: VLOOKUP across files](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/) |
| 5 | **The close is slow and eats nights and weekends.** 10-15 days, then the board deck. | Controller and team; CFO judged on it | "3am the day before month-end close"; "tick and tie until midnight"; weekends before a board meeting | [predictions #2](https://www.maximor.ai/blog/9-predictions-for-2026); [seed post](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace); [Ram "Introducing Maximor"](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ); [accuracy post](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production); [Foundation Capital "race through a maze of Excel"](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor) |
| 6 | **CFOs cannot trust AI they cannot explain, and cannot afford AI they must babysit.** | CFO, audit committee | "I can't explain to my board why the AI made that decision"; the $450K misclassification | [Maximor LinkedIn "Copilots = babysitting"](https://www.linkedin.com/posts/maximor-ai_maximor-ai-automation-platform-for-accounting-activity-7436229911687712768-NkNf); [accuracy post](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production); [CFO benchmark 14%](https://www.maximor.ai/cfo-benchmark); [Ajay "primitives" post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k); [Ram "Introducing Maximor"](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ) |
| 7 | **Systems drift apart after a commercial change.** Sales updates the CRM; billing maybe; the ERP schedule never. | Revenue accountant, controller | Found "during close, or during the audit"; "frantically trying to keep up with Sales' pricing changes" | [audit post](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit); [5 checks, #5](https://www.maximor.ai/blog/usage-based-revenue-checks-cfo); [forecast post "they drift"](https://www.maximor.ai/blog/revenue-forecast-breaks-customers-control-meter); [close assessment Q2](https://www.maximor.ai/close-assessment); [Ram "Introducing Maximor"](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ) |
| 8 | **No bandwidth to implement, and DIY agents do not hold.** Rules and prompts freeze the moment the business changes. | CFO, controller | Month 4 of a failed implementation; 3 months into a Codex / Claude Code build | [bandwidth post](https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project); [Ram HiBid post](https://www.linkedin.com/posts/ramnandan_hibid-auctionss-cfo-christopher-l-stiegal-activity-7506004135197175808-bvYB); [Ajay film post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_we-made-a-film-about-cfos-afraid-of-autonomous-activity-7494138015015940096-tmuQ); a Ram post on "vibecoding" DIY agents with "no audit trail, no policy layer" is UNVERIFIED (search snippet only, URL not recovered) |

---

## 4. Founder beliefs and pet phrases

### Ramnandan Krishnamurthy (CEO)

1. **The work was never in the tools.** Software is the filing cabinet; people are the runtime. [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance)
2. **Intelligence is cheap, accountability and judgment are scarce.** "Intelligence is becoming cheap. Accountability is not." [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance). "When intelligence becomes commoditised, judgment becomes the competitive advantage." [CFO benchmark](https://www.maximor.ai/cfo-benchmark). "Finance teams are not short of software. They are short of systems willing to take responsibility for the work." [press release](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html)
3. **Ask once.** "remembers the answer, so it never asks twice" ([LinkedIn](https://www.linkedin.com/posts/ramnandan_what-we-mean-by-autonomous-finance-activity-7492993910693142528-zsj2)); "Then it'll learn from the decision you make so it doesn't have to ask you again." ([LinkedIn](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ)); "knows when to stop and ask" ([press release](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance)). On HiBid: "Once they explain it in plain language, that judgment becomes part of HiBid's operating context -- the agents apply it to every similar transaction going forward." ([LinkedIn](https://www.linkedin.com/posts/ramnandan_hibid-auctionss-cfo-christopher-l-stiegal-activity-7506004135197175808-bvYB))
4. **Control means traceability, not manual checking.** "'Control' doesn't mean checking everything by hand... True control comes down to trust. What you need is to know what happened, why, and have a clear audit trail to follow." The CFO's fears, in his words: "An agent making decisions for me? Entries I can't trace? How does it even know my business if it all lives in my head?" ([LinkedIn](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ))
5. **Solve judgment at the infrastructure layer, not per workflow.** "It could always match an invoice to a purchase order in seconds. But if the amount was off or the PO didn't exist someone still had to open the file and decide what to do." ([LinkedIn](https://www.linkedin.com/posts/ramnandan_the-yc-playbook-is-dead-it-was-built-for-activity-7505279206369599488-ZM2Q)). "A CFO doesn't need a close tool." ([LinkedIn](https://www.linkedin.com/posts/ramnandan_a-cmo-doesnt-need-a-paid-ads-tool-a-cro-activity-7505641686589599744-9eGg))
6. **Differentiation is in what customers never wrote down.** "part product, part detective - turning messy edge cases into reusable product primitives. Differentiation lies in the details customers never write down!" ([LinkedIn, 2025](https://www.linkedin.com/posts/ramnandan_we-feel-this-shift-deeply-at-maximor-ai-activity-7348096156079452161-Z6WH))
7. **Start with the most painful workflow, then compound.** Dura: "If we can't automate balance sheet recs, we can't automate anything." (Sloan Session, quoted in Ram's post visible on [this page](https://www.linkedin.com/posts/maximor-ai_the-best-ai-rollouts-in-finance-dont-happen-activity-7482792301430292480-Swa1))
8. **Radical ownership.** Hires former founders: "You're the last line of defense." ([LinkedIn](https://www.linkedin.com/posts/ramnandan_3-of-our-earliest-hires-at-maximor-ai-are-activity-7506366394574204928-AMdl)). Same word he uses for the product: responsibility.
9. Forbes, Aug 5, 2026 (UNVERIFIED, 403; from search snippet and a [Kenyan rewrite that credits Forbes](https://streamlinefeed.co.ke/news/maximor-bets-agentic-ai-can-run-finance-autonomously)): 98% of work handled; the remaining 2% is exceptions "where agents raise queries with professionals and learn from the answers." X posts are unreadable (402); the one known post is already in company intel.

### Ajay Krishna Amudan (CTO) — the likelier technical judge

From his [primitives post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k) (about 7 months ago), FETCHED sentence by sentence:

1. **Explain the trajectory, not the result.** "Most systems try to explain results. That's backwards." / "If explanation is generated after the fact, it's fiction." / "agents whose execution path is inspectable by construction, not summarized post-hoc." His example: "why did the Accrual agent decide to not do a certain accrual".
2. **Decision traces, append-only.** "The current Finance systems (looking at you ERPs!) love 'latest state.' That's fatal for agents". / "we model end-to-end decision lifecycles - what we call decision traces - initial hypothesis, intermediate checks, overrides, final resolution" / "If you only store the terminal answer, you've already destroyed explainability." / "database choices matter more than model choices: immutable history vs overwriting state, append-only decision logs vs mutable rows" / "You can't bolt this on later."
3. **Most HITL is fake.** "Most 'human-in-the-loop' systems are really human-does-everything systems. That's not collaboration." / "AI handles the default path and all the learned paths, humans intervene only on intelligent exceptions, those interventions become learning signals for RL and future context for agents"
4. **Correct the reasoning, not the output.** "how do you represent uncertainty, how do you surface why something is ambiguous, how do you let humans correct reasoning, not just outputs?" / "If humans only approve/reject final answers, you're not learning anything useful."
5. "3 more primitives to come in Part 2" — I did not find Part 2.

From his [film post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_we-made-a-film-about-cfos-afraid-of-autonomous-activity-7494138015015940096-tmuQ) (about 1 month ago):

6. **"A prompt isn't a policy."** "How your team actually runs finance was never written down. It's in the workpapers, the exception notes, the judgment call someone made at 11pm before close." / "a rule you hard-code is frozen the moment your business changes. Which is every close." / "No prompts. No rulebook. The policy layer builds itself." / "You can write a prompt. You can't write down judgment."

From his [context post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_every-finance-system-can-tell-you-how-much-activity-7501769294771441664-k3fX) (about 2 weeks ago):

7. "Every finance system can tell you how much revenue you booked. But how many can tell you why it came in where it did? That answer exists, but it gets assembled by hand." / "You can't make a better decision from a number without context."

From the [Foundation Capital "AI in the Real World" episode](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor) (page dated Sep 17, 2026; host Jaya Gupta; YouTube id `id_To082b-s`). Page FETCHED; I did not watch the video, and lines not in quotation marks are the page's paraphrase:

8. **"Proving that your work is correct is a very big part of doing the work in finance."** Chapter title: "Why 'doing the work' is the easy part in finance".
9. **Adversarial agents.** "You can have agents that verify the work of other agents, constantly critiquing it and checking that it makes sense." / "That's what an auditor does. The auditor is this adversarial figure who comes in and critiques the work."
10. Finance as "a set of decomposable problems"; verifiability as a first-class citizen; users can "verify the work of our agents, inspect the evidence, and when the agent gets it wrong, they can override it."
11. Finance teams become "custodians of policies and judgments".
12. Model routing is "absolutely fundamental"; fewer tokens for the same result is better. **Post-training helps in workflows with deep enterprise context, revenue in particular; treasury and cash workflows do not show the same gain** (paraphrase from the page, not a quote).
13. "Models don't really have any concept of short-term or long-term memory." Continual learning is "the promise". Long-run vision: "The 5-to-10-year version of Maximor is going to become closer to this company brain."

### Company LinkedIn voice

- "There's a difference between an agent that does what you told it and an agent that learned from what you did. The first one needs a person writing prompts and rules forever." ([company page](https://www.linkedin.com/company/maximor-ai), about Sep 16, 2026)
- "We started where the money does. A deal closes, and an agent carries it through the terms, the real policy your team uses, the reasoning behind the call, all through billing, collections, and the cash that eventually lands." (same page)
- "Copilots = babysitting every transaction" or "Black-box agents = can't explain a single decision". A CFO: "We need the judgment of our best accountant, at machine speed". ([post](https://www.linkedin.com/posts/maximor-ai_maximor-ai-automation-platform-for-accounting-activity-7436229911687712768-NkNf))
- About section: "proprietary context graph technology". HackMIT post: "How much finance work can an agentic system run?"

### What the beliefs imply for how we describe our build

| Our feature | Their belief it lands on | How to say it | What not to say |
|---|---|---|---|
| Finds the short-pay reason in the CEO's email | Logic lives "in an analyst's inbox"; "why it came in where it did... gets assembled by hand" | The reason existed. It was in an inbox. Nobody's software could read it. | "We do RAG over email." |
| Asks the account owner once in Slack, stores a scoped fact | "never asks twice"; "whom to bring in"; "correct reasoning, not just outputs" | They already say "asks in Slack and learns". Our addition is **scope**: the answer applies to this customer and this kind of deduction, not to every short-pay, and it says so. | "Human in the loop." Ajay: most HITL is "human-does-everything". |
| Compiles repeated judgment into an approved policy; re-run uses zero model calls | "The policy layer builds itself"; workshop: "compile away as much freedom as possible"; routing and token thrift are "absolutely fundamental" | Judgment becomes policy the controller approves. Second month: zero model calls. | "Rules engine." Ajay: a hard-coded rule "is frozen the moment your business changes." Stress the policy is learned, approved, versioned and scoped. |
| Deterministic kernel re-checks every workpaper and tick mark | "If explanation is generated after the fact, it's fiction"; "inspectable by construction"; adversarial agents | The proof is built while the work is done, and a separate checker that cannot be talked into anything re-performs it. | "We log everything." |
| Audit pack with sampling and re-performance | "Auditors check whether you can prove they are correct"; assessment Q10; essay wants every-transaction examination | The auditor's PBC request answered before it is sent. We re-perform 100%, then show the auditor a sample they can re-perform themselves. | Nothing to avoid; they are publicly thin here. |
| AP three-way match | Ram: "if the amount was off or the PO didn't exist someone still had to open the file and decide what to do" | Same judgment layer, second function. The off-amount is the product. | |
| Fine-tuned small open-weight extraction model + our benchmark | Routing fundamental; but Ajay reports little post-training gain in cash workflows | Pitch it as cost and routing (cheap, local, measured), with our benchmark as the honest number. Do not claim fine-tuning made cash application *smarter* unless the benchmark shows it. | |

---

## 5. Vocabulary sheet

Use the idea, vary the wording. Trademarked or coined terms are marked (theirs).

| Term | What they mean by it | Source |
|---|---|---|
| **Autonomous finance** (theirs, category name) | The system "carries the judgment—learns it, applies it, improves it", across the whole office of the CFO. Contrast: "automation" = tasks. | [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance) |
| **Human runtime** (theirs, coined) | Software holds records; people execute the process. The thing they exist to end. | [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance) |
| **Audit-Ready Agents™** | An agent that "owns a specific finance workflow end-to-end" and produces evidence by default. | [cash automation FAQ](https://www.maximor.ai/cash-automation) |
| **Unified finance context (layer)** | One shared context "across every system and policy". Ajay: "the unified finance context that finance needs in the era of AI." | [/why](https://www.maximor.ai/why); [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_every-finance-system-can-tell-you-how-much-activity-7501769294771441664-k3fX) |
| **Operating context** | Where a plain-language human answer goes so it applies to "every similar transaction going forward". | [Ram, HiBid](https://www.linkedin.com/posts/ramnandan_hibid-auctionss-cfo-christopher-l-stiegal-activity-7506004135197175808-bvYB) |
| **Policy layer** | "Encodes your accounting logic, not generic rules." "The policy layer builds itself." Derived from how the team works, not configured. | [/why](https://www.maximor.ai/why); [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_we-made-a-film-about-cfos-afraid-of-autonomous-activity-7494138015015940096-tmuQ) |
| **Decision traces** | Full lifecycle of a decision: "initial hypothesis, intermediate checks, overrides, final resolution", append-only. | [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k) |
| **Context graph** | LinkedIn About: "proprietary context graph technology". Foundation Capital's term for accumulated decision traces. | [LinkedIn](https://www.linkedin.com/company/maximor-ai); company intel |
| **99/1** (and 98/2) | 99% autonomous is "table stakes"; "Our product is built around the remaining 1%." Measured figure in press: 98% end to end, 2% escalated. | [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance); [press](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance) |
| **Straight through** | Transactions that complete with no human touch ("98% ... run straight through"). | [LinkedIn](https://www.linkedin.com/company/maximor-ai) |
| **Stop and ask / never asks twice / knows when to pull us in** | The escalation behavior. Ask only on a decision "it has not seen before", then remember. | [press](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance); [Ram](https://www.linkedin.com/posts/ramnandan_what-we-mean-by-autonomous-finance-activity-7492993910693142528-zsj2) |
| **Intelligent exceptions** | The only place a human should intervene; the intervention becomes a learning signal. | [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k) |
| **Confidence-tiered autonomy** | Routine decisions auto-execute, high-stakes ones route to a human. Their answer to "human in the loop = slow". | [predictions #6](https://www.maximor.ai/blog/9-predictions-for-2026) |
| **Self-learning, self-escalating, self-improving** | Ram's three-part description of the system. | [Ram](https://www.linkedin.com/posts/ramnandan_introducing-maximor-ai-the-autonomous-activity-7493699960857686016-zFEJ) |
| **System of action / system of record** | "The ERP remains the system of record, while Maximor becomes the system of action across it." | [press](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html) |
| **Layer on top / no rip-and-replace / ERP-agnostic / "Orchestrate"** | Never migrate the GL. | [seed post](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace); [jujitsu](https://www.maximor.ai/infographics-jujitsu) |
| **Continuous close** | "A close that runs continuously"; bank rec through the month, not the last days. | [/why](https://www.maximor.ai/why); [assessment Q6](https://www.maximor.ai/close-assessment) |
| **5-day close / Day 5** | Their standard promise and the benchmark they cite from APQC (top quartile 4.8 days). | [offer](https://www.maximor.ai/cfo-offer-all); [predictions #2](https://www.maximor.ai/blog/9-predictions-for-2026) |
| **Evidence packs / source lineage** | Per entry: "source lineage, policy references, calculation logs, and review trails". "Every action it takes carries its own evidence: what it did, why, and based on what." | [accuracy post](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production); [essay](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance); company intel |
| **Deterministic, explainable, auditable** | Their three adjectives for the audit trail. | [/why](https://www.maximor.ai/why) |
| **Inspectable by construction** | Execution path visible as it happens, "not summarized post-hoc". | [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k) |
| **Adversarial agents** | Agents that critique other agents' work, modeled on the auditor. | [podcast page](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor) |
| **Primitives** | Fixed building blocks of accounting that fix the agent architecture. Ram: "reusable product primitives". | [Ajay](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k) |
| **Custodians of policies and judgments** | What the finance team becomes. | [podcast page](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor) |
| **Company brain / intelligence layer** | 5-10 year vision. | [podcast page](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor) |
| **Map / Modernize / Memorize; "Rules that write themselves"** | Onboarding method: reverse-engineer the close, deploy agents on the existing stack, build institutional memory through approvals. | [/controller](https://www.maximor.ai/controller) |
| **Done-For-You; forward-deployed finance engineers** | They build it; controller spends about 4 hours. "part product, part detective". | [bandwidth post](https://www.maximor.ai/blog/we-dont-have-bandwidth-for-automation-project) |
| **Read-only until trust** | Agents shadow first, post only after the controller signs off. | [accuracy post](https://www.maximor.ai/blog/will-finance-reporting-accuracy-hold-in-production) |
| **Finance-native words they use unprompted** | tick and tie; PBC (scramble); workpapers; flux; suspense / clearing accounts; short-pays; tribal knowledge; true-up; SSP; breakage; stitching | across sources above |

Words to avoid or handle with care: "copilot" (they define it as babysitting), "human in the loop" as a selling point, "rules engine", "chatbot" (workshop slide 3: "Not a chatbot"), "replace the ERP".

---

## 6. Story hooks

Five openings for a 5-minute demo. Each is tied to a sentence one of the founders has published, so the recognition is theirs, and each turns in the second beat to something they have not said.

**Hook 1 — Their own question.**
"Maximor's close assessment asks controllers ten questions. Number five: when a customer short-pays by a small amount, does someone have to match it by hand? For almost everyone the answer is yes. Here is $1,840 missing from a $46,000 payment, and here is what happens when the answer is no."
Source: [close assessment Q5](https://www.maximor.ai/close-assessment). Then walk Q4, Q7, Q10 as the demo's chapter headings. (Dollar figures are placeholders; use the seeded world's.)

**Hook 2 — The inbox.**
"Ram wrote that every finance team runs on a policy written down nowhere: it lives in a controller's head, in an analyst's inbox. We took that literally. The reason this customer paid short is in an email the CEO sent three weeks ago. Watch the agent find it, cite it, and book it. Then watch what it does when there is no email."
Source: [essay, "The human runtime"](https://www.maximor.ai/blog/what-we-mean-by-autonomous-finance).

**Hook 3 — Never asks twice, and proves it.**
"Maximor says its agents remember the answer so they never ask twice. We wanted to see what 'remember' has to mean for that to be safe. So the answer is stored with a scope: this customer, this kind of deduction, from this date, said by this person. Same customer next month: no question. Different customer, same shortfall: it asks, because the scope says it should. Third time, it proposes a policy; the controller approves it; and the whole month re-runs with zero model calls."
Sources: [Ram](https://www.linkedin.com/posts/ramnandan_what-we-mean-by-autonomous-finance-activity-7492993910693142528-zsj2); [press release](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html); workshop slide 6 ("Compile: Repeated judgment -> policy").

**Hook 4 — Explanation after the fact is fiction.**
"Ajay wrote: if explanation is generated after the fact, it's fiction. So we never generate one. Every entry carries its workpaper as it is made, and a deterministic kernel, no model in it, re-performs every tick mark before anything posts. Proving the work is most of the work. This is our pytest for finance."
Sources: [Ajay, primitives post](https://www.linkedin.com/posts/ajay-krishna-amudan-a772507a_what-ramnandan-krishnamurthy-and-i-realized-activity-7422317352987303936-zp2k); [podcast page](https://foundationcapital.com/ideas/how-ai-agents-are-automating-the-cfo-s-office-ajay-krishna-co-founder-and-cto-maximor); workshop slide 7.

**Hook 5 — The off-amount is the product.**
"Software could always match an invoice to a PO in seconds. When the amount was off, someone opened the file and decided. That is Ram's description of why finance software stalled. Everything we built lives in that moment: the payment that is short, the invoice that is over, and a system that knows whether it has seen this before."
Source: [Ram, "YC playbook"](https://www.linkedin.com/posts/ramnandan_the-yc-playbook-is-dead-it-was-built-for-activity-7505279206369599488-ZM2Q). Bridges cash application and AP three-way match as one judgment layer.

**Closer option (any hook).** "The auditors arrive. Assessment question ten asks whether assembling workpapers takes more than a day. Ours took no time, because it was never assembled; it accumulated." Source: [close assessment Q10](https://www.maximor.ai/close-assessment); [audit post](https://www.maximor.ai/blog/can-your-usage-based-revenue-recognition-service-survive-audit): "assembling it is a project, not a query."

### Things a founder might push back on

- "We already do that." True for ask-in-Slack-and-learn. Have the three-word answer ready: scope, compile, zero calls.
- "Fine-tuning does not help in cash." Ajay's reported experience. Answer with the benchmark number and position the small model as a routing and cost choice.
- "Human in the loop." Do not use the phrase as a feature. Use "asks the right person once".
- Short-pay sizes. Their wording is "short-pays by a small amount". The realistic pain is small, frequent and unexplained, not a dramatic six-figure miss. Keep the demo amount modest.

---

## 7. Dead ends and gaps

- Forbes (both the Sep 2025 and Aug 2026 Prosser pieces): 403. Only search snippets and a third-party rewrite. UNVERIFIED.
- X / @skramd: 402. Nothing new beyond company intel.
- eWeek, Manila Times: 403.
- The Foundation Capital podcast video was not watched; only the show-notes page was read.
- Ajay's "Part 2" of the primitives post: not found.
- A Ram post about finance teams "vibecoding" DIY agents with "no audit trail, no policy layer" appeared in a search snippet; URL not recovered. UNVERIFIED.
- No Maximor blog post addresses cash application, AR collections or AP directly. The evidence for those pains comes from the close assessment, LinkedIn and press.
- Third-party statistics inside the blog posts (APQC, Gartner, spreadsheet-error studies, ICONIQ) are recorded as cited by Maximor. I did not verify them at the original source.
