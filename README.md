# Money Maxer

![Money Maxer: close the books while you sleep. An agent finance team that reads the inbox, matches the bank, books every entry through a checker that re-performs it, and asks a human exactly once.](docs/hero.png)

<p align="center">
  <b>Ramp: 3rd place, Save Time. Save Money.</b> &nbsp;·&nbsp; <b>Maximor AI: 4th place, Office of the CFO Agent Challenge</b><br>
  HackMIT 2026 &nbsp;·&nbsp; Preet Karia, Karan Singh Bisht, Atharv Mungale
</p>

<p align="center">
  <a href="https://plume.hackmit.org/project/nlhtb-gqmiu-yvcyw-pibeg">HackMIT project page</a> &nbsp;·&nbsp;
  <a href="https://drive.google.com/file/d/1RLDRcEYKdf4m_-kqa3kAZAnqPq-xy7mI/view">Paper (PDF)</a> &nbsp;·&nbsp;
  <a href="https://money-maxing-mu.vercel.app">Live demo</a>
</p>

## Overview

Money Maxer is an agent finance team for the office of the CFO. Preparing financial statements is the easy last step;
the hard part is finding out why a payment is short, digging the agreement out of an email, and booking it correctly.
Money Maxer does that investigation, asks a person only when it is genuinely stuck, and remembers the answer so it is
never asked twice.

- **Code first.** Bank matching, multi-invoice payments, fees and FX differences are settled deterministically.
- **Agents for judgment.** What code cannot explain goes to model tiers that search email, contracts, Slack and CRM.
- **No agent is trusted.** Every entry is re-performed by a small deterministic kernel before it can post.
- **Ask once.** A person's answer is stored with its scope and compiled into rules that apply automatically next time.
- **Audit-ready.** An independent auditor pack re-performs a sample of entries and ties them to the ledger.

The demo closes a simulated July for Northwind Systems, a fictional mid-market software company.

## Paper

**[Money Maxer: Verified Small-Model Document Extraction for the Financial Close](https://drive.google.com/file/d/1RLDRcEYKdf4m_-kqa3kAZAnqPq-xy7mI/view)**
asks how small the model that reads finance documents can be. We LoRA-fine-tune open-weight models from 0.6B to 20B
parameters and evaluate on NorthwindBench, a benchmark with held-out customers, vendors and templates. The fine-tuned
Qwen3-4B reaches **0.972 field-F1** and **100% schema validity** with no schema in its prompt.

## Tech stack

TypeScript (Node 22+) · SQLite · Claude Agent SDK · OpenAI · Model Context Protocol · Slack · QuickBooks sandbox ·
Python for fine-tuning

## Getting started

```bash
pnpm install
pnpm test

# Build and serve the demo month (no model calls)
scripts/demo-build.sh
scripts/demo-serve.sh        # http://localhost:4320
```

Model-backed runs need API keys in a `.env` file; see [`.env.example`](.env.example).

## Project structure

| Path | Contents |
|---|---|
| `src/kernel` | Deterministic checker that re-performs every entry |
| `src/agents` | Model tiers, tools, controller, human loop |
| `src/learn` | Replay, rule compilation, run-over-run learning |
| `src/reader` | Document reader and its benchmark |
| `src/audit` | Auditor pack |
| `workspace` | The CFO web app and MCP server |
| `ft` | Fine-tuning and evaluation |
| `context` | Spec, research and the team log |

## Team

Preet Karia · Karan Singh Bisht · Atharv Mungale
