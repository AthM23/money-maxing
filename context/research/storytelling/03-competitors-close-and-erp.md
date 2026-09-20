# 03 — Competitors: close, accounting layer, AI-native ERP

Researched 2026-09-19. Slice: accounting-layer / close / AI-native-ERP competitors of Maximor. Order-to-cash, AR/AP and
treasury specialists (HighRadius, Tesorio, Vic.ai …) are covered by a separate researcher and skipped here.

**Baseline for "what Maximor has":** [`../maximor-company-intel.md`](../maximor-company-intel.md) §2, §6, §7, plus two
fresh fetches of [maximor.ai/automated-close](https://www.maximor.ai/automated-close) and
[maximor.ai/why](https://www.maximor.ai/why) on 09-19 that checked for specific feature words (results in §2 below).

**Evidence key**

- **VERIFIED** — I fetched the vendor's own page or press release and the claim was in the returned text. Caveat: WebFetch
  summarises through a small model, so a VERIFIED quote means "the fetch returned this phrase," not that I read raw HTML.
- **UNVERIFIED** — came from a search snippet, an aggregator, or a secondary article. Treat as a lead, not a fact.
- **No public evidence** — I looked and did not find it. It does not mean the vendor lacks it.

**One correction to the baseline doc:** `maximor-company-intel.md` §6 describes **Basis** as an "AI-native ERP
replacement." That is wrong per Basis's own site: Basis sells agents to *accounting firms* (CAS, tax, audit) and recently
added corporate accounting; it does not replace the GL. ([getbasis.ai](https://www.getbasis.ai/)) The press article it
cited lumped Basis with Campfire.

---

## 1. Per-competitor profiles

### 1.1 Numeric — AI close management, expanding to cash
- **Positioning:** "AI-Powered Close Automation"; aims to be "the connected platform for finance operations" by 2027. VERIFIED ([numeric.io](https://www.numeric.io/), [Series B post](https://www.numeric.io/blog/numeric-raises-51m-series-b))
- **Funding/scale:** $51M Series B led by IVP, Nov 19 2025; $89M total. Customers named: OpenAI, Brex, Plaid, Wealthfront, Asana. VERIFIED (Series B post); $89M total is UNVERIFIED ([PR Newswire](https://www.prnewswire.com/news-releases/numeric-raises-51m-series-b-expanding-from-close-management-to-comprehensive-finance-platform-302619774.html) snippet).
- **Distinctive capabilities**
  - **Flux Analysis:** "In a single click, AI combs through every transaction in your GL as well as external sources to surface core drivers of variance"; shows prior-period explanations and trendlines; user can "Simply edit and then approve." DailyPay: "80%" of flux first drafts written by AI. VERIFIED ([flux page](https://www.numeric.io/product/flux-analysis), home)
  - **Transaction Monitors:** "Catch data issues before your close." VERIFIED (home; product sub-page 404'd so rule-authoring detail is unknown)
  - **Cash Matching:** "Automate 90%+ of your bank recs" with an "AI rule builder"; JE automation drafts and posts to NetSuite. VERIFIED (home, Series B post)
  - **Close Checklist** orchestration; **Reporting** "with AI". VERIFIED
  - **Numeric MCP** named on the homepage. VERIFIED that it exists; detail (custom agents, Claude Skills library) is UNVERIFIED ([aggregator](https://aiagentsquare.com/agents/numeric-ai)).
- **Human review / audit trail:** AI outputs route through "preparer / reviewer / second-reviewer" sign-off; "timestamped activity log"; periods can be configured so they "cannot close with open review notes." Their blog spells out what an AI audit trail must hold: inputs with source refs, "the exact instruction given and the model used," output and uncertainty flags, reviewer actions, "tamper-evident time stamps, with edits versioned rather than overwritten." VERIFIED ([AI audit trail blog](https://www.numeric.io/blog/ai-audit-trail)) — note this is a blog stating requirements; it does not say the product stores prompts and model versions.
- **Memory / learning:** shows prior-period explanations as context. No learning-from-corrections claim found.
- **Accuracy claims:** "90+% cash matching rate." No method published.
- **Auditor-facing:** read-only auditor licenses "so they can log in and see a full record." UNVERIFIED (search snippet from [numeric.io/product/close](https://www.numeric.io/product/close)).
- **Slack:** notifications for comments, "when a task is ready for review, and a daily summary"; "Preview a task directly within Slack." No in-Slack approval. VERIFIED ([Slack integration page](https://www.numeric.io/integrations/slack))

### 1.2 FloQast — close workflow incumbent, now "Auditable AI" agents + compliance
- **Positioning:** accounting workflow platform; agents let accountants move "from preparers to strategic reviewers." VERIFIED ([Mar 2025 PR](https://www.floqast.com/press-releases/floqast-launches-auditable-ai-agents-to-bridge-the-talent-gap-and-elevate-accountants-from-preparers-to-strategic-reviewers))
- **Distinctive capabilities**
  - **AI Agent Builder (Sept 2025):** accountants "create and manage their own custom AI Agents using natural language, with no coding required," with "human-in-the-loop review." VERIFIED ([PR](https://www.floqast.com/press-releases/floqast-unveils-ai-agent-builder-and-expanded-ai-capabilities-to-redefine-the-future-of-accounting))
  - **FloQast Transform (announced Sept 16 2026 — three days ago):** "Hand FloQast files from a close your team has already finished, and Transform builds an AI agent that runs that process for you: documented, tested against numbers your team already approved, and ready to show your auditor." VERIFIED ([GlobeNewswire](https://www.globenewswire.com/news-release/2026/09/16/3363412/0/en/floqast-introduces-new-ai-accounting-innovations-at-takecontrol-2026-and-names-coso-chair-lucia-wind-as-svp-of-risk-audit-advisory.html)). **This is the closest public thing to our "compile judgment into a policy and backtest it."**
  - **COSO GenAI Module (Sept 2026):** "wrap their AI agents in COSO-compliant governance — risk assessment, control environment and activities, and ongoing monitoring and assurance." Hired former COSO chair Lucia Wind. VERIFIED (same PR)
  - **AI Assistant for JE review (Sept 2026):** "flags errors and anomalies, scores audit risk, explains its reasoning, and recommends a fix. The human makes every call." VERIFIED (same PR)
  - **FloQast Detect / AI Detections:** "learns normal patterns on a per-subsidiary, per-account basis, and flags anomalies before the books close"; rules can be "custom or AI-suggested." VERIFIED (both PRs)
  - **AI Testing / Operational Audits:** "reads and adds annotations to supporting documentation and provides a first pass on pass/fail conclusions for internal audits"; "AI drafts the audit plan. AI executes your testing. One click generates an executive-ready report." VERIFIED (both PRs)
  - Pre-built agents: PO accruals (Coupa), benefits reconciliation, expense allocation, credit-card JE creation, vacation accruals. VERIFIED ([ai-agents page](https://www.floqast.com/ai-agents))
- **Human review / audit trail:** every agent needs human sign-off; agent activity visible live and logged. Sign-off/log detail is UNVERIFIED ([Accounting Today](https://www.accountingtoday.com/news/floqast-launches-ai-agent-builder) snippet); the PRs themselves only say "auditable AI at its core."
- **Governance credential:** ISO 42001 certified. VERIFIED (Mar 2025 PR)
- **Auditor-facing:** controlled/temporary auditor access, read-only links, PBC request streamlining, "20% to 35% reduction in billable audit hours spent fulfilling PBC requests." UNVERIFIED (search snippets from floqast.com blog pages).
- **Accuracy claims:** none found. **Slack:** no public evidence in fetched pages.

### 1.3 BlackLine — enterprise reconciliation/controls incumbent; Verity AI
- **Positioning:** "Agentic Financial Operations" — "the essential control layer" for AI in the Office of the CFO (Apr 2026). VERIFIED via reprint ([CPA Practice Advisor](https://www.cpapracticeadvisor.com/2026/04/15/blackline-unveils-agentic-financial-operations-to-close-ais-governance-and-trust-gap/181729/)); BlackLine's own page truncated on fetch.
- **Distinctive capabilities**
  - **Vera**, "AI team lead" who "directs and coordinates a team of specialized agents" and is "the single point of contact." VERIFIED ([Sept 2025 PR](https://www.prnewswire.com/news-releases/blackline-launches-verity-trusted-ai-purpose-built-for-the-office-of-the-cfo-302549201.html))
  - **Verity Prepare:** "Automates end-to-end reconciliation with full traceability, reducing creation time by over 90%." **Verity Match:** "80-90% match rates." **Verity Collect and Remit:** "voice and digital agents that automate collections." VERIFIED (CPA Practice Advisor reprint)
  - **Verity Accruals:** "close 3 days faster … manual work by up to 80%." UNVERIFIED (search snippet)
  - **"Glass box" architecture**; Studio360 orchestration; "Auditable System of Record." VERIFIED (reprint)
- **Human review / audit:** "every action is traceable, auditable, and aligned to financial controls"; CFOs can "independently validate AI outputs." No mechanism detail published.
- **Memory / learning:** "proprietary 'ground truth' accumulated from learning from billions of transactions" — cross-customer, not per-customer corrections.
- **Accuracy / auditor / Slack:** match-rate claims only; no method; no public evidence of an auditor portal in fetched material (BlackLine historically has auditor roles — not checked here).

### 1.4 Trintech (Cadency / Adra) — close incumbent
- **Positioning:** "finance-native" agentic AI embedded in R2R (Apr 9 2026). UNVERIFIED date ([news page](https://www.trintech.com/news/trintech-advances-financial-close-with-agentic-ai-built-for-finance/) via snippet)
- **Named agents:** Variance Analysis Agent ("identifies material changes, explains likely drivers"), Flux Agent, Exception Management Agent ("Detects, classifies, and prioritizes exceptions across transaction matching"), Accruals Agent ("roll forward estimates faster, apply consistent calculation methodologies"), Data Access Agent. VERIFIED ([agentic-ai page](https://www.trintech.com/agentic-ai/))
- **Human review / audit:** "Human-in-the-loop control by design"; "Documented calculation methodology, supporting evidence, reviewer signoffs." VERIFIED
- **Learning:** "Continuous improvement from real finance activity" — no mechanism. VERIFIED phrase.
- **Accuracy / confidence / Slack / auditor:** no public evidence.

### 1.5 Rillet — AI-native ERP (GL replacement)
- **Positioning:** "The AI-native ERP"; "Zero-Day Close starts here." VERIFIED ([rillet.com](https://www.rillet.com/))
- **Funding/scale:** $70M Series B (a16z, ICONIQ) Aug 2025; $100M Series C at $1B valuation Aug 2026; 600+ customers; EY alliance Apr 2026. Secondary sources, fetched ([Yahoo](https://finance.yahoo.com/technology/ai/articles/rillet-raised-100m-put-ai-184646510.html), [TechCrunch](https://techcrunch.com/2026/08/21/how-ai-accounting-startup-rillet-raised-100m-and-became-a-unicorn-in-48-hours/) snippet).
- **Distinctive capabilities**
  - **Aura Assistant / Agents / Continuous AI / MCP.** Agents: "Write the rules in plain English." Continuous AI: "watches for anomalies, flags exceptions, and proposes accruals." VERIFIED ([Aura page](https://www.rillet.com/product/aura-ai), home)
  - **Aura Audit Trail:** records "every step Aura takes and every dataset it touches, captured at the moment of execution"; each source has a live link and a "snapshot download [that] gives you the dataset as it existed at the moment of execution, as a file you can drop straight into your workpapers"; "Everything Aura creates links back to the conversation or workflow that created it." VERIFIED ([blog](https://www.rillet.com/blog/aura-audit-trail-every-ai-answer-fully-supported))
  - **Aura MCP Connectors:** reads Gmail/Outlook (e.g. PDF attachments → bills, accrual requests), Slack, Notion, HubSpot (closed-won deals → commission accruals). Writes are gated: "Aura will never take an action in a connected external system without your explicit approval." "Every tool call is captured in an exportable audit log, showing who ran it, what was sent, and what came back." Aura "inherits exactly the permissions that user already has." VERIFIED ([blog](https://www.rillet.com/blog/mcp-connector))
  - ASC 606 "directly from your contracts"; multi-entity consolidation. VERIFIED (home)
- **Human review:** "Every action is reviewable. Audit trail by default. Approve and edit every step." VERIFIED
- **Memory:** "remembers how you work, so it answers, acts, and reconciles the way your team would." VERIFIED phrase; no scope, expiry or approver mechanics described.
- **Accuracy claims:** none. **Auditor-facing:** "audit-ready" hand-off files; no auditor login evidenced.

### 1.6 Campfire — AI-native ERP; own accounting model
- **Positioning:** AI-native ERP; press nickname "Slack for accounting" ([CFO Brew](https://www.cfobrew.com/stories/2025/12/18/slack-for-accounting-wants-to-go-public), UNVERIFIED — not fetched).
- **Funding:** $65M Series B (Accel, Ribbit) Oct 2025, 12 weeks after a $35M A; $100M+ total. UNVERIFIED ([fintech.global](https://fintech.global/2025/10/16/campfire-secures-65m-series-b-to-transform-finance-ai/) snippet)
- **Distinctive capabilities**
  - **LAM / "Accounting Intelligence":** "the first proprietary foundation model trained on millions of real accounting transactions"; "over 95% task accuracy"; "learns directly from your ledger as it grows." No base model, eval method or benchmark published. VERIFIED ([LAM blog](https://campfire.ai/blog/introducing-LAM-the-first-erp-native-ai-model-built-for-accounting), [Ember page](https://campfire.ai/ember))
  - **Ember Agents (Mar 2026):** AP, AR, matching & categorization, "Transaction and Accounting Policy Monitoring," accruals, flux. Continuous agents watch for "duplicate invoices and miscoded accounts." VERIFIED ([blog](https://campfire.ai/blog/introducing-ember-agents))
  - **Slack approvals:** "Connect any agent to a Slack channel or email digest"; Slack notifications carry "View Details, Approve, and Reject buttons." VERIFIED (Ember page)
  - **User-set confidence thresholds:** "Built-in AI confidence thresholds let you set exactly what gets auto-applied and what comes to you for review. Move the threshold as your comfort grows." VERIFIED (Ember page)
  - **MCP store:** "the first ERP to ship an MCP store"; built-in Ramp, HubSpot, Stripe, Salesforce; "Any hosted MCP server works"; e.g. post accruals from approved POs. VERIFIED ([blog](https://campfire.ai/blog/campfire-is-the-first-erp-with-an-mcp-store))
- **Human review / audit:** "Every agent action is logged, sourced to the underlying GL data, and reviewable before it posts." Ember "never posts a journal entry or signs off on a task" — UNVERIFIED wording (search snippet).
- **Memory:** "Categorize millions of transactions monthly. Learned automatically." No correction-scoping mechanics.
- **Auditor-facing:** no public evidence.

### 1.7 Basis — agents for accounting firms
- **Positioning:** agents that run CAS close, tax returns, audit testing for firms; corporate accounting added. VERIFIED ([getbasis.ai](https://www.getbasis.ai/))
- **Funding:** $100M Series B at $1.15B, led by Accel with GV, Feb 2026; ~30% of Top-25 US firms. UNVERIFIED ([BusinessWire](https://www.businesswire.com/news/home/20260224020999/en/Basis-Raises-$100M-at-a-$1.15B-Valuation-as-Accounting-Firms-Adopt-End-to-End-Agents-Across-Accounting-Tax-and-Audit) snippet)
- **Capabilities:** "Runs the month-end close for every client, end to end, no matter how messy the data"; tax: "from client intake to review-ready workpapers"; audit: "Executes testing and cites sufficient evidence behind every conclusion"; technical accounting memos; debugging reconciliations. VERIFIED (home, [Series B post](https://www.getbasis.ai/blogs/basis-raises-100m-series-b-led-by-accel-and-google-ventures))
- **Review / memory:** humans review deliverables; agents "learn specific client requirements" — UNVERIFIED (secondary snippet). No mechanics on site.
- **Accuracy:** no numbers; "abilities improve monthly." Efficiency gains 20–50% (UNVERIFIED snippet).

### 1.8 Maxima AI — agent-prepared, accountant-reviewed enterprise close
- **Positioning:** "Evidence first automation"; agent-prepared, "review-ready & audit-ready." VERIFIED ([maxima.ai](https://www.maxima.ai/))
- **Funding/scale:** $41M seed + A (Redpoint, Kleiner Perkins, Audacious), Nov 2025; "$400B+" volume per site. Funding UNVERIFIED ([BusinessWire](https://www.businesswire.com/news/home/20251118400802/en/Maxima-Raises-$41-Million-in-Seed-and-Series-A-to-Transform-Accounting-Through-Agentic-Human-AI-Collaboration) snippet). Customers: Scale AI, Zendesk, Rippling, Roofstock. VERIFIED
- **Capabilities:** cash coding, payroll entries, balance-sheet recs, card matching, prepaids, **lease accounting**, commission accruals, fixed assets; flux and anomalies. **"Max"** single agent (June 23 2026): "delegate prep work across multiple use cases directly to Max, just like a teammate." VERIFIED (home; [CFO Dive](https://www.cfodive.com/news/maxima-rolls-out-ai-agent-enterprise-accounting/823567/))
- **Audit trail:** every output includes "lineage, inputs, and approvals within your controls," giving auditors "a re-performable audit trail"; "Deterministic logic, continuous validations, and transaction-level lineage." VERIFIED (home)
- **Accuracy:** "over 98% automation" (Scale AI); "100.00% accuracy" over $255B — UNVERIFIED ([Yahoo PR](https://finance.yahoo.com/news/maxima-agentic-ai-accounting-platform-140000913.html) snippet) and no method given.
- **Memory / Slack / auditor login:** no public evidence.

### 1.9 Truewind — AI digital accountant for SMB/firms
- $13M Series A (Rho, Thomson Reuters Ventures), Jan 2025; $17M+ total. UNVERIFIED ([CPA Practice Advisor](https://www.cpapracticeadvisor.com/2025/01/08/truewind-accounting-ai-platform-raises-13-million-in-series-a-funding/154157/) snippet)
- "Truewind applies your rules to every transaction and builds prepaid and fixed asset schedules automatically"; reconciles third-party data; "compares posted entries against historical patterns and flags anything unusual"; turns "bank statements and workpapers into GL-ready journal entries, reconciliations, and SOPs you can review." Review: "only review the exceptions." QBO / Intacct. VERIFIED ([truewind.ai](https://www.truewind.ai/))
- Notable: it **generates SOPs** as an output. No memory, Slack, auditor or accuracy evidence.

### 1.10 Stacks — agentic close for multi-entity (London/Amsterdam)
- $23M Series A led by Lightspeed, Feb 2026; 30+ enterprise customers. UNVERIFIED ([fintech.global](https://fintech.global/2026/02/20/stacks-raises-23m-series-a-to-scale-agentic-ai/) snippet)
- Agents "continuously match transactions, post journals and prepare workpapers"; draft "audit-ready commentary"; accruals "prepared against your policies." Controls: "Every entry, exception, and override is logged"; "Segregation of duties is enforced throughout the close"; "Role-based approvals"; ERP access is read-only with scheduled syncs. Claim: "76% of reconciliations auto-matched." VERIFIED ([stacks.ai](https://www.stacks.ai/))
- No memory, Slack or auditor evidence.

### 1.11 Nominal — agentic close + consolidation/intercompany layer
- $20M Series A (Next47, Workday Ventures); $30M total. UNVERIFIED ([nominal.so press](https://nominal.so/press/nominal-raise-announcement/) snippet)
- Flux, bank-rec, transaction-matching and **Trigger Agents** ("Monitor your financial data in real time"); **intercompany** matching, balance resolution, settlement; consolidation with FX; "unified, bi-directional data ledger"; "approval workflows at every step"; "full audit-trail for every action"; "0 ERP changes required." VERIFIED ([nominal.so](https://www.nominal.so/))
- "Agentic Performance Management" launch: "APM is not automation. It's autonomy." A category label — the release gives no dashboard, metric, autonomy-level or correction mechanics. VERIFIED ([PR Newswire](https://www.prnewswire.com/news-releases/nominal-introduces-agentic-performance-management--the-cursor-moment-for-accounting-302777722.html))

### 1.12 Ledge — close agents that compile to deterministic code
- Funding ~$9M — UNVERIFIED ([StartupHub](https://www.startuphub.ai/startups/ledge)). SOC 2, **ISO 42001**. Customers: Lemonade, Intercom, Tala. VERIFIED ([ledge.co](https://www.ledge.co/))
- **How it works:** "Upload your working paper — or just describe your workflow"; the agent "generates the underlying code for the workflow, then re-uses that code safely and predictably every period"; "Every Accounting Agent runs bespoke, deterministic code"; "Every cell traces to source"; "Nothing posts without your approval." VERIFIED (home; [agents article](https://www.ledge.co/content/ai-accounting-agents))
- **Learning:** "Every override, correction, or reviewer comment becomes part of how the agent behaves going forward." VERIFIED. No scope, expiry, approver, or backtest described.
- **This is the closest competitor to our "compiled policy, zero model calls on re-run" idea.** They do not publish a backtest or a zero-model-call claim.

### 1.13 Light — AI-native ERP with Slack-first approvals
- $30M Series A led by Balderton (Sept 2025); $43M total. UNVERIFIED ([fintech.global](https://fintech.global/2025/09/25/ai-finance-platform-light-raises-30m-series-a/) snippet)
- Named agents: Bill Agent ("Reads every incoming invoice, codes it to the right account and entity, and routes it for approval"), Reconciliation, Consolidation ("Eliminates intercompany … as transactions post"), Collections, **Approval Policy Agent** (checks entries against rules before posting), Close Agent. "pings the Controller or CFO in Slack or Teams the moment their approval is needed." "Every action is logged to the agent that took it." VERIFIED ([light.inc](https://light.inc/))

### 1.14 Trullion — lease, revenue, and an auditor-side suite
- $34M raised — UNVERIFIED ([snippet](https://agenticaiccounting.com/company/trullion)).
- Lease accounting (ASC 842 / IFRS 16), revenue recognition, **Audit Suite** (document matching, data extraction, financial-statement validation, substantive testing). **Trulli** agent: "source-linked outputs," "audit ready citations," extracts lease/contract clauses, cross-checks terms across documents; sold to both auditors and preparers. VERIFIED ([trullion.com](https://trullion.com/), [Trulli page](https://trullion.com/products/ai-agent-trulli/))

### 1.15 Puzzle — AI-native GL for startups
- $66.5M total — UNVERIFIED ([Tracxn](https://tracxn.com/d/companies/puzzle/__S4yCZBnPr-mpGqg7hbrU72aQdTnrSDtmsEqXuDcw_v8)). **Sept 2 2026:** Accrual is acquiring Puzzle's accounting-firm business; Puzzle continues for startups. VERIFIED ([press release on Yahoo](https://finance.yahoo.com/technology/ai/articles/accrual-acquire-puzzle-expanding-ai-140000780.html))
- "Up to 98% automated, no rules to write"; "Governed Automation"; workflows "Described once, done automatically, reviewed by you before anything's final"; accrual automation for prepaids and fixed assets. VERIFIED ([puzzle.io](https://puzzle.io/)). "AI Close" as a plain-language agent builder inside the GL — UNVERIFIED (snippet).

### 1.16 DualEntry — AI-native ERP; publishes a model benchmark
- $90M Series A (Lightspeed, Khosla, GV), Oct 2025. UNVERIFIED ([PR Newswire](https://www.prnewswire.com/news-releases/dualentry-raises-a-90-million-series-a-from-lightspeed-venture-partners-khosla-ventures-and-gv-google-ventures-302573366.html) snippet); "$90M" appears on the homepage (VERIFIED).
- "Go live in 24 hours" migration; anomaly detection, categorization, "AI-driven, always-on auditing," approval workflows. VERIFIED ([dualentry.com](https://www.dualentry.com/)). Flux commentary, intercompany allocations/eliminations — UNVERIFIED (PR snippet).
- **Accounting AI Benchmark (DualEntry Labs):** ~100 questions in eight categories (classification, JE creation, AP, AR, bank rec, reporting, month-end close, knowledge); "deterministic and binary" grading; 19+ foundation models. It benchmarks **third-party models, not DualEntry's own product**, and no dataset download is offered. The blog post says 101 questions and a top score of 66.0% ("No model exceeded 70%"); the live leaderboard says 97 questions and Grok 4.5 at 84.2% — the page has been updated since the post. VERIFIED ([blog](https://www.dualentry.com/blog/ai-still-fails-one-third-of-real-accounting-tasks), [leaderboard](https://www.dualentry.com/accounting-ai-benchmark))

### 1.17 Tabs — contract-to-cash
- $55M Series B led by Lightspeed, Sept 2025; $91M+ total; 200+ customers incl. Cursor, Statsig. UNVERIFIED on totals ([BusinessWire](https://www.businesswire.com/news/home/20250915745370/en/Tabs-Raises-$55M-Series-B-Led-by-Lightspeed-to-Bring-AI-Agents-to-the-CFOs-Office) snippet).
- **Billing Agent** "ingests contracts once signed, automatically extracts billing terms and generates invoices, and syncs with your ERP"; **Collections Agent** "tracks due dates, matches payments, handles follow-ups, and reconciles automatically"; ASC 606 rev rec. "Every action comes with a rationale. If the agent sent the invoice or booked the revenue, you know why and can trace it back." VERIFIED ([tabs.com](https://www.tabs.com/), [Series B post](https://www.tabs.com/blog/tabs-raises-55M-series-b-to-launch-the-first-ai-agents-for-billing-and-collections))
- No short-pay reasoning, Slack, approval-flow or accuracy detail in fetched material.

### 1.18 Zuora (Revenue / Zuora AI)
- Apr 16 2026 agents and skills: contract-modification analysis ("fully explain the revenue impact before anything touches the ledger"); allocation "side-by-side comparison of current allocation, proposed allocation, dollar and percentage impact"; **audit response generation** ("pull together the insight needed to respond to auditors"); collections prioritisation; NL query. "operates within an organization's existing controls, permissions, and audit frameworks"; **ISO/IEC 42001**. VERIFIED ([press release](https://www.zuora.com/press-release/zuora-ai/))
- Note: Zuora's CEO Tien Tzuo is a Maximor angel (baseline doc §1).

### 1.19 Leapfin — revenue subledger / data transformation
- Normalises payment/billing data into accounting records; "See every linked event & update"; events log and completeness checks; **Luca** AI agent for NL investigation; "400 billion journal entries annually." VERIFIED ([leapfin.com](https://www.leapfin.com/)). No review, memory, Slack or auditor evidence.

### 1.20 Auditoria.AI — inbox-native AP/AR agents (edge of this slice)
- $38M Series B; $60M total. UNVERIFIED ([Auditoria PR](https://www.auditoria.ai/pr-auditoria-ai-raises-38m-in-series-b-funding-to-usher-agentic-ai-era-for-enterprise-finance-teams/) snippet)
- AP Helpdesk (vendor email replies), AP Invoices, **AP Accruals**, AP Vendor Watch, AP Statement Reconciliation; AR Helpdesk, AR Collections, AR Remittances (payment application); SmartResearch answers "traced to the transaction." "80% faster invoice processing," "50% fewer errors." VERIFIED ([auditoria.ai](https://www.auditoria.ai/)). Mostly the other researcher's territory.

### 1.21 2026 entrants found
- **Accrual** — "the intelligence layer for the modern accounting firm"; launched Feb 2026 with $75M led by General Catalyst; keeps work tied to "source support, calculations, open questions, and reviewer decisions"; acquiring Puzzle's firm business (Sept 2 2026). VERIFIED ([press release](https://finance.yahoo.com/technology/ai/articles/accrual-acquire-puzzle-expanding-ai-140000780.html))
- **Pilot "AI Accountant"** (Feb 2026) — "fully autonomous" bookkeeper for SMBs; escalates when "a judgment call … could have a real material impact." UNVERIFIED ([Accounting Today](https://www.accountingtoday.com/news/pilot-launches-fully-autonomous-ai-bookkeeper) snippet)
- **Digits — Autonomous General Ledger + Accounting Agents** — own study: 97.8% categorization accuracy vs 79.1% for 12 outsourced accountants over 2,000 transactions; routes low-confidence items to humans. UNVERIFIED ([Insightful Accountant](https://blog.insightfulaccountant.com/digits-launches-ai-agents-for-its-autonomous-general-ledger) snippet). SMB, self-run study.
- **Penrose Labs — AccountingBench** — third-party benchmark on a year of a real SaaS company's books; reported models "forcing entries past validation checks to make books appear balanced" over long horizons. UNVERIFIED ([snippet via apideck](https://www.apideck.com/blog/ai-in-accounting)). Useful citation for why a deterministic kernel matters.
- **CrossCountry "Auto Accrual AI"** — messages PO owners in Microsoft Teams with a predicted accrual, PO detail and "confidence indicators," one-click approve or adjust. UNVERIFIED ([CrossCountry blog](https://www.crosscountry-consulting.com/insights/blog/autoaccrualai-automating-the-coupa-to-erp-accrual-process/) snippet). A consulting-firm accelerator, not a platform.

---

## 2. Gap matrix

**Y** = public evidence it ships · **P** = partial / adjacent / claimed without mechanism · **—** = no public evidence found.
Columns are the vendors with the most distinctive evidence; the "Others" column names anyone else. Sources are the URLs in
§1 for that vendor unless given. Maximor column comes from the baseline doc plus the two 09-19 fetches.

| # | Capability | Maximor | Numeric | FloQast | BlackLine | Trintech | Rillet | Campfire | Ledge | Maxima | Light | Nominal | Others |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Flux narrative drafting | **Y** ("drafted narratives") | Y | Y | P | Y | Y | Y | Y | Y | — | Y | Stacks Y, DualEntry P |
| 2 | **External-auditor access / PBC handling** | **—** | Y (read-only licenses, unverified) | Y (auditor access + PBC, unverified) | — | — | P (exportable snapshots) | — | — | P ("re-performable" trail) | — | — | Zuora Y (audit-response drafting); Trullion Y (auditor-side suite); Basis Y (audit testing for firms) |
| 3 | **Slack-native approve / reject** | **—** (Slack is a read source only) | P (notify + preview, no approve) | — | — | — | P (Aura can message Slack; approvals in-app) | **Y** (Approve/Reject buttons) | — | — | **Y** (pings CFO in Slack/Teams) | — | CrossCountry P (Teams) |
| 4 | **Natural-language rule / agent authoring by accountants** | **—** | P (AI rule builder) | **Y** (Agent Builder) | — | — | **Y** ("Write the rules in plain English") | P (plain-language commands) | **Y** (describe workflow → code) | — | P (humans set policy) | — | Puzzle Y (unverified) |
| 5 | **Build an agent from a finished close and test it against approved numbers** | **—** | — | **Y** (Transform, Sept 2026) | — | — | — | — | P (from working paper; no backtest claim) | — | — | — | — |
| 6 | Learning from corrections | P ("Self-improving agents," no mechanism) | — | — | P (cross-customer "ground truth") | P | P ("remembers how you work") | P ("Learned automatically") | **Y** (overrides become behaviour) | — | — | — | Basis P |
| 7 | Scoped / expiring / approver-limited memory | — | — | — | — | — | — | — | — | — | — | — | **nobody** |
| 8 | Transaction-level explanation with source citation | Y (computation trail) | Y | Y | Y | Y | Y | Y | Y | Y | P | P | Trullion Y, Tabs Y, Leapfin Y |
| 9 | Anomaly / transaction monitors | P ("always-on error monitoring") | **Y** (Monitors) | **Y** (Detect, per-subsidiary baselines) | P | P | Y | Y (policy monitoring) | — | Y | P | Y (Trigger Agents) | Truewind Y, DualEntry Y |
| 10 | **Pre-posting JE review with an audit-risk score + suggested fix** | **—** | — | **Y** (AI Assistant, Sept 2026) | — | P | — | — | — | — | P (Approval Policy Agent) | — | — |
| 11 | Contract → billing → revenue | Y (rev rec); billing P | — | — | — | — | Y | Y | P | — | P | — | Tabs **Y**, Zuora **Y** |
| 12 | What-if revenue impact before ledger | — | — | — | — | — | — | — | — | — | — | — | Zuora **Y** |
| 13 | Lease accounting | **—** | — | — | — | — | — | — | — | Y | — | — | Trullion **Y** |
| 14 | **SOX / control testing automation** | **—** | — | **Y** (AI Testing, Operational Audits) | P (controls heritage) | — | — | — | — | — | — | — | Trullion Y, Basis Y |
| 15 | AI-governance wrapper (COSO / ISO 42001) | — | — | **Y** (both) | P | — | — | — | Y (ISO 42001) | — | — | — | Zuora Y (ISO 42001) |
| 16 | Intercompany | Y (elimination) | — | P | Y | — | Y | Y | Y (allocations) | — | Y | **Y** (match, resolve, settle) | DualEntry P |
| 17 | Close checklist orchestration | P (close dashboard) | Y | Y | Y | Y | Y | Y | Y | P | Y | Y | Stacks Y |
| 18 | Accrual automation | P (listed, no detail) | — | Y (PO/Coupa, vacation) | Y (unverified) | Y | Y (proposes from history; Gmail requests) | Y (proposes groups w/ reasoning) | Y | Y (commissions) | — | — | Auditoria Y; CrossCountry P (Teams survey) |
| 19 | Accrual confirmation by asking PO owners in chat | — | — | — | — | — | — | — | — | — | — | — | CrossCountry P (Teams, unverified) |
| 20 | Vendor-invoice coding | Y | — | — | — | — | Y | Y | — | — | Y | — | Auditoria Y, Truewind Y |
| 21 | **Public benchmark / eval transparency** | **—** ("99%+" with no method) | — | — | — | — | — | P (">95%" no method) | — | P ("100.00%," no method) | — | — | DualEntry **Y** (models only); Digits P (self-run); Penrose Y (third party) |
| 22 | **Own / fine-tuned accounting model** | **—** | — | — | P | — | — | **Y** (LAM) | — | — | — | — | Digits Y |
| 23 | **User-adjustable confidence threshold / autonomy dial** | P (threshold exists; not shown as user-set) | — | — | — | — | — | **Y** ("Move the threshold as your comfort grows") | — | — | — | — | Digits P |
| 24 | Evidence-based autonomy promotion (measured accuracy → auto) | — | — | — | — | — | — | — | — | — | — | — | **nobody** |
| 25 | Undo / reversibility | Y ("logged, reviewable and reversible") | P (versioned) | — | — | — | P | — | P (re-run) | — | — | — | — |
| 26 | **MCP / open agent interface** | **—** | Y | — | — | — | **Y** | **Y** (MCP store) | — | — | — | — | — |
| 27 | Agent tool-call log with frozen dataset snapshots | P | P | P | P | P | **Y** | P | P | P | P | P | — |
| 28 | Evidence integrity check (hash / quote re-verification) | — | P (blog advocates tamper-evident stamps) | — | — | — | P (frozen snapshot) | — | — | — | — | — | **nobody ships a verifier** |
| 29 | Generates SOPs / process docs from the work | — | — | P (Transform "documented") | — | — | — | — | P | — | — | — | Truewind Y |

---

## 3. Top 8 features competitors have that Maximor lacks (publicly)

Ranked by (CFO value × evidence strength × fit with what we have already built).

### 1. External-auditor access and PBC / audit-response handling
- **Who:** FloQast (auditor access, PBC streamlining — unverified snippets); Numeric (read-only auditor licenses — unverified); Zuora ("pull together the insight needed to respond to auditors" — [verified](https://www.zuora.com/press-release/zuora-ai/)); Trullion Audit Suite ([verified](https://trullion.com/)); Basis audit agents ([verified](https://www.getbasis.ai/)).
- **Maximor:** evidence packs are an internal output; no auditor login or PBC workflow (baseline §7; both 09-19 fetches "not mentioned").
- **Why a mid-market CFO cares:** audit fees and the two weeks of PBC chasing are a line item they feel; FloQast markets a 20–35% cut in audit hours on PBC.
- **10-hour prototype:** medium. Read-only auditor view over the audit pack plus a "PBC request in → cited answer out" agent.
- **Fit:** **strong.** We already have the audit pack, risk-weighted sampling, re-performance, and the auditor fenced off from preparer memory. This is a front door on work that exists.

### 2. Slack-native approve / reject
- **Who:** Campfire ("View Details, Approve, and Reject buttons" — [verified](https://campfire.ai/ember)); Light ("pings the Controller or CFO in Slack or Teams" — [verified](https://light.inc/)); Numeric notify + preview only ([verified](https://www.numeric.io/integrations/slack)).
- **Maximor:** Slack named only as a context source.
- **Why:** approvers are not in the finance tool; latency of approval is the close's critical path.
- **Prototype:** easy — we have live Slack.
- **Fit:** **strong, and we go further:** ours stores the answer as a scoped, expiring, approver-limited fact so it is asked once. Campfire and Light approve one item at a time.

### 3. Build an agent from a finished close and test it against already-approved numbers
- **Who:** FloQast Transform, announced Sept 16 2026 ([verified](https://www.globenewswire.com/news-release/2026/09/16/3363412/0/en/floqast-introduces-new-ai-accounting-innovations-at-takecontrol-2026-and-names-coso-chair-lucia-wind-as-svp-of-risk-audit-advisory.html)); Ledge generates deterministic code from a working paper ([verified](https://www.ledge.co/content/ai-accounting-agents)).
- **Maximor:** "learns your close" with no user-visible compile-and-backtest step.
- **Why:** it answers "how do I know it does what my team did?" with the team's own prior numbers.
- **Prototype:** done in our build (compile + backtest; run 2 with zero model calls).
- **Fit:** **strong — but this is no longer white space.** Pitch the delta: we compile from *individual human judgments as they arrive*, not from a finished close file, and we publish the backtest per policy.

### 4. User-visible autonomy dial / confidence threshold
- **Who:** Campfire ("Move the threshold as your comfort grows" — [verified](https://campfire.ai/ember)); Digits routes by confidence (unverified).
- **Maximor:** escalates "when confidence is below threshold" but no evidence the customer sets or sees it.
- **Why:** Maximor's own survey says only 14% of CFOs fully trust AI; a dial is how trust gets extended in steps.
- **Prototype:** done (shadow → review → auto at 95% on n≥5 per entry kind).
- **Fit:** **strong, and better:** Campfire's dial moves on the user's *comfort*; ours moves on *measured accuracy per entry kind*. Nobody in this slice claims evidence-based promotion (matrix row 24).

### 5. Pre-posting JE review with an audit-risk score and a recommended fix
- **Who:** FloQast AI Assistant ("flags errors and anomalies, scores audit risk, explains its reasoning, and recommends a fix" — verified, same PR as #3); Light's Approval Policy Agent ([verified](https://light.inc/)); Trintech partial.
- **Maximor:** no separate reviewer agent evidenced.
- **Why:** it is the reviewer's job, done before the reviewer's time is spent; maps to a SOX JE-review control.
- **Prototype:** easy-medium — the controller agent exists; add a risk score and a suggested correction to its output.
- **Fit:** **strong.** Our controller runs on a *different model* from the preparer, which no one here claims.

### 6. SOX / control testing automation
- **Who:** FloQast AI Testing and Operational Audits ("first pass on pass/fail conclusions"; "AI executes your testing" — verified); Trullion Audit Suite (verified); Basis audit (verified).
- **Maximor:** "SOX control testing: not mentioned" on both fetched pages.
- **Why:** companies approaching IPO or with PE owners (Maximor's roll-up customer) pay for this today; "audit findings 7→0" is already Maximor's headline.
- **Prototype:** done — six control tests in the audit pack.
- **Fit:** **strong.** Show tests run by an agent that cannot read preparer memory.

### 7. Natural-language rule / agent authoring by the accountant
- **Who:** FloQast Agent Builder (verified); Rillet "Write the rules in plain English" ([verified](https://www.rillet.com/product/aura-ai)); Ledge (verified); Numeric AI rule builder (verified); Puzzle AI Close (unverified).
- **Maximor:** positions the opposite way — "encodes your accounting logic" without a documentation project; no authoring surface shown.
- **Why:** controllers want to change a rule without a vendor ticket.
- **Prototype:** medium — NL → policy draft → backtest → approve, reusing the policy compiler.
- **Fit:** **moderate.** Our story is that policies come from judgment already exercised, not from rule-writing. Offer it as an edit path on a compiled policy, not as the main door.

### 8. Published benchmark / eval transparency, and an own model
- **Who:** DualEntry Accounting AI Benchmark ([verified](https://www.dualentry.com/accounting-ai-benchmark)) — foundation models only, not its own product, no dataset download; Campfire LAM ">95% task accuracy" with no method ([verified](https://campfire.ai/blog/introducing-LAM-the-first-erp-native-ai-model-built-for-accounting)); Digits self-run study (unverified); Penrose AccountingBench, third party (unverified).
- **Maximor:** "99%+ accuracy across all accounts" and "98% of cash transactions" with no method, dataset or model disclosure.
- **Why:** an audit committee asks "how do you know?" A number without a method is marketing.
- **Prototype:** done (NorthwindBench with anti-gaming splits; fine-tuned open-weight extractor).
- **Fit:** **strong.** No vendor in this slice publishes a reproducible eval *of its own agent*. Use honest numbers only.

**Also-rans (real gaps, weaker fit or lower CFO pull):** MCP / open agent interface (Campfire, Rillet, Numeric); AI-governance
wrapper — COSO GenAI module, ISO 42001 (FloQast, Ledge, Zuora); lease accounting (Trullion, Maxima); what-if revenue
impact before the ledger (Zuora); frozen dataset snapshots on every agent step (Rillet); SOP generation (Truewind);
accrual confirmation by messaging PO owners (CrossCountry, Teams, unverified).

---

## 4. What nobody does — white space in this slice

Each line is "no public evidence across the ~25 vendors above," not proof of absence.

1. **Scoped, expiring, approver-limited memory.** Everyone's learning claim is unscoped: Ledge ("Every override, correction, or reviewer comment becomes part of how the agent behaves going forward"), Rillet ("remembers how you work"), Campfire ("Learned automatically"), Trintech ("Continuous improvement"), Maximor ("Self-improving agents"). None says *who* may teach the agent, *what* the lesson applies to, or *when it lapses*. This is the cleanest white space.
2. **Ask once, store the answer as a fact, never ask again.** Slack approvals exist (Campfire, Light) but are per item. No one markets a human answer becoming a reusable, bounded fact.
3. **A deterministic kernel that re-verifies evidence** — reject if the quoted evidence differs by a character. Nearest: Rillet's frozen snapshots, Maxima's "re-performable audit trail," Ledge's "every cell traces to source," and Numeric's blog arguing for tamper-evident stamps. Nobody ships a verifier that *refuses the entry*. Penrose's finding that models force entries past validation is the citation for why this matters.
4. **Autonomy earned from measured accuracy, per entry kind.** Campfire has a manual slider; Digits routes on confidence. No one promotes shadow → review → auto on a stated accuracy and sample-size rule.
5. **Zero model calls on re-run, stated and shown.** Ledge's deterministic code and FloQast Transform are close (so do not claim the *idea* is unique). No one states a zero-model-call re-run or shows a per-policy backtest.
6. **Auditor agent fenced off from preparer memory; reviewer on a different model.** Everyone says "auditable"; no one claims independence between the preparer's and the checker's context or model.
7. **An investigator that finds the *reason*** for a short-pay or exception across Gmail, Slack, contract and CRM. Rillet's MCP connectors pull Gmail/Slack context on request, Tabs and Auditoria apply cash, but none markets reason-finding for short-pays. (The O2C researcher should confirm against HighRadius-style deduction tools.)
8. **A reproducible public eval of the vendor's own agent.** DualEntry benchmarks other people's models; Digits and Campfire publish numbers without a reusable dataset.
9. **Decision traces as a queryable object** — the Foundation Capital thesis Maximor is cited for. Rillet's audit trail is nearest (request → datasets → steps → output, bidirectionally linked), but it logs tool calls, not "which policy applied, what exception, who approved, what precedent."

**Not white space (do not claim):** duplicate-invoice detection (Campfire), three-way-match-style bill coding and
routing (Light, Auditoria), flux narratives (nearly everyone), confidence thresholds as such (Campfire), generating
agents from prior work (FloQast Transform, Ledge), Slack approvals as such (Campfire, Light).

---

## 5. Dead ends and caveats

- blackline.com pages returned 500 or truncated; BlackLine claims rest on the PR Newswire release and a CPA Practice Advisor reprint.
- numeric.io/product/monitors 404'd; ledge.co/product/accounting-agents 404'd.
- FloQast and Numeric auditor-access claims are from search snippets of their own pages, not fetched pages — verify before putting on a slide.
- All funding figures marked UNVERIFIED came from search snippets of press releases.
- WebFetch summarises pages with a small model; quoted phrases should be re-checked on the live page before they go on a slide.
