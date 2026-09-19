# Maximor track brief (verbatim)

Source: the track's Google Doc, re-read 19 Sep 2026 ~5 PM ET, unchanged from the morning. https://docs.google.com/document/d/1QAs_O_oTKl-PrKAKXdPxMO1AxKfbocy1EcL6PHkdwJk/edit

**HACKMIT 2026 · MAXIMOR TRACK · $4,000 · $2,000 · $1,000 FOR 1ST, 2ND AND 3RD**

## Agentic Systems for the Office of the CFO

How much of a finance team can an agentic system run? No finance background needed.

**Build an agentic system that runs the Office of the CFO.**

The Office of the CFO (Chief Financial Officer) is the finance team: paying vendors, collecting from customers, reconciling cash, closing the books, forecasting, answering auditors, and explaining why the numbers moved. It all connects. One paid invoice touches the bank reconciliation, the cash forecast, the close, and the audit file. The work is multi-step, spread across systems and people, and unforgiving of mistakes.

Take on as much of it as you can. One process done with real depth is a strong entry; several agents running different parts of the function, sharing context, handing off work, and being able to defend the result to an auditor is the stretch goal. The company, the tasks, the setting and the data are yours to pick or invent.

**Fast track:** the top 5 teams skip the applicant pool: expedited interviews for Summer 2027 internship and 2027 new-grad SWE roles.

### Directions we'd love to see
- **Whole-function systems:** many workflows, one shared picture of the company
- **Multi-agent teams:** preparer, reviewer, approver, auditor; hand-offs and escalation like a real team
- **Memory and context:** precedent from past periods, a context graph that carries across months
- **Self-improvement:** learn from previous runs, corrections or feedback, and show it
- **Long horizons:** a whole month-end close or a full quarter, not a single question

### Example finance processes
- **AP/AR.** Three-way match each vendor invoice to its purchase order and goods receipt, hold duplicates, route approvals, decide what gets paid this week. Work the receivables aging, chase, and apply cash to the right invoices when the payment doesn't say which.
- **Cash and reconciliation.** Reconcile a month of bank activity to the ledger: one payment covering three invoices, a wire net of bank fees, a refund posted twice, a $12.40 difference nobody can explain. Match Stripe or Adyen payouts to orders and deposits, net of fees and chargebacks.
- **Month-end close.** Book accruals for bills not yet received, spread prepaid and asset costs over the months they cover, tie every balance-sheet account to evidence, and track what's done and what's stuck.
- **Audit and controls.** Play the auditor: sample transactions, re-perform reconciliations, test controls, write up findings. Watch for duplicate vendors, round-number payments, entries posted after the period closed, self-approved requests.
- **Reporting and forecasting.** Explain a variance (gross margin dropped three points; trace it to the transactions responsible) and draft the board pack with numbers that tie to the ledger. Keep a 13-week cash forecast alive from receivables, payables and payroll; when actuals land, explain the miss.

### How we judge
Ambition and creativity, technical difficulty, how close you get to the frontier of what agentic systems can do, and the demo. We look for multi-step reasoning over real documents and data, coordination or memory that changes what the system does next, consistency across workflows (the same transaction means the same thing everywhere), and human review when the system is uncertain. No fixed benchmark; show us your own measure of "better."

A one-shot chatbot, an extraction pipeline, a hard-coded accounting workflow, or a personal-finance app is not enough.

### Build with whatever is at the frontier
- **Models.** Claude, GPT, Gemini; open-weight Qwen, Llama, DeepSeek, Kimi, Gemma if you want to fine-tune.
- **Harnesses.** Claude Agent SDK (subagents, skills, hooks, tools over MCP); OpenAI Agents SDK and the new Agents API; deepagents, Pydantic AI, CrewAI, smolagents; computer use for systems that only have a UI.
- **Memory and learning.** Letta, Mem0, Zep/Graphiti; self-written skills or rules; DSPy and GEPA; fine-tuning if you have the data. On context graphs: Foundation Capital's "AI's trillion-dollar opportunity" (decision traces behind approvals and exceptions) and Neo4j's hands-on with context graphs.

### Reference points (none required)
AccountingBench (an agent closes a real software company's books month by month and drifts as errors compound) · APEX-Accounting · Finance Agent Benchmark · DABstep · BenchRec · Invoice Sandbox Benchmark (ciru-ai).

---

## The shorter brief in HackMIT's main prize doc

Build an agent that learns to automate a real workflow in the Office of the CFO. Your agent should be able to execute a finance workflow, identify when and why it fails, and improve its own behavior over repeated runs.

Strong submissions should demonstrate: multi-step reasoning and tool use · learning from previous runs, corrections, or feedback · handling ambiguous or exceptional cases · measurable improvement in accuracy, reliability, cost, or speed · appropriate human review when the agent is uncertain.

"A one-shot chatbot, extraction pipeline, or hard-coded accounting workflow is not enough. We want agents that get better at doing real financial work."
