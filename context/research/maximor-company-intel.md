# Maximor Intel — HackMIT 2026 Prep

Researched 2026-09-19 for the "Agentic Systems for the Office of the CFO" ($7k) track. Goal: know what Maximor already ships so we build something that impresses their founders/engineers instead of re-shipping their product.

Confidence key: every claim has a source link. Where I could not verify something independently I say **"unverified"** or **"no public evidence"** explicitly rather than guessing.

---

## 1. What Maximor Is

**Domain confirmed:** [maximor.ai](https://www.maximor.ai/) (not a typo/lookalike — this is the real site).

**One-paragraph description (their words):** Maximor calls itself "the autonomous finance platform." Tagline: *"Finance that runs itself, so you can run ahead."* It's a network of AI agents ("Audit-Ready Agents™") that plug into a company's existing ERP and finance stack (NetSuite, SAP, Oracle, Sage Intacct, QuickBooks, etc.) and autonomously run revenue, cash, close, AP/AR, and reporting workflows — producing audit trails and evidence by default rather than being bolted on afterward. Explicit non-goal: they are **not** trying to be a new ERP or system of record — "the ERP remains the ledger," Maximor is where "the reconciliation logic lives." ([maximor.ai](https://www.maximor.ai/), [Foundation Capital context-graph essay](https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity))

**Founded:** Summer 2024, per [TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/). Note: [Crunchbase](https://www.crunchbase.com/person/ramnandan-krishnamurthy) lists Ram as "CEO of Maximor AI since 2023" — a minor conflict with TechCrunch's reporting; TechCrunch is the more detailed, directly-reported source so I'd weight it higher, but flagging the discrepancy.

**Founders:**
- **Ramnandan "Ram" Krishnamurthy** — CEO & co-founder. IIT Madras graduate (top of class per [Foundation Capital](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor)). At Microsoft 2016–2023: drove Azure OpenAI customer adoption, led incubation for India's digital public infrastructure work, contributed to Azure Synapse Link. ([TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/), [The Org](https://theorg.com/org/maximor-ai/org-chart/ramnandan-krishnamurthy))
- **Ajay Krishna Amudan** — CTO & co-founder. IIT Madras, ACM-ICPC world finalist. At Microsoft 2016–2023 as **Founding Architect**: rebuilt Microsoft's internal finance platform (scaled to handle $200B+ in annual revenue), and separately was Founding Architect for Azure's Public/Private DNS (10M+ queries/sec serving plane, 100k+ queries/sec control plane). ([Foundation Capital](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor), [ZoomInfo](https://www.zoominfo.com/p/Ajay-Amudan/3867221924))
- The two worked together for ~14 years going back to IIT Madras. ([TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/))

**HQ:** New York City, with an office in Bengaluru; 18-person team roughly split US/India at launch (Sept 2025). ([TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/)) — **Conflicting signal:** [fintech.global](https://fintech.global/2025/09/30/maximor-raises-9m-to-expand-ai-finance-automation/) describes them as "San Francisco-based." TechCrunch's account is more detailed/directly reported; treat NYC+Bengaluru as the reliable answer.

**Headcount:** 18 at Sept 2025 launch ([TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/)); LinkedIn job posts still show band "11-50" as of the backend engineer listing. Current headcount not disclosed anywhere I found.

**Funding:** $9M seed, announced Sept 29-30, 2025, **led by Foundation Capital**, with Gaia Ventures and Boldcap participating. Angels: Aravind Srinivas (Perplexity CEO), Tien Tzuo (Zuora CEO), plus finance leaders from Ramp, Gusto, Opendoor, MongoDB, and Big Four firms. ([fintech.global](https://fintech.global/2025/09/30/maximor-raises-9m-to-expand-ai-finance-automation/), [Maximor's own funding post](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace))

**Foundation Capital confirmed — YES, and it's a strong tie, not just a check.** Foundation Capital led the seed round ([Foundation Capital's own investment post](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor)), and their viral "context graph" essay explicitly cites Maximor as the worked example for finance: *"Maximor is doing this in finance: automating cash, close management, and core accounting workflows without ripping out the GL. The ERP remains the ledger, but Maximor becomes the source of truth where the reconciliation logic lives."* ([Foundation Capital, "AI's Trillion-Dollar Opportunity: Context Graphs"](https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity)) — **this is almost certainly the exact essay the track doc is citing.** Its thesis: agents need "decision traces" (what context was used, which policy applied, what exception was granted, who approved it, what precedent shaped it) — not just rules — and over time those traces form a queryable "context graph" that's more valuable than the underlying system of record.

**Growth since seed:** Announced Aug 2026 — revenue grew **35x in the 9 months** since the seed round, now multi-million-dollar ARR, **25+ customers**, hundreds of legal entities, thousands of bank accounts, millions of daily transactions processed, 98% of transactions running end-to-end without human intervention. ([Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance), [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html))

---

## 2. Product — every named feature/module

Overarching architecture: **"Audit-Ready Agent™"** — each agent "owns specific finance workflows end-to-end," runs with **human-in-loop validation built in by default**, and when confidence is below threshold or an anomaly is detected, "the Agent escalates to your team with full context — what it found, why it flagged it, and what it recommends. Nothing posts without the right approval in place." Actions are logged, reviewable, and reversible. ([maximor.ai/why](https://www.maximor.ai/why), [automated-close](https://www.maximor.ai/automated-close))

| Module | What it does | Human review model | Systems integrated |
|---|---|---|---|
| **Revenue Automation** ([page](https://www.maximor.ai/revenue-automation)) | ASC 606 pipeline: parses contracts → defines performance obligations (point-in-time vs. over-period) → allocates transaction price via SSP → triggers recognition events → posts revenue monthly with deferred balance roll-forward. Explicitly a **"99/1" model**: "99% runs without a person reading contracts, building schedules, drafting entries." | Non-standard contract terms halt processing (not assumed); only material judgment calls route to a reviewer matched to deal type; reasoning + source docs stay attached for audit. | Contracts/CRM: Salesforce, HubSpot, DocuSign, Ironclad, Google Drive, Box, SharePoint. Billing/usage: Stripe, Chargebee, Zone Billing, Metronome, Snowflake. Ledger: NetSuite, SAP, Oracle, Sage Intacct, QuickBooks, **Campfire** (yes, a competitor's ERP), Excel. |
| **Cash Automation** ([page](https://www.maximor.ai/cash-automation)) | Auto-matches AR/AP invoices, bills, and payments daily; unifies bank/card/ERP balances into one liquidity view; rolling 13-week cash forecast with "explainable hypotheses"; automated card-spend categorization tied to GL. | Same escalate-on-low-confidence/anomaly pattern. | NetSuite, SAP, Intacct, direct bank feeds, credit cards. |
| **Close Automation** ("Automated Close," [page](https://www.maximor.ai/automated-close)) | Eliminates manual reconciliation prep across every GL account; JE templates auto-created and auto-posted with audit trails; first-pass variance/flux analysis with anomaly flags and drafted narratives; real-time close dashboard tracking AI + human work, validations, evidence packs. Explicitly supports companies running **multiple ERPs at once** via a "Unified Finance Context" layer. | Same pattern — escalation with full context, nothing posts without approval. | "Layers on top of whatever you run — NetSuite, SAP, Intacct, or others." |
| **AR/AP Automation** | Invoicing and collections; bills captured, coded, and scheduled; routine vendor/customer emails handled; terms enforced with exceptions surfaced. (Thinner public documentation than revenue/cash/close — see Gaps.) | Exceptions "brought to you." | Implied ERP/bank integrations, not separately itemized. |
| **Board-Ready Reporting** ([page](https://www.maximor.ai/board-ready-reporting)) | Multi-entity consolidation ("roll up subsidiaries across ERPs in minutes, not weeks"); automatic intercompany elimination; automatic FX translation; automated commentary. | Human-in-loop validation, same escalation model. | NetSuite, SAP, Intacct + cross-ERP consolidation layer. |
| **Instant Answers / Search** ([page](https://www.maximor.ai/instant-answers-and-search)) | Plain-language Q&A over finance/ops data ("99%+ validated accuracy") with a "transparent computation trail" back to source data for audit defensibility, via a "cross-system data model"/semantic layer. | Escalates low-confidence answers; source-cited by default. | ERP, CRM, billing systems generally (no exhaustive list given). |

**Context ingestion is broader than the named modules suggest:** site copy states Maximor "encodes your accounting logic, not generic rules," learning company policy directly "from systems and files already in use" (no documentation project required), and explicitly lists **Excel, Gmail, Chase, Stripe, and Slack** as connected sources, replacing "16+ tools and a spreadsheet for the truth" with one shared context. ([maximor.ai/why](https://www.maximor.ai/why)) This is closer to the "context scattered across email/Slack/people" thesis than any single feature page admits — it's folded into the platform layer, not marketed as its own product (see Gaps, #5).

**Implementation:** most customers reportedly hit first ROI within 4–8 weeks, "zero downtime" during implementation (per aggregated search result, not independently verified against a single primary source — treat as **weakly sourced**).

---

## 3. Customers

| Customer | Industry | Result / quote | Source |
|---|---|---|---|
| **Rently** | Proptech (rental housing software) | CFO **Dustin Neal**: close cut from 11→3 days, $350K annual savings (maximor.ai); TechCrunch separately reports 8→4 days and "avoided two additional accounting hires" — **numbers conflict slightly across sources**, possibly different measurement points | [maximor.ai](https://www.maximor.ai/), [TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/) |
| **Invst** | Wealth management | CFO/COO **Dipen Mehta**: 4-day close, audit-ready schedules, $250K savings, automated reconciliation/reporting, advisor-level profitability insights | [maximor.ai](https://www.maximor.ai/) |
| **Dura Software** | Multi-entity software holding company | CFO **Sloan Session**: *"You're buying back your team's judgment"*; separately, *"[Maximor] takes responsibility for the whole workflow, not just the task."* | [maximor.ai](https://www.maximor.ai/), [LinkedIn](https://www.linkedin.com/posts/maximor-ai_the-best-ai-rollouts-in-finance-dont-happen-activity-7482792301430292480-Swa1) |
| **Kiteworks** | Secure content/comms (cybersecurity-adjacent) | Case study titled "How Kiteworks Automates 98% of Cash Transactions with Maximor" — listed on maximor.ai; I could **not** retrieve the case study's body text directly (the kiteworks.com URL I found is Kiteworks' own unrelated internal-finance case study, not about Maximor) | Case-study title only confirmed via [search snippet](https://www.maximor.ai/) |
| HiBid, QMCO (NASDAQ-listed) | — | Named in one AI-summarized page fetch as customers/logos on the site — **weakly sourced, could not independently re-verify**; flagging rather than asserting | unverified |
| "Global cybersecurity company" (unnamed) | Cybersecurity | Cash-recon team reduced 20→5 people in <4 weeks | [Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance) — possibly Kiteworks given industry overlap, but not stated together, so treat as a separate/unconfirmed link |
| "PE-backed roll-up" (unnamed) | Private equity, 30+ subsidiaries | Audit findings dropped 7→0 in 6 months; ~70% spend reduction | [Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance) |

**Scale:** 25+ customers total as of Aug 2026. ([Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance))

**Stated ideal customer — confirms the booth rep's claim exactly:** TechCrunch reports Maximor targets **"companies with at least $50 million in revenue"** and "enterprises with global operations," supporting both GAAP and IFRS. Maximor's own [CFO Benchmark page](https://www.maximor.ai/cfo-benchmark) frames its research/ICP as **"$50M–$500M ARR organizations."** ([TechCrunch](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/), [maximor.ai/cfo-benchmark](https://www.maximor.ai/cfo-benchmark))

**Maximor's own 100-CFO survey** (CFO Benchmark): 96% say freeing strategic time is AI's primary benefit; only **14%** fully trust AI to independently deliver accurate accounting data; 97% call human oversight critical. Quoted CFO: *"Most tools either wanted full control with zero transparency, or they created more work."* This is Maximor's own evidence for why human-in-loop is core to their pitch, not an afterthought. ([maximor.ai/cfo-benchmark](https://www.maximor.ai/cfo-benchmark))

---

## 4. Positioning & Thesis — direct quotes

- *"Finance that runs itself, so you can run ahead."* — site tagline ([maximor.ai](https://www.maximor.ai/))
- *"Finance doesn't need another ERP. It needs an AI-powered teammate."* — founders ([maximor.ai blog](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace))
- *"We're basically building up an agentic platform that can work with the existing systems that a company has."* — Ramnandan Krishnamurthy ([CFO Dive](https://www.cfodive.com/news/startup-raises-9m-rescue-finance-teams-buried-reconciliations-agentic-ai/761444/))
- *"I do think department-specific agents will emerge. For Finance & Accounting, we're building Maximor to be the leader."* — Ramnandan Krishnamurthy on X ([x.com/skramd](https://x.com/skramd/status/1903960151805034504))
- *"Finance teams are not short of software. They are short of systems willing to take responsibility for the work."* — Ramnandan Krishnamurthy ([Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance))
- *"The ERP records what happened, Maximor learns why it happened, executes what comes next."* — Ramnandan Krishnamurthy ([Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance))
- On **context scattered across tools**: replaces "16+ tools and a spreadsheet for the truth" with one shared context; learns policy "from systems and files already in use" including Excel, Gmail, Chase, Stripe, Slack. ([maximor.ai/why](https://www.maximor.ai/why))
- On **continuous close**: close runs continuously instead of taking "8 to 11 days," freeing ~40% of team time for pricing, M&A analysis, and growth strategy. ([maximor.ai/why](https://www.maximor.ai/why))
- On **auditability**: "every entry, reconciliation and workpaper" carries built-in evidence; produces "deterministic, explainable audit trails that auditors can review." ([maximor.ai/why](https://www.maximor.ai/why))
- On **finance becoming strategic**: Dura Software's CFO — *"You're buying back your team's judgment."* Framed everywhere as: agents absorb the reconciliation grind, humans keep the judgment calls.
- Investor framing (Foundation Capital) on the founders: they *"spoke about CFOs and finance teams with the earned understanding of insiders,"* and the problem is that finance teams' *"teams are trapped in a mess of manual processes and outdated tools"* — Maximor *"doesn't demand that teams rip out their existing stack; it simply does the work behind the scenes."* ([Foundation Capital investment post](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor))
- Long-term vision per the 35x-growth announcement: moving from task automation to being "the intelligence layer of the company" — better forecasting, benchmarking, and capital-access decisions once the underlying data is trustworthy. ([Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html))

---

## 5. Engineering Signals

- **Founding Backend Engineer** listing (via Taro): NYC, hybrid/in-person, $150K–$300K + 0.3–1% equity, reports **directly to the CTO** (Ajay). Explicitly frames the hard problems as "reasoning agents, fragmented data, and workflow orchestration" plus meeting audit-compliance requirements. Mentions NetSuite/QuickBooks/Sage Intacct as integration targets. No specific languages/frameworks disclosed. Company-size band shown: 11–50 employees. ([jointaro.com](https://www.jointaro.com/jobs/maximor-ai/founding-backend-engineer-e1f0de89/))
- **Accounting Consultant (Founding Team)** listing, NYC: 7–10+ years in public accounting/technical advisory/solutions consulting, working directly on accounting logic and NetSuite integration requirements. Signal: they deliberately pair engineers with embedded accounting domain experts rather than treating this as a pure ML/software problem. ([ZipRecruiter](https://www.ziprecruiter.com/c/Maximor-AI/Job/Accounting-Consultant-(Founding-Team)-New-York/-in-New-York,NY?jid=bbce37a6c10811a4))
- **No public GitHub org, engineering blog, or model/agent-framework disclosure found for Maximor itself.** Searches for "Maximor github" surface an unrelated, similarly-named company ("Maxim AI," an LLM eval/observability platform) plus hackathon participants' personal repos named after "Syndicate by Maximor." I found **no public statement of which LLM(s), agent harness, or memory layer Maximor runs on** — mark this "no public evidence," not "they don't use one."
- **Agent Orchestrator (AO) / orchestrator.inc:** a *separate* product/company — "the operating plane for your agentic workspace," coordinates fleets of coding agents (Claude Code, Codex, 25+ harnesses), free and open-source (Apache 2.0), ~90+ contributors, some living together in a house in Bangalore. ([orchestrator.inc](https://orchestrator.inc/), [x.com/aoagents](https://x.com/aoagents))
- **"Syndicate by Maximor" (Sept 5–6, 2026, hosted by AO):** 30-hour hackathon, 309 participants, online + optional in-person seats in SF/NYC/Bangalore. Two tracks: **(1) Automated Agent Engineering** — build a system that designs/tests/evaluates/improves other specialized agents, with measurable gains in accuracy/reliability/cost/speed; **(2) Autonomous Office of the CFO** — build an agent that automates a real accounting/finance/treasury workflow end-to-end, with exception handling and human review (examples given: reconciliation, invoice processing, financial closing). Prizes: $1,000/$500 cash per track, plus Dodo Payments credits and AI Grants India GPU/voice credits (~$10K total prize value). **AO usage was mandatory and worth 25% of the judging score** — "every strong Syndicate submission is really a demonstration of how well you understand AO's execution model, dressed up as a product." ([syndicate-by-maximor.devpost.com](https://syndicate-by-maximor.devpost.com/))
- **Why AO was required — unverified.** Despite multiple targeted searches (founder names, "founded by," investor overlap with Foundation Capital, Bangalore-house team bios), I found **no evidence** of shared founders or a shared investor between Maximor and Agent Orchestrator. The public framing reads as a straightforward hosting/sponsorship partnership — AO supplied the hackathon platform/infra and Maximor (plus Dodo Payments, AI Grants India) co-sponsored prizes and supplied Track 2's problem statement — not an ownership or founder tie. I'm flagging this as genuinely unresolved rather than guessing at a connection.
- Interesting side note: a hackathon submission repo description (possibly a Track 1 project, not Maximor's own product) described a "worker / coach / referee / playbook" self-improving agent loop — **this is a participant's build, not Maximor's internal architecture**; don't confuse the two.

---

## 6. Competitors

Maximor's own materials **do not publish a direct "us vs. X" comparison page**. What's verifiable:

- **Basis** (raised $100M at a $1.15B valuation, Feb 2026) and **Campfire** ($65M raised) are both described in coverage as **AI-native ERP replacements** — i.e., they replace the general ledger itself. Coverage explicitly contrasts this against Maximor's "layer on top, don't rip out the GL" approach. ([Sovereign Magazine](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance))
- Notably, **Campfire is also listed as one of the ERPs Maximor writes revenue back to** on Maximor's own revenue-automation page — so Maximor treats Campfire simultaneously as an integration target and (per press framing) a rival philosophy. ([maximor.ai/revenue-automation](https://www.maximor.ai/revenue-automation))
- Third-party/aggregator content (not Maximor's own claims — treat with more skepticism, some sources are competitor blogs) groups Maximor alongside **Numeric** (AI-native close visibility/anomaly detection), **FloQast** (close workflow/coordination), **BlackLine** (reconciliation/controls at enterprise scale), **Maxima AI** ("agent-prepared accounting execution" — note, Maxima's own blog is one of the sources doing this comparison, so it's self-interested), **Rillet** (SaaS-focused accounting), **Simetrik** (reconciliation/controls). No Trullion, Ledge, Light, Truewind, or Stacks comparisons surfaced despite searching. ([aggregated via search](https://tryxlr8.ai/blogs/best-ai-tools-finance-month-end-close-automation))
- Maximor's consistent, repeated self-differentiation (from their own pages, not press) is two-pronged: **(a)** ERP-agnostic / no rip-and-replace, vs. ERP-replacement players (Campfire, Basis, arguably Rillet); **(b)** full workflow ownership + audit-ready-by-default, vs. point tools that do task-level automation or dashboarding only (implicitly FloQast/Numeric-style "visibility" tools, though never named directly).

---

## 7. Gaps — finance functions/capabilities NOT publicly evidenced

| Area | Status | Notes |
|---|---|---|
| **Payroll processing** | No public evidence | ADP appears only as an integration/data source, never as a Maximor-run workflow. A Gusto exec is an angel investor — that's a funding relationship, not a product integration confirmed on-site. |
| **Treasury (FX hedging, debt/covenant tracking, investment-portfolio management)** | No public evidence | Cash Automation covers liquidity/13-week forecasting and "borrowing and runway decisions" as *inputs* to treasury decisions, but no named module for hedging, debt instruments, or investment management. |
| **Equity management (cap table, 409A, stock comp accounting)** | No public evidence | Not mentioned anywhere across site, press, or job postings. |
| **Collections / dispute management as a deep, named module** | Thin, not absent | AR/AP automation mentions "routine vendor and customer emails" and "enforces terms," but there's no dunning-ladder, credit-risk-scoring, or dispute-workflow detail comparable to the depth given to Revenue/Cash/Close. Room to go deeper here. |
| **Cash application** | Not a gap — covered | Explicitly automated ("auto-applies AR/AP the day it lands"). |
| **Contract-to-revenue** | Not a gap — covered | This is exactly what Revenue Automation does (ASC 606 pipeline). |
| **Unstructured context capture from email/Slack** | Claimed, but not a discrete/marketed feature | Gmail and Slack are explicitly named as connected sources for policy-learning, but there's no standalone "inbox agent" or "Slack agent" product page — it's folded into the general "Unified Finance Context" framing. **This is a real opening**: a hackathon team could build a sharper, more visible, more real-time context-capture layer (e.g., turning a Slack approval thread or an email exception-handling chain into a structured, queryable decision-trace on the spot) rather than Maximor's background-ingestion approach. |
| **Cross-function agent hand-offs (finance agent autonomously acting *inside* CRM/legal/ops tools, not just reading from them)** | No public evidence | All described integrations are read-from-and-post-back-to-ledger; I found no example of a Maximor agent triggering an action inside Salesforce, DocuSign, or an ops tool. |
| **FP&A-style long-range forecasting (revenue/headcount/scenario planning beyond 13-week cash)** | No public evidence | Only cash forecasting (13-week) is named; nothing resembling Mosaic/Pigment/Abacum-style multi-year scenario modeling. |
| **External-auditor-facing collaboration portal** | No public evidence | "Audit-ready" evidence packs are emphasized as an internal output, but no named feature for auditors to log in and interact directly. Possible differentiator: build the auditor-side of the workflow. |
| **Sub-$50M / SMB tier** | Explicitly out of scope by design | ICP is stated as $50M–$500M+ ARR — not a gap so much as a deliberately excluded segment. |

---

## 8. Who's likely at HackMIT / judging

- Maximor is a confirmed HackMIT 2026 sponsor with a track matching the "Agentic Systems for the Office of the CFO" brief: challenging hackers to explore *"how much finance work an agentic system can run, from reconciling cash and closing the books to forecasting and answering auditors."* ([search-confirmed via HackMIT-adjacent listings](https://dayof.hackmit.org/)) — I could **not** independently verify the exact **$7,000** prize figure through public pages; HackMIT's own sponsor page (sponsor.hackmit.org) returned server errors (502) on both fetch attempts. Treat the $7k figure as coming from the team's own track doc, not confirmed by me against a live public page.
- **Talk:** *"From Distinguished Architect to Founder: Building AI Agents for the World's Least Forgiving Data,"* Friday Sept 18 (day before the hackathon), reportedly 5:00 PM. No source explicitly names the speaker, but the title ("Architect") strongly matches **Ajay Krishna Amudan** (CTO), whose Microsoft title was "Founding Architect" — Ram's Microsoft background (Azure OpenAI adoption, incubation) doesn't match the "Architect" framing as well. **Inferred, not confirmed** — worth confirming in person.
- **Alexa Mikalaski** (Maximor, appears to be a marketing/growth role per LinkedIn bio) has been actively posting about Maximor's HackMIT 2026 sponsorship on LinkedIn — likely involved in running the sponsorship, possibly on-site.
- No direct LinkedIn/X posts from Ramnandan Krishnamurthy or Ajay Krishna Amudan specifically about attending/judging HackMIT were found (their recent posts found were about fundraising/product, not HackMIT) — **unverified whether either founder is physically present or judging.**

---

## Sources index (all links used above)

- [maximor.ai](https://www.maximor.ai/) (home)
- [maximor.ai/why](https://www.maximor.ai/why)
- [maximor.ai/about](https://www.maximor.ai/about)
- [maximor.ai/cfo-benchmark](https://www.maximor.ai/cfo-benchmark)
- [maximor.ai/revenue-automation](https://www.maximor.ai/revenue-automation)
- [maximor.ai/cash-automation](https://www.maximor.ai/cash-automation)
- [maximor.ai/automated-close](https://www.maximor.ai/automated-close)
- [maximor.ai/board-ready-reporting](https://www.maximor.ai/board-ready-reporting)
- [maximor.ai/instant-answers-and-search](https://www.maximor.ai/instant-answers-and-search)
- [maximor.ai blog — $9M raise](https://www.maximor.ai/blog/maximor-raises-9m-to-give-cfos-audit-ready-finance-automation-without-erp-rip-and-replace)
- [TechCrunch — launch coverage](https://techcrunch.com/2025/09/29/former-microsoft-executives-launch-ai-agents-to-end-excel-driven-finance-for-mid-market-enterprise-businesses/)
- [CFO Dive](https://www.cfodive.com/news/startup-raises-9m-rescue-finance-teams-buried-reconciliations-agentic-ai/761444/)
- [Forbes — Aug 2026](https://www.forbes.com/sites/davidprosser/2026/08/05/why-maximor-believes-its-ai-can-power-finance-transformation/) (fetch blocked, 403 — unread)
- [fintech.global](https://fintech.global/2025/09/30/maximor-raises-9m-to-expand-ai-finance-automation/)
- [Foundation Capital — investment post](https://foundationcapital.com/ideas/building-the-always-on-finance-team-our-investment-in-maximor)
- [Foundation Capital — context graphs essay](https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity)
- [Sovereign Magazine — 35x growth](https://www.sovereignmagazine.com/article/maximor-35x-growth-autonomous-finance)
- [Yahoo Finance — 35x growth](https://finance.yahoo.com/technology/ai/articles/maximor-grows-revenue-35x-9-143000811.html)
- [LinkedIn — Dura Software post](https://www.linkedin.com/posts/maximor-ai_the-best-ai-rollouts-in-finance-dont-happen-activity-7482792301430292480-Swa1)
- [X — Ramnandan Krishnamurthy](https://x.com/skramd/status/1903960151805034504)
- [Taro — Founding Backend Engineer listing](https://www.jointaro.com/jobs/maximor-ai/founding-backend-engineer-e1f0de89/)
- [ZipRecruiter — Accounting Consultant listing](https://www.ziprecruiter.com/c/Maximor-AI/Job/Accounting-Consultant-(Founding-Team)-New-York/-in-New-York,NY?jid=bbce37a6c10811a4)
- [orchestrator.inc](https://orchestrator.inc/)
- [X — @aoagents](https://x.com/aoagents)
- [syndicate-by-maximor.devpost.com](https://syndicate-by-maximor.devpost.com/)
- [The Org — Ramnandan Krishnamurthy](https://theorg.com/org/maximor-ai/org-chart/ramnandan-krishnamurthy)
- [ZoomInfo — Ajay Amudan](https://www.zoominfo.com/p/Ajay-Amudan/3867221924)
- [Crunchbase — Ramnandan Krishnamurthy](https://www.crunchbase.com/person/ramnandan-krishnamurthy)

**Not independently verified / dead ends:** Forbes article (403 blocked), exact HackMIT $7k prize figure (sponsor.hackmit.org 502'd twice), Kiteworks case-study body text (wrong page indexed), HiBid/QMCO as customer names, AO↔Maximor founder/investor relationship (no evidence found either way after multiple searches), which LLM/agent framework/memory layer Maximor builds on (no public disclosure found).
