# What Maximor actually runs on (checked 20 Sep 2026, 00:58 ET)

Why: so that when a judge asks "how would this deploy", our answer is shaped like their stack, not like whatever
cloud account we happen to have. Sources are public pages only. Where a page refused our fetcher (403) the fact comes
from a search engine's index of that page and is marked *(index)*.

## Facts

| Layer | What they use | Source |
|---|---|---|
| Cloud | **AWS** ("IT infrastructure"), the only infrastructure cloud on their subprocessor list | trust.maximor.ai/subprocessors *(index)* |
| Datastore | **Snowflake** ("Datastore Providers"); **PostgreSQL** appears in their platform job post | same *(index)*; Staff Software Engineer post |
| Ingestion | **Fivetran** ("IT infrastructure") in front of the customer's ERP and other systems; they say they "plug directly into your finance stack (NetSuite, QuickBooks, Sage Intacct …) — no IT re-platforming" | same *(index)*; Sr/Staff AI Engineer post |
| Models | **Anthropic** and **OpenAI** are both subprocessors. The AI engineer post lists "Python, AWS, React, LLMs, AI Agents, Cursor, Claude" | same *(index)*; paraform.com post |
| Agent observability | **LangSmith** ("Observability") | trust center *(index)* |
| Browser automation | **Browserbase** (portals with no API, presumably banks and vendor sites: our inference) | trust center *(index)* |
| Errors | **Sentry** | trust center *(index)* |
| Languages, runtime | Python and React (AI engineer post); TypeScript, Deno, Node.js, Bun, **MCP**, OAuth2/OIDC, Docker, **Kubernetes**, CI/CD (Staff Software Engineer post, which also lists AWS, GCP and Azure generically) | job posts |
| Security posture | SOC 1 and SOC 2 Type II, ISO 27001, GDPR, field-level encryption, **optional private VPC**, **immutable audit trails**; "No customer's data is ever used to train another's model." | their blog "Is my financial data secure?" (15 Dec 2025) and security page, in `maximor-site-deep-read-2026-09-19.md` |

## Their own words for what we built

The Staff Software Engineer post says the role will "own the **agent harness** the entire company builds on" and
"define abstractions for **context, verification, guardrails, observability, and developer tooling** so every pod can
ship **audit-grade AI agents** on shared rails", and "architect the financial data platform, owning the ingestion,
normalization, reconciliation, and **canonical ledger model** that turns data from ERPs, banks, billing, payroll,
CRMs, and email into a trustworthy source of truth." That is our kernel (verification), router and tools (harness),
trace store and drift monitor (ingestion, reconciliation) and ledger contract (canonical ledger model), by name.

## What we say about deployment (as a plan, not as built)

- Same shape as theirs: **containers on AWS**, one deployment per customer, **inside the customer's private VPC when
  they ask for it**. The landing page is static and sits on Vercel; the product cannot, because it holds a Slack
  socket, watches the bank feed, and a hard case keeps a model working for minutes (we measured 9 min 50 s).
- Ledger and evidence in **Postgres** for the write path (`propose_entry` is the only writer); a **Snowflake** share
  or export for the customer's analytics, since that is where their data already lands. Evidence is content-hashed
  today; on AWS it goes to S3 with Object Lock, which is what "immutable audit trail" means in practice.
- Models behind one interface: Claude through the API today, **Bedrock inside the customer's account** when data
  may not leave it. Both of their model vendors are reachable that way.
- What we add that their stack does not list: a **small open-weight reader fine-tuned on the customer's own verified
  decisions, running on the customer's hardware** (the GX10 on our table). It is the logical end of "no customer's
  data trains another's model": the model is theirs, and the documents never leave the building.
- Observability: every model turn, tool call and kernel mark is already a row (`decision_step`, `workpaper`); that is
  our LangSmith, and it doubles as training data and audit evidence.

Not verified: regions, whether Snowflake holds the ledger or only analytics, whether Fivetran is used for every
customer, what Browserbase automates.

Sources: https://trust.maximor.ai/subprocessors · https://trust.maximor.ai/ ·
https://www.paraform.com/share/maximor-ai/cmqu3gexf000v0ckvtuxm45jo ·
https://www.ziprecruiter.com/c/Maximor-AI/Job/Software-Engineer-(Staff)/-in-New-York,NY?jid=f76997801d980c1a ·
https://jobs.ashbyhq.com/maximor
