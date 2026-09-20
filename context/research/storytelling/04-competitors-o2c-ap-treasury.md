# 04 — Competitors: order-to-cash, AP, reconciliation, treasury

Researched 2026-09-19. Slice: O2C / cash application / collections / deductions, AP automation, reconciliation, treasury and cash forecasting. Close/ERP players (Numeric, FloQast, BlackLine, Rillet, Campfire, Basis) are covered by another researcher and skipped here.

**Purpose:** find capabilities specialists ship that Maximor does not publicly have. Each is a candidate "this would make Maximor better" feature.

**Evidence key**
- **VERIFIED** = I fetched the vendor's own page this session and the claim is on it. Note: pages are read through a summarising fetch tool, so exact wording of quotes should be re-checked in a browser before going on a slide.
- **UNVERIFIED** = search-result snippet only, or the primary page failed to load (HighRadius product pages timed out repeatedly; several deep links 404'd).
- All accuracy / match-rate numbers are **vendor self-reported marketing claims**. None is independently audited, and none of these vendors publishes a reproducible benchmark.
- "No public evidence" / "—" in a matrix cell means *I did not see it on the pages fetched*, not proof of absence.

---

## 0. Maximor baseline for this slice (re-checked today)

| Source | What it says | Status |
|---|---|---|
| [maximor.ai](https://www.maximor.ai/) home, AR/AP block | "Paid on time, both ways. Invoices sent and collections chased for you. Bills captured, coded and scheduled. Routine vendor and customer emails, handled for you. Terms enforced, exceptions come to you." Example chips: "INV-2201 · reminder sent · promised Fri", "Vendor bill · coded 6420 · scheduled net-30", "Northwind asks net-60, with you". | VERIFIED |
| [maximor.ai/cash-automation](https://www.maximor.ai/cash-automation) | "Real-time Cash Application Across AR & AP", "Proprietary AI auto-matches AR and AP invoices, bills, and payments daily", "Global Cash Positioning — consolidates balances across banks, credit cards, and ERPs", 13-week forecasting, credit card categorization, cash burn reporting. | VERIFIED |
| Same two pages | **Not mentioned:** remittance capture, short payments, deductions/disputes workflow, payment-processor payout reconciliation, credit risk, customer portal, vendor onboarding / W-9, duplicate-invoice detection, PO / three-way match, vendor bank-change fraud, FX exposure. There is **no dedicated AR/AP product page** in the site navigation (nav has revenue, cash, close, reporting, search only). | VERIFIED (absence on fetched pages) |

**Side finding worth a decision:** Maximor's own home page uses **"Northwind"** as its example customer name ("Northwind asks net-60, with you"). Our fixture is "Northwind Systems". That is either a nice callback or a risk of looking derivative — confirm in a browser and decide deliberately.

---

## 1. Per-competitor profiles

### 1A. Order-to-cash / AR

#### HighRadius — enterprise O2C suite, now sold as a catalogue of "agents"
- **Positioning:** AI-powered order-to-cash for large enterprises (CPG, manufacturing, distribution). Publishes agent counts per module and classifies each agent as **automated (human touch in ≤10% of cases)** or **assisted (>10%)**. [Agentic deductions blog](https://www.highradius.com/resources/Blog/what-is-agentic-ai-in-deductions-management-and-how-does-it-work/) — VERIFIED.
- **Distinctive capabilities**
  1. **Omnichannel remittance capture**: email bodies and attachments, check stubs (template-agnostic), and RPA log-ins to customer AP portals to download remittance data; "95% straight-through cash application with automated remittance aggregation". [Remittance auto-aggregation blog](https://www.highradius.com/resources/Blog/auto-aggregation-of-remittance-advice-with-ar-automation/) — VERIFIED. "13 AI agents", "600+ AP portals", "90%+ automation" per [cash application product page](https://www.highradius.com/product/cash-application-automation/) — UNVERIFIED (page timed out; snippet only).
  2. **Deductions**: *AI Deduction Validity Predictor* scores claims by recovery potential; *Claims Backup Automation Agent* pulls PODs and BOLs from customer portals; *Deductions Auto-Coding Engine* maps customer-specific reason codes to standard codes; *Trade Promotion Auto-Matching Agent* (assisted); *Pricing Research Automation* matches invoice vs sales order vs contract; *Invalid Claim Upload Agent* posts denial packages with evidence back to the customer portal. Cites Danone recovering $20M in invalid deductions and 30% analyst time saved. [Same blog](https://www.highradius.com/resources/Blog/what-is-agentic-ai-in-deductions-management-and-how-does-it-work/) — VERIFIED. "90%+ prediction accuracy", "250+ portals" — UNVERIFIED (snippet, [backup capture page](https://www.highradius.com/software/order-to-cash/back-up-document-capture/) timed out).
  3. **Collections: 15 agents (9 automated, 6 assisted)** — AP Portal Invoice Upload, AP Portal Invoice Tracking (reads Disputed / P2P statuses in Ariba, Coupa), Dunning Emails (GenAI, "Smart Send" timing), Worklist Prioritization ("20+ customer parameters, predicting 30-day delinquency"), POD download "from 100+ carrier portals", Past Due Analysis summary, AR Email Inbox (labels and assigns inbound mail), inbound/outbound call agents. Claims: past due −20%, collector productivity +30%. [Collections agents page](https://www.highradius.com/resources/platform/automated-collections-software/) — VERIFIED.
  4. **Payment-date prediction per open invoice** and "promise to pay integrity" scoring — UNVERIFIED (snippets from [collections demo](https://www.highradius.com/demo-experience-collections/)).
- **Exceptions / learning:** automated-vs-assisted threshold is the published human-in-loop model. Learning is described only as "analyzes historical customer patterns". No email/Slack-native question-asking to internal owners described.

#### Tesorio — "Agentic Financial Operations", mid-market/enterprise SaaS
- **Positioning:** "Turn Revenue Into Cash." Customers named: Veeva, GitLab, Couchbase. [tesorio.com](https://www.tesorio.com/) — VERIFIED.
- **Distinctive capabilities**
  1. **Cash Application Agent**: "95%+ auto-match rate across 200+ customers"; scans email for remittances and "processes CSV, XLSX, TXT, images, and virtually any attachment type"; lockbox PDFs and check images; handles partial payments, overpayments, cross-invoice and multi-entity; **parent-child entity matching**; **deduction classification (early payment discounts, trade promos, pricing disputes)**; 0.8 s per payment. [Cash application page](https://www.tesorio.com/cash-application) — VERIFIED.
  2. **Collections Agent** "drafts personalized follow-up emails, extracts payment promises, and manages your dunning pipeline". Dashboard example: **"Promise to Pay: Mar 15, 2026 · Confidence: 92% · Source: Email reply"**. VERIFIED (home).
  3. **Supplier Portal Agent** "logs into supplier portals, submits and delivers invoices, catches errors, and monitors status" (Coupa, Ariba). VERIFIED (home).
  4. **AR Forecast**: ML-predicted inflows, flags gaps vs targets. VERIFIED (home).
- **Exceptions / learning:** unmatched payments go to a queue with "AI-suggested matches ranked by confidence"; "learns from each correction". "30% avg DSO reduction".

#### Upflow — AR for B2B mid-market, three named agents
- **Positioning:** "AI-powered AR insights for stronger financial relationships." [upflow.io](https://upflow.io/) — VERIFIED.
- **Distinctive capabilities**
  1. **Collections Agent** across email, SMS, calls, letters, tasks; **"Dispute and promise-to-pay intent extracted from customer replies"**; complex accounts routed to humans. [Upflow Intelligence](https://upflow.io/upflow-intelligence) — VERIFIED.
  2. **Autonomy dial**: "Autonomy controls ranging from suggestion-only to fully autonomous" (VERIFIED, home). Per-skill settings (Replies / Promise to pay / Disputes; Monitor / Suggest / Act) and custom plain-language instructions for tone and hand-back — UNVERIFIED (snippet from [docs changelog](https://docs.upflow.io/en-us/changelog)).
  3. **Cash App Agent**: "98% auto-match rate"; "remittance details captured automatically from emails and portals"; partial and complex payments; "exception visibility for unapplied cash". VERIFIED.
  4. **Insights Agent**: surfaces "root causes of late payment" from connected tools; **Upflow MCP** for Claude / ChatGPT. VERIFIED.
  5. **B2B payment portal**, 12+ payment methods. VERIFIED.
- **Results:** "30% average DSO reduction in 3 months"; ActivTrak "85% of follow-up emails processed automatically".

#### Growfin — collections CRM with sales collaboration
- **Positioning:** AR automation via "behavioral intelligence"; claims "over 50% of enterprise invoices go overdue despite ERP-based automations" (vendor claim, no source given). [growfin.ai](https://www.growfin.ai/) — VERIFIED.
- **Capabilities:** Collections CRM with prioritisation; payment-delay prediction; cash application with OCR + ML; **stakeholder collaboration via Slack and Salesforce**; cash forecasting. Claims 33% DSO reduction. Cash-app deep link 404'd, so no detail on remittance channels — no public evidence gathered.

#### Billtrust — "The Cash Generation Platform", network play
- **Positioning:** B2B supplier AR with a payments network: "13M+ buyers and $1T+ in annual invoice volume". [billtrust.com](https://www.billtrust.com/) — VERIFIED.
- **Capabilities:** invoice delivery into **"260+ AP portals"** from one interface; cash application "95%+ match rates", top customers "99.6%", works "even with fragmented remittances"; collections AI "tuned to each buyer's behavior" (notes most AR teams only work the top 13% of accounts); **credit decisions "in minutes, not weeks"** with continuous monitoring. Claims 50% lower DSO, 384% ROI. Agentic collections deep link 404'd — reply-reading not evidenced.
- **Scenario content:** [What is cash application](https://www.billtrust.com/resources/blog/what-is-cash-application), [Why short pays happen](https://www.billtrust.com/resources/blog/short-pays-why-they-happen-and-what-you-can-do-about-them) — VERIFIED.

#### Versapay — collaborative AR (customer in the loop)
- **Positioning:** invoice-to-cash with a shared supplier-customer workspace; 10,000+ customers, $257B annual payments. [versapay.com](https://www.versapay.com/) — VERIFIED.
- **Capabilities:** self-serve portal "to pay, manage accounts, or resolve disputes"; AI/ML cash application with real-time ERP posting; delinquency prediction; **at payment time the customer must "indicate the reason for a short payment via an approved list of options" and can "leave a note — directly on the invoice"** ([short-pay guide](https://www.versapay.com/resources/short-paid-invoice-how-to-handle) — VERIFIED). This moves reason capture to the payer, which is the opposite of investigating after the fact.

#### Esker — enterprise O2C + P2P suite ("Synergy AI")
- **Positioning:** AI-driven platform connecting "every stage of the order-to-cash process". [Esker O2C](https://www.esker.com/business-process-solutions/order-cash/) — VERIFIED.
- **Capabilities:** cash application, deductions management, collections prioritisation by predicted payment behaviour, credit reviews and risk monitoring, customer inquiry self-service. Page is generic; no rates or concrete mechanisms stated.

#### Paraglide — AI agents for the AR inbox (seed $5M Jan 2026, Bessemer + DN Capital — funding UNVERIFIED, snippet)
- **Positioning:** "The smartest way to get paid on time"; agents that work the shared AR mailbox. [paraglide.ai](https://www.paraglide.ai/) — VERIFIED.
- **Capabilities:** "Automate replies to invoice queries" in the existing thread, multilingual, 24/7; end-to-end collections conversations; disputes and deductions handling; captures promise-to-pay dates and payment confirmations; **submits to supplier portals** with an agent that "reasons about what it sees on screen, adapts to any portal"; cash application. Its pitch against incumbents: they "automate message one. The replies, queries, disputes, and follow-ups that follow all land on the AR team manually." ([collections blog](https://www.paraglide.ai/blog/how-to-automate-collections-with-ai-agents) — VERIFIED.) Claims 34% average DSO reduction (no source).

#### Monto — customer AP-portal specialist
- **Positioning:** "Get paid through every customer AP portal, on autopilot." [get.montopay.com](https://get.montopay.com/) — VERIFIED.
- **Capabilities:** a **dedicated agent per customer** that "learns their portal, forms, and PO rules"; submits invoices to "500+ customer AP portals" (Coupa, SAP Ariba, Oracle, Amazon, Tungsten) "within an hour"; validates before submission ("99% fewer rejections"); live status view ("Processing", "Pending Customer", "Paid"); NetSuite and SAP native. Case: Cloudinary across 41 portals — rejections −23.5%, billing time −66%, DSO −21% ([blog](https://montopay.com/how-you-get-paid-has-changed-your-ar-workflow-hasnt/) — VERIFIED).

#### Kolleno — O2C "built to run itself"
- [kolleno.com](https://www.kolleno.com/) — VERIFIED. AI follow-ups, payment portal with "AI to suggest the fastest or most cost-effective way to pay", cash application with pattern learning, credit scoring, disputes module, forecasting, e-invoicing. **Agents run in three modes: Insights, Copilot, or autonomous.** Claims 27% fewer overdue invoices.

#### Chaser — SMB credit control
- [chaserhq.com](https://www.chaserhq.com/) — VERIFIED. Email + SMS + automated phone reminders, AI email generation, **late payment predictor**, payer rating, credit monitoring, payment plans, early-payment discounts and late fees, escalation to debt-collection services. SMB (Xero / QuickBooks) focus.

#### 2026 entrants
- **Monk** — $25M Series A, April 2026 (Footwork, Acrew) (UNVERIFIED, [PR Newswire](https://www.prnewswire.com/news-releases/monk-raises-25m-series-a-to-automate-accounts-receivable-with-ai-302748872.html)). [monk.com](https://www.monk.com/) — VERIFIED: collections agent with "24% higher responses vs automated follow-up emails"; cash application "80%+ processing accuracy" on lockbox files and check images; handles **"missing PO numbers, W9 documentation, and approval delays"**; uploads to Coupa / Ariba; AP vendor-setup forms.
- **Fazeshift** — $17M Series A, May 2026 (F-Prime, Gradient, YC) (UNVERIFIED, [Crunchbase News](https://news.crunchbase.com/fintech/fazeshift-accounts-receivable-ai-finance-ops-startup-funding/)). [fazeshift.com](https://www.fazeshift.com/) — VERIFIED: turns sales contracts into invoices/subscriptions (Stripe, NetSuite, Intacct); **cash application that navigates "parent-child company payer arrangements" and cases where business names differ**; replies "with the right document attachments"; **pauses outreach "while customers work out payment details"**; contract-vs-billed comparison; pulls credit reports and sets limits/holds; responds to disputes. Claims "90% less time spent on AR".

### 1B. Accounts payable

#### Ramp — spend platform; AP agents (Oct 2025) and Accounting Agent (Feb 2026)
- [Bill Pay](https://ramp.com/accounts-payable), [AP agents announcement](https://ramp.com/blog/ramp-ap-agents-announcement), [AP agent memory](https://ramp.com/blog/ap-agent-processes-invoices) — all VERIFIED.
- **Capabilities**
  1. **Coding agent**: "85% of accounting fields right the first time"; OCR "99% accuracy" at line level.
  2. **Fraud agent**: "60-plus fraud signals" using contracts, email history, prior payments and POs; flags "unexpected changes to vendor banking details or unverified accounts"; "$1M+ in fraud" caught (announcement) / "$5M+" (later blog). Cites a mid-market fraud average of $280,000.
  3. **Approval agent**: summarises vendor history and contract terms; "90,000 approval recommendations with a 90% acceptance rate".
  4. **Payment agent** fills card details into vendor portals.
  5. **Memory from corrections**: "studies the differences between the raw invoice scan and the finalized bills that your team approved. It remembers every edit, learns the rule, and applies it next time"; accepts **plain-language instructions scoped to one vendor or all vendors** ("Always pay net 60 from invoice date"); "every field the agent fills includes an explanation". This is the nearest public analogue to our scoped-fact layer.
  6. 2-way and 3-way match, duplicate detection, W-9 collection.
- **Accounting Agent**: "up to 3.5 times more auto-coding than legacy tools, with 90%+ accuracy" — UNVERIFIED ([PR Newswire](https://www.prnewswire.com/news-releases/ramp-launches-accounting-agent-to-automate-bookkeeping-with-real-time-close-302686214.html) snippet).

#### Vic.ai — "first AI-native accounting platform" (AP)
- [vic.ai](https://www.vic.ai/), [AP inbox](https://www.vic.ai/ap-inbox) — VERIFIED. "99% invoice accuracy rate without coding or setup", "85% no-touch rate by month 6", PO matching, auto-approvals, learns from corrections. **Victoria, the AP inbox agent**: "automatically categorizes vendor emails — like payment inquiries, duplicate invoice alerts, and bank updates", drafts "contextual, data-driven email responses" from ERP data, processes invoices from email to payment (Outlook and Gmail).

#### Stampli — P2P with the conversation on the invoice
- [stampli.com](https://www.stampli.com/), [BEC red flags](https://www.stampli.com/resources/vendor-impersonation-bec-red-flags/), [duplicate detection](https://www.stampli.com/resources/duplicate-invoice-detection/) — VERIFIED. "Stampli AI performs on average 89% of the work" across "2,700+ ERP-aligned fields"; invoices coded, matched and routed "with every question and decision attached"; vendor portal where "finance verifies sensitive changes"; surfaces for review when "a vendor's bank account, routing number, SWIFT/country relationship, billing address, or invoice sender stops matching"; **layered duplicate checks "at upload, review, dispatch, release, and export"** with exact and fuzzy matching on vendor, number, amount, date.

#### Tipalti — global payables and supplier onboarding
- [tipalti.com](https://tipalti.com/), [fraud guide](https://tipalti.com/accounts-payable/fraud-detection/) — VERIFIED. Self-service supplier portal; **W-9 / W-8 collection with IRS TIN matching** ("KPMG-approved tax engine"); payments to 200+ countries, 120 currencies; "26,000+ payment rules"; Tipalti Detect tracks "contact details, emails, account numbers, TINs" and finds blocked payees re-registering; AML and sanctions screening; AI agents for capture/coding, PO matching, **ERP sync issue resolution**, NL reports.

#### BILL — SMB AP/AR
- [BILL AI](https://www.bill.com/product/ai) — VERIFIED. **W-9 Agent** "autonomously emails your vendors to collect and enter W-9s — eliminating over 80% of the manual steps"; Invoice Coding Agent (multi-line, −20% manual time); duplicate warning; real-time fraud monitoring; forthcoming "Smart Response Agent" for AP inquiry email.

#### AppZen — enterprise spend audit and autonomous AP
- [appzen.com](https://www.appzen.com/) — VERIFIED. "AI agents that don't just detect. They act."; trained on "$50B+ in enterprise spend"; AP inbox agent that processes invoices, **statements and tax forms** and answers vendor queries; duplicate prevention (customer story "£774K duplicate invoices prevented"); AI Agent Studio (low-code). $180M growth round in 2026 — UNVERIFIED (aggregator snippet).

#### Medius — mid-market/enterprise AP
- [medius.com](https://www.medius.com/) — VERIFIED. "97% auto-match rate on invoice lines"; fraud and risk detection across invoice-to-pay; **Supplier Conversations** "understands supplier emails, pulls the right data, and responds automatically"; **supplier statement reconciliation** to "spot missing or mismatched invoices, avoid late or duplicate payments". Fraud deep link 404'd.

#### Brex — spend platform agents
- [Intelligent finance](https://www.brex.com/platform/intelligent-finance) — VERIFIED. Audit Agent "categorizes potential violations by risk level"; Review Agent "auto-approves low-risk expenses and requests, escalates exceptions, and follows up with anyone out of compliance"; claims "99.7% GL coded". Expense-side, not O2C/AP-invoice depth. AI-native Accounting API (Jan 2026) — UNVERIFIED (snippet).

### 1C. Reconciliation

#### Ledge
- [ledge.co](https://www.ledge.co/), [payment reconciliation](https://www.ledge.co/solutions/payment-reconciliation) — VERIFIED. Reconciles "payouts, refunds, and chargebacks across banks, payment processors, your ERP, and billing systems"; native Stripe, Adyen, PayPal; accounts for "FX variances, timing differences, and platform fees"; shows **"the gross-to-net breakdown — what was collected, what was deducted, and what settled"**; many-to-many rules; Slack alerts; JEs generated from the reconciliation; "glass-box reasoning", "every cell traces to source", "nothing posts without your approval". Has since widened into close management (overlaps the other researcher's slice).

#### Simetrik
- [simetrik.com](https://www.simetrik.com/) — VERIFIED. "2.5B records per day", ">99.9% automatic reconciliation rate", "$500B+ TPV annually"; **"110+ financial control functions: exact, verifiable, and auditable"** alongside the AI; 100+ no-code templates (Visa, Mastercard, central banks); many-to-many; Simetrik Agent and an MCP server. Enterprise payments/fintech scale, not mid-market SaaS.

#### Kosh.ai
- [kosh.ai](https://www.kosh.ai/) — VERIFIED. Payment-gateway, bank and marketplace/OMS reconciliation, no-code rules "to auto figure out payouts"; SMB and accountants; ~12 staff (UNVERIFIED, PitchBook snippet). Claims "100% accuracy" — treat as marketing.

### 1D. Treasury and cash forecasting

#### Kyriba — enterprise TMS; TAI agentic layer
- [kyriba.com](https://www.kyriba.com/), [TAI](https://www.kyriba.com/products/agentic-ai-tai/) — VERIFIED. 10,000 bank connections; FX exposure and hedging; real-time payment fraud stop. TAI: "Query your treasury data in plain language, analyze variances, generate reports"; repeatable "Skills" for daily checks; can execute money-market investments and stablecoin payments via partners. Governance: role-based agent access, "The agent recommends; you decide", "No customer data is used in training public models. Ever."

#### Trovata
- [trovata.io](https://trovata.io/), [Trovata AI](https://trovata.io/trovata-ai/) — VERIFIED. Bank-API cash positioning; agents for "daily cash reporting with variance explanations" and "anomaly detection and escalation"; "Surface drivers behind day-over-day or period-over-period variance"; executive narratives.

#### Nilus
- [nilus.com](https://www.nilus.com/) — VERIFIED. "Applied AI for liquidity"; 13-week forecast that **"self-corrects against variance"**; "99%+ match rate" payment-to-invoice; continuous bank-to-GL rec; sweeping, pooling, intercompany netting; fraud and sanctions screening; maker-checker; "20,000+ bank & PSP connections".

#### Panax
- [panax.com](https://www.panax.com/) (panax.ai is parked) — VERIFIED. Mid-market treasury; AI categorisation; multi-scenario forecasts with alerts; variance analysis and "actionable liquidity recommendations"; FX and debt optimisation; "96% accuracy in cash forecasting".

#### Statement
- [statement.io](https://www.statement.io/) — VERIFIED. "1st AI-native treasury automation platform"; multi-bank positioning; AI enrichment and categorisation; "living, breathing AI cash flow forecasts"; variance explanation and anomaly alerts.

---

## 2. Gap matrix

Y = stated on a page I fetched · P = partial / implied · — = no public evidence on pages fetched · (u) = snippet only. Sources are the profile links above.

| Capability | **Maximor** | HighRadius | Tesorio | Upflow | Billtrust | Versapay | Monto | Ramp | Stampli | Ledge | Kyriba / Trovata | Also |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Remittance capture from email attachments | — | Y | Y | Y | P ("fragmented remittances") | P | — | — | — | — | — | Paraglide (blog), Monk |
| Remittance capture from customer AP portals | — | Y (RPA) | P | Y | P | — | P (status, not remittance, evidenced) | — | — | — | — | |
| Lockbox / check-image remittance | — | Y | Y | — | P | P | — | — | — | — | — | Monk |
| Parent-child / payer-name-differs matching | — | P (hierarchy agent) | Y | — | — | — | — | — | — | — | — | **Fazeshift Y** |
| Short-pay reason coding | — | Y | Y | — | — | Y (payer picks reason) | — | — | — | — | — | |
| Deduction/dispute workflow with backup retrieval | — | Y (POD/BOL, claims) | — | P (dispute intent) | — | P (portal disputes) | — | — | — | — | — | Paraglide P, Kolleno P, Esker P |
| Deduction validity prediction | — | Y | — | — | — | — | — | — | — | — | — | |
| Collections agent that reads replies | P ("routine customer emails handled") | P (inbox labels + assigns) | Y | Y | — | — | — | — | — | — | — | Paraglide Y, Monk Y, Fazeshift Y |
| Promise-to-pay capture and tracking | P (home chip "promised Fri") | Y (u) | Y (with confidence + source) | Y | — | — | — | — | — | — | — | Paraglide Y |
| Payment-date / delinquency prediction | — | Y | Y | P | P | Y | — | — | — | — | — | Chaser, Growfin, Esker |
| Credit risk scoring / limits | — | P | — | — | Y | — | — | — | — | — | — | Kolleno, Chaser, Fazeshift, Esker |
| Customer payment portal | — | P (payment links) | — | Y | Y | Y | — | — | — | — | — | Kolleno, Chaser, Fazeshift |
| Invoice submission + status in customer AP portals | — | Y | Y | — | Y (260+) | — | Y (500+) | — | — | — | — | Paraglide, Monk |
| Configurable autonomy per agent/skill | P (escalate below confidence) | P (automated vs assisted label) | — | Y | — | — | — | — | — | — | P (approvals per action) | Kolleno Y |
| AP inbox agent (vendor email) | P ("routine vendor emails handled") | — | — | — | — | — | — | — | P (conversation on invoice) | — | — | **Vic.ai Y, AppZen Y, Medius Y**, BILL (announced) |
| Vendor bank-change / BEC fraud detection | — | — | — | — | — | — | — | Y (60+ signals) | Y | — | Y (Kyriba payment fraud) | Tipalti Y, Vic P, Nilus P |
| Vendor onboarding / W-9 + TIN | — | — | — | — | — | — | — | Y | Y (portal) | — | — | **Tipalti Y, BILL Y (W-9 agent)** |
| Duplicate-invoice detection (incl. fuzzy numbers) | — | — | — | — | — | — | — | Y | Y (layered, fuzzy) | — | — | BILL, AppZen, Vic |
| PO / 2- and 3-way matching | — | P (dispute prevention) | — | — | — | — | P (pre-submit PO validation) | Y | Y | — | — | Medius 97% lines, Tipalti, Vic |
| Supplier statement reconciliation | — | — | — | — | — | — | — | — | — | — | — | **Medius Y**, AppZen P |
| Learns from corrections, vendor/customer-scoped instructions | P ("encodes your accounting logic") | P | Y ("learns from each correction") | P (custom instructions, u) | — | — | Y (per-customer agent learns PO rules) | **Y (per-vendor plain-language memory)** | P | — | P (Skills) | Vic Y |
| PSP payout reconciliation (Stripe/Adyen gross-to-net) | — (Stripe is a data source; no payout rec evidenced) | — | — | — | — | — | — | — | — | **Y** | — | Simetrik Y, Kosh Y, Nilus P |
| Many-to-many matching rules | P ("auto-matches") | P | Y (cross-invoice) | P | P | P | — | — | — | Y | — | Simetrik Y |
| Cash positioning across banks | **Y** | — | — | P (multi-bank aggregation) | — | — | — | — | — | Y | Y | Nilus, Panax, Statement |
| 13-week / rolling cash forecast | **Y** | — | Y (AR side) | P | — | — | — | — | — | — | Y | Nilus, Panax, Statement, Chaser |
| Forecast / cash variance explanation | P ("explainable hypotheses") | — | P | — | — | — | — | — | — | — | **Y** | Nilus (self-correcting), Panax, Statement |
| FX exposure / hedging | — (FX *translation* in reporting only) | — | — | — | — | — | — | — | — | P (FX variance in rec) | **Y (Kyriba)** | Panax P |
| Payment execution / sweeps / netting | — | — | — | — | Y (network) | Y | — | Y | Y | — | Y | Nilus Y, Tipalti Y |
| MCP server / agent-to-agent surface | — | — | — | Y | — | — | — | — | — | — | — | Simetrik Y |

**Reading the matrix:** Maximor's public AR/AP surface is four sentences on its home page. Everything in the top two-thirds of this table is a documented product elsewhere and undocumented at Maximor. Maximor's strength (positioning, 13-week forecast, cash application as matching) sits in the bottom third.

---

## 3. Ranked top 8: what specialists have that Maximor publicly lacks

Ranking = (pain for a $50M–$500M company) × (fit with our build) × (can we show it in ~10 hours).

### 1. Remittance capture — tie the bank line to the remittance that arrived somewhere else
- **Who:** HighRadius ([blog](https://www.highradius.com/resources/Blog/auto-aggregation-of-remittance-advice-with-ar-automation/)), Tesorio ([page](https://www.tesorio.com/cash-application)), Upflow ([page](https://upflow.io/upflow-intelligence)), Billtrust ([blog](https://www.billtrust.com/resources/blog/what-is-cash-application)).
- **The moment it hurts:** an ACH for $184,310 lands with a 16-character bank memo. It covers fourteen invoices. The remittance PDF went to ar@ two days earlier, or sits in the customer's Coupa account. "Electronic payments often do not come with remittance advice attached — it is often sent separately in an email, phone call, fax or buyer's portal" (Billtrust). Until someone finds it, cash is unapplied, the customer's credit line stays blocked and collections chases invoices that are already paid.
- **Stat:** no independent stat found. Vendor claims only: 95% STP (HighRadius), 95%+ (Tesorio), 98% (Upflow).
- **10-hour difficulty:** LOW–MEDIUM. Email attachment parsing (PDF/XLSX/CSV) against seeded Gmail is straightforward; portal scraping is out of scope — seed one remittance as "portal export".
- **Fit:** HIGH. It is the front half of our cash application and a natural job for the fine-tuned extraction model and its benchmark.

### 2. Short-pay reason coding with evidence retrieval and a validity call
- **Who:** HighRadius ([agentic deductions](https://www.highradius.com/resources/Blog/what-is-agentic-ai-in-deductions-management-and-how-does-it-work/)) — auto-coding, backup retrieval, validity predictor, denial upload. Tesorio classifies deductions. Versapay makes the payer pick a reason ([guide](https://www.versapay.com/resources/short-paid-invoice-how-to-handle)).
- **The moment it hurts:** customer pays $47,500 on a $50,000 invoice, no note. Is it an SLA credit the CSM promised, an unearned 2% discount, a tax exemption, or a test of whether you will write it off? Versapay: without tooling "manual effort would be required to follow up with customers to figure out why a short payment was made". Billtrust lists invalid reasons including "unearned early-pay discounts" and customers hoping suppliers will "write off the shortfall as a loss".
- **Stat:** HighRadius cites Danone recovering $20M in invalid deductions and 30% of analyst time going to backup and coding (vendor figures).
- **10-hour difficulty:** MEDIUM — and it is already our investigator agent.
- **Fit:** VERY HIGH. Incumbent deduction tooling is built for CPG/retail evidence (POD, BOL, trade promotions). For SaaS the evidence is in contracts, CRM notes, Slack and email — exactly what our investigator searches. See white space.

### 3. Collections agent that reads the reply: promise-to-pay with confidence and source, broken-promise follow-up
- **Who:** Tesorio ("Promise to Pay: Mar 15, 2026 · Confidence: 92% · Source: Email reply" — [home](https://www.tesorio.com/)), Upflow ([page](https://upflow.io/upflow-intelligence)), Paraglide ([home](https://www.paraglide.ai/)), HighRadius (P2P, snippet).
- **The moment it hurts:** Paraglide's framing: tools "automate message one. The replies, queries, disputes, and follow-ups that follow all land on the AR team manually." The reply says "approved, going out in Friday's run" — nobody logs it, the forecast doesn't move, and the customer gets another dunning email on Monday.
- **Maximor status:** partial — home page chip shows "reminder sent · promised Fri" but no mechanism is described.
- **10-hour difficulty:** LOW–MEDIUM on live Gmail. Extract date + amount + invoice refs, store as a fact with expiry = promised date, suppress dunning until then, escalate on breach.
- **Fit:** HIGH. A promise-to-pay is literally a scoped, expiring fact — it drops into our fact store unchanged and feeds the forecast.

### 4. Vendor bank-detail-change and impersonation detection
- **Who:** Ramp ([60+ signals](https://ramp.com/blog/ramp-ap-agents-announcement)), Stampli ([BEC page](https://www.stampli.com/resources/vendor-impersonation-bec-red-flags/)), Tipalti ([Detect](https://tipalti.com/accounts-payable/fraud-detection/)), Vic.ai inbox categorises "bank updates" ([page](https://www.vic.ai/ap-inbox)), Kyriba real-time payment fraud.
- **The moment it hurts:** "we switched banks — use the new account effective immediately", from "a sender domain one character off from the real one (rnicrosoft vs microsoft)", with "a reply-to that differs from the display address" (Stampli). AP updates the vendor master; the next legitimate invoice pays the attacker.
- **Stat:** Ramp cites a mid-market fraud average of $280,000 per incident (vendor-cited). AFP "63% of organizations experienced BEC in 2025" — UNVERIFIED (snippet via [abnormal.ai](https://abnormal.ai/learning/vendor-fraud-detection)); check against `research/finance-pain-points.md` before using.
- **10-hour difficulty:** LOW. Mostly deterministic: edit-distance on sender domain vs vendor master, reply-to mismatch, bank change + urgency language, first-seen contact. Route = BLOCK + out-of-band verification.
- **Fit:** HIGH with live Gmail + AP lane. Note PROJECT_STATUS rejected *fraud detection on public payment data as the project*; this is a single control inside AP, which that entry explicitly allows.

### 5. Duplicate-obligation detection that survives re-numbering
- **Who:** Stampli (layered, fuzzy — [page](https://www.stampli.com/resources/duplicate-invoice-detection/)), Ramp ([blog](https://ramp.com/blog/accounts-payable/duplicate-invoices)), BILL, AppZen ("£774K duplicate invoices prevented"), Vic.ai.
- **The moment it hurts:** vendor wasn't paid on time, resends the invoice as INV-1024A; or "the same bill arrives by email and mail"; or "two entities both receive a copy". Ramp describes a 200-person company catching "a $12,000 duplicate wire transfer … during month-end reconciliation".
- **Stat:** "duplicate and erroneous payments in the range of a few tenths of a percent up to ~2% of AP spend" (Stampli, citing recovery-audit studies generally — no specific study named).
- **10-hour difficulty:** already built.
- **Fit:** VERY HIGH — we have it; Maximor does not document it. Cheap pitch point. Medius-style **supplier statement reconciliation** is a natural extension (match the vendor's statement to the ledger to find both missing and duplicated invoices).

### 6. Customer AP-portal agent: submit, track, catch rejections, pull remittances
- **Who:** Monto ([page](https://get.montopay.com/)), Tesorio Supplier Portal Agent, HighRadius (two portal agents), Billtrust (260+ portals), Paraglide, Monk.
- **The moment it hurts:** "You find out an invoice was rejected days or weeks after it happened" and "payments land in the bank but remain unapplied because the remittance details are stuck in a portal" ([Monto](https://montopay.com/how-you-get-paid-has-changed-your-ar-workflow-hasnt/)). For a $60M SaaS company selling to enterprises this is most of its large invoices. Cloudinary ran 41 portals.
- **Stat:** Monto cites Mastercard 2026 research that about a third of payments to large B2B suppliers arrive late (secondary citation; not checked at source).
- **10-hour difficulty:** HIGH for real portals (credentials, MFA). MEDIUM with a mock "Coupa-like" portal page showing a rejected invoice (missing PO).
- **Fit:** MEDIUM. Good realism for the seeded world (a rejection as the *reason* an invoice is unpaid is a great investigator finding) but do not build the portal robot.

### 7. Payment-processor payout reconciliation, gross to net
- **Who:** Ledge ([page](https://www.ledge.co/solutions/payment-reconciliation)), Simetrik, Kosh, Nilus (PSP connections).
- **The moment it hurts:** Stripe deposits $96,412.18. The ledger has 212 charges totalling $100,000. The difference is fees, three refunds, one chargeback and a currency conversion, and it has to be booked to four accounts. Ledge: shows "what was collected, what was deducted, and what settled to your bank account".
- **Maximor status:** Stripe is a named data source and billing integration; no payout-level reconciliation is described.
- **10-hour difficulty:** LOW–MEDIUM. Stripe test-mode balance transactions give the gross/fee/net breakdown per payout; the matching is deterministic, which suits the kernel.
- **Fit:** GOOD for a SaaS fixture, and it is a clean "policy compiled, zero model calls" example (fee booking never needs a model).

### 8. Per-invoice payment-date prediction feeding the forecast, with variance explained
- **Who:** HighRadius (30-day delinquency per invoice), Tesorio AR Forecast, Chaser late-payment predictor, Growfin; variance side: Trovata ([page](https://trovata.io/trovata-ai/)), Kyriba TAI, Nilus ("self-corrects against variance"), Panax, Statement.
- **The moment it hurts:** the 13-week forecast assumed invoice terms; the customer always pays 19 days late; Thursday's cash is $400K short and nobody can say which customers caused it.
- **Maximor status:** partial — 13-week forecast with "explainable hypotheses"; no per-invoice prediction or promise-to-pay linkage described.
- **10-hour difficulty:** MEDIUM. Per-customer median lag + promise-to-pay facts overrides is enough; variance explanation = diff forecast vs actual by customer.
- **Fit:** MEDIUM. Worth doing only as a consumer of #3.

**Not ranked but notable:** W-9 collection agent (BILL, Tipalti — easy, low wow); customer portal with mandatory short-pay reason (Versapay — a product surface, not an agent); credit scoring (Billtrust, Kolleno, Fazeshift — needs bureau data); supplier statement reconciliation (Medius — good AP add-on, see #5).

---

## 4. Realistic scenario bank (for seeding Northwind)

Each scenario is described in the vendor's own content at the URL given.

| # | Scenario | Vendor source | Seeding note |
|---|---|---|---|
| 1 | **One payment, many invoices, remittance sent separately.** Electronic payment arrives with no detail; the remittance comes "in an email, phone call, fax or buyer's portal"; one payment covers multiple invoices with a short pay inside it. | [Billtrust](https://www.billtrust.com/resources/blog/what-is-cash-application), [HighRadius](https://www.highradius.com/resources/Blog/auto-aggregation-of-remittance-advice-with-ar-automation/), [Upflow](https://upflow.io/blog/business-to-business-payments/payment-remittance) | ACH covering 14 invoices; XLSX remittance emailed two days before to a shared inbox; one line short. |
| 2 | **Remittance stuck in the customer's AP portal**; cash sits unapplied. | [Monto](https://montopay.com/how-you-get-paid-has-changed-your-ar-workflow-hasnt/) | Seed a "portal export" file the agent must find. |
| 3 | **Invoice rejected in the portal and nobody noticed** — "a rejection can sit unseen for weeks"; typical causes: missing PO number, W-9 not on file, approval delay. | [Monto](https://montopay.com/how-you-get-paid-has-changed-your-ar-workflow-hasnt/), [Monk](https://www.monk.com/) | Overdue invoice whose real reason is "rejected: PO missing", not non-payment. Dunning it would be wrong. |
| 4 | **Parent pays for subsidiary / payer name differs from the billed entity.** | [Fazeshift](https://www.fazeshift.com/), [Tesorio](https://www.tesorio.com/cash-application) | Already in our build; both vendors name it as a headline hard case. |
| 5 | **Unearned early-pay discount** — customer takes 2% after the discount window closed. Listed as an *invalid* short-pay reason. | [Billtrust](https://www.billtrust.com/resources/blog/short-pays-why-they-happen-and-what-you-can-do-about-them), [HighRadius](https://www.highradius.com/resources/Blog/best-practices-for-reducing-short-pay/) | 2/10 net 30, paid day 24 less 2%. Deterministic validity check from dates. |
| 6 | **Dispute short-pay**: service "not delivered as agreed", delivery delay, the same item billed twice, or a tax-exempt customer charged sales tax. | [Versapay](https://www.versapay.com/resources/short-paid-invoice-how-to-handle), [Billtrust](https://www.billtrust.com/resources/blog/short-pays-why-they-happen-and-what-you-can-do-about-them), [HighRadius](https://www.highradius.com/resources/Blog/best-practices-for-reducing-short-pay/) | SaaS translation: SLA credit promised by the CSM in Slack; tax-exempt certificate sitting in email. |
| 7 | **Strategic short-payer** — underpays hoping the supplier will "write off the shortfall as a loss"; sends partial payments "to keep you confused". | [Billtrust](https://www.billtrust.com/resources/blog/short-pays-why-they-happen-and-what-you-can-do-about-them) | The counter-example for write-off policy: same amount as a wire fee, different customer history — policy must not fire. |
| 8 | **Promise-to-pay in an email reply**, logged with date, confidence and source; later broken. Also: customer asks for time, outreach must pause. | [Tesorio](https://www.tesorio.com/), [Upflow](https://upflow.io/upflow-intelligence), [Fazeshift](https://www.fazeshift.com/) ("pause outreach emails while customers work out payment details") | Stored as an expiring fact; breach triggers escalation. |
| 9 | **Vendor emails new bank details** — "we switched banks — use the new account effective immediately"; look-alike domain, reply-to mismatch, urgency. | [Stampli](https://www.stampli.com/resources/vendor-impersonation-bec-red-flags/), [Ramp](https://ramp.com/blog/ramp-ap-agents-announcement), [Vic.ai](https://www.vic.ai/ap-inbox) | One real change (verified by phone note) and one spoof, so the agent must discriminate. |
| 10 | **Re-numbered duplicate**: INV-1024 resent as INV-1024A; same bill arrives by email and by mail; two entities each receive a copy; "$12,000 duplicate wire" found at month-end. | [Ramp](https://ramp.com/blog/accounts-payable/duplicate-invoices), [Stampli](https://www.stampli.com/resources/duplicate-invoice-detection/) | Already in our build. Add the two-entities variant. |
| 11 | **Processor payout net of fees, refunds and chargebacks**, with FX and timing differences. | [Ledge](https://www.ledge.co/solutions/payment-reconciliation) | One Stripe payout per week in the bank feed. |
| 12 | **Payment terms drift for a vendor** — "used to pay a vendor net 20 but recently switched to paying on receipt"; and its AR mirror, a customer asking for net-60. | [Ramp](https://ramp.com/blog/ap-agent-processes-invoices), [maximor.ai](https://www.maximor.ai/) home chip | A fact that *supersedes* an earlier fact — good test of valid-time handling. |

**Not sourced:** the wire / bank-fee short-pay ($15–$35 lifted by an intermediary bank) did not appear on any vendor page I fetched. It is real practitioner knowledge, but cite it as such, not to a vendor.

---

## 5. White space — what nobody in this slice publicly claims

1. **Ask once, store the answer with scope, expiry and approver limits.** Nearest: Ramp's AP agent keeps plain-language instructions scoped to one vendor or all vendors and learns from edits ([blog](https://ramp.com/blog/ap-agent-processes-invoices)); Monto's per-customer agent "learns their portal, forms, and PO rules"; Tesorio "learns from each correction". None describes expiry, an approver ceiling, supersession, or showing which stored answer fired. None describes the agent *asking an internal account owner* a question at all — their humans are AR/AP analysts working an exception queue.
2. **Compiling repeated human judgment into an approved policy with a backtest, so a re-run uses zero model calls.** No public evidence anywhere in this slice. Vendors report rising auto-rates ("85% no-touch by month 6", Vic.ai) but not a promotion step a controller approves, and not replay cost.
3. **Earned autonomy.** Upflow (suggest → autonomous, per skill) and Kolleno (Insights / Copilot / autonomous) offer a *manual dial*. HighRadius labels agents automated vs assisted by a ≤10% human-touch threshold — measured, but a vendor-level label. Nobody shows autonomy promoted or demoted per entry kind from the customer's own track record.
4. **Investigating internal context for the reason.** Specialists look outward: remittances, portals, POD/BOL, trade-promotion systems. Growfin has Slack/Salesforce collaboration and Upflow's Insights Agent surfaces "root causes of late payment" from connected tools, but nobody describes searching contracts + CRM + Slack + email to explain a specific short-pay and attaching the evidence to the entry.
5. **SaaS-shaped deductions.** Deduction products are built for CPG/retail/distribution. SLA credits, seat true-downs, usage disputes, co-term proration and "CSM promised a credit" have no dedicated tooling. That is Maximor's ICP.
6. **Deterministic re-check of the agent's own work.** Simetrik ("110+ financial control functions: exact, verifiable, and auditable") and Ledge ("every cell traces to source") are nearest, both on the reconciliation side. In O2C and AP, no vendor describes an independent kernel re-verifying each proposed entry against its workpaper.
7. **A published, reproducible benchmark.** Every rate in this document (95%+, 98%, 99%+, >99.9%, "100%") is self-reported with no test set. A small open-weight extraction model with its own benchmark and an honest-numbers rule is unclaimed ground.
8. **One entity-resolution and obligation model across AR and AP.** Parent-pays-for-subsidiary (AR) and re-numbered duplicate invoices (AP) are the same problem — "is this the same obligation / the same counterparty?" — and every vendor here sits on one side only.

---

## 6. Dead ends and caveats

- HighRadius product pages (cash application, deductions, collections, backup capture) timed out on every attempt; HighRadius claims come from its blog and platform pages (VERIFIED) plus snippets (marked).
- 404s: Esker AR deep link, Tesorio /collections, Upflow /cash-application, Growfin /cash-application, Versapay /products/cash-application, Billtrust /platform/collections, Medius fraud page, Brex /product/ai, Kyriba /products/agentic-ai/, Ramp /blog/ramp-agents. monto.com is an unrelated Dutch consultancy (Monto is at montopay.com); monto.ai has an expired certificate; panax.ai is parked (Panax is at panax.com).
- Funding figures for Monk, Fazeshift, Paraglide, AppZen and the Ramp Accounting Agent numbers are snippet-level — UNVERIFIED.
- Fetches are summarised by a small model. Re-open any quote in a browser before it goes on a slide.
