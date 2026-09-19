# Syndicate by Maximor (5-6 Sep 2026): what won the same track two weeks ago

Source: https://syndicate-by-maximor.devpost.com/ and individual Devpost project pages, read by a research agent on 19 Sep 2026. Parts of that agent's report were truncated in transit; gaps are marked. No judge notes, names or scores were published, so "what did not win" is inference from the winner and non-winner split, not judge statements.

## The event
- 30 hours, online plus build stations in SF, NYC, Bangalore. **309 participants, 101 projects.** Sponsors: Maximor, Dodo Payments, TensorMux, Neatlogs, AI Grants India. Hosted with Agent Orchestrator (AO, orchestrator.inc).
- **Track 2, "Autonomous Office of the CFO"** (same theme as HackMIT): "Automate a real accounting, finance, or treasury workflow end to end, including exceptions and human review." Named examples: closing the books, reconciliation, invoice processing, updating forecasts, cash reporting, audit support.
- Judging: 25% AO usage and build process · 25% technical execution and reliability · 25% track fit and real-world value · 15% demo and usability · 10% innovation. Building inside AO was mandatory. **HackMIT has no AO requirement, and lists ambition first.**
- Prizes per track: 1st $1,000 cash + $1,000 Dodo credits; 2nd $500 + $500; plus 20 × $100 AI Grants India credits. 40 of 101 projects carry a "Winner" badge (4 cash placings + 36 credit slots).

## Cash winners
| Place | Project | What it is |
|---|---|---|
| Track 2, 1st | **Reckon** | AP duplicate and improper-payment review before each payment run |
| Track 2, 2nd | **PPV Memory for Invoice Processing** | AP agent that learns how a purchase-price variance was resolved |
| Track 1, 1st | Skeptic | Reverse-engineers APIs to find where tool docs lie |
| Track 1, 2nd | Loop | Agent that learns a tool-call dependency from its own failure |

**Reckon.** Seven stages: normalize invoice lines into payments → hash-bucketed blocking for candidate pairs → a deterministic rule engine removes provably innocent cases first → two-tier model adjudication (cheap model on volume, stronger model below 0.7 confidence) → evidence compilation → routing to a named department owner → audit trail with draft claim letters and journal entries that never auto-post. Numbers: precision 0.718, recall 0.700, F1 0.709 on 40 real duplicates plus 60 designed decoys, against a rules-only baseline of 0.400 precision. Only project evaluated on real public data: Checkbook L.A. (20,000 records, CC BY 4.0) plus Oklahoma vendor payments (2,465 candidates, different schema, to show generalization). Scored vendor entity resolution against the publisher's own vendor IDs (free ground truth): 0.967 precision, 1.000 recall. Committed 1,731 recorded model calls as replay cassettes so the evaluation reruns with no API key. Stated posture: "This is a query, not a claim that an amount is owed."

**PPV Memory.** Deliberately tiny scope: price-variance exceptions only. A buyer resolves a flag with a written reason; the next identical vendor-item-price combination auto-approves citing that precedent. Guardrails block generalizing to a different line item or a larger variance than the one approved, and the demo showed the memory refusing. Stack: LangGraph, FastAPI, Next.js, a vendor simulator, Claude plus a cheap model for extraction, SQLite.

## Patterns across the 40 badged projects
1. **Determinism at the core, model at the edges.** The loudest signal. Reckon runs rules before adjudication; Close Controller calls a model only on what rules couldn't match; Meridian: "AI proposes, code verifies, evidence supports, controller approves judgment"; LedgerForge: "Model as Specialist, Never Judge"; War Room keeps arithmetic away from the model.
2. **Money-type discipline.** Integer cents; floats banned under `mypy --strict`. Cheap and reads as "we know finance engineering".
3. **A before/after number against a named baseline.** Reckon vs rules-only; Close Controller vs model-only including cost per transaction; Tickmark across four closes (auto-clear 55% → 79%); Sluice vs a naive transfer baseline (30.4% cost reduction).
4. **Adversarial and held-out sets.** Reckon's 60 decoys in six categories; one project measured baseline variance first so a gain couldn't be luck; Meridian held out 30 validator cases.
5. **Reproducibility artifacts.** Replay cassettes, a one-line repro command, an evidence doc citing primary sources.
6. **Escalation and fail-closed behavior as the product.** Typed exception categories, named approvers, append-only trails, nothing posting automatically. Close Controller blocks duplicate payments even when a human approves them. Sluice returns INFEASIBLE rather than a dubious plan.
7. **Memory that encodes human resolutions, with visible guardrails.** PPV Memory took 2nd on this alone. Tickmark proposes a rule only after two independent corrections agree, then backtests. Tacit "unlearns when reality changes". LedgerForge turns human fixes into policy proposals gated against regressions.
8. **Narrow scope, fully finished.** Winners automated one workflow end to end. Non-winners pitched platforms.

Common stack: Python, FastAPI, Pydantic, SQLite; Next.js front end; test counts quoted as evidence; two-tier cheap and strong model cascade.

## What did not win (inference)
About 60 of 101 got nothing. They skew to generic platforms (AgentMesh, Accord, ORBIT, Agent Society), off-track work, and look-alike names. **Multi-agent swarms did not win Track 2**, and an "OmniCFO"-style breadth entry missed. Several credible projects also missed, so competence alone wasn't enough.

## Track 2 by category
- **AP exceptions:** both cash winners.
- **Close:** crowded. Tickmark, Meridian (intercompany, 103 tests), Close Controller (F1 98.3 vs 92.1, 0 false auto-posts).
- **Bank rec:** crowded. LedgerForge (fail-closed, 105/105 tests), LedgerProof, BotToWork, Tieout, Gray Office.
- **Treasury:** Sluice (mixed-integer LP, 14-day horizon), War Room (liquidity crisis, full provenance).
- **Policy:** Stratra (infers accounting policy from records).
- **Audit:** nothing won.
- **Forecasting:** the biggest hole. Named in the brief, essentially uncontested.
- **Order-to-cash / collections:** none among the badged projects the agent catalogued.

## What this means for our eight-function plan (honest read)
- The breadth warning is real: swarms and breadth-only entries lost at Syndicate. HackMIT scores ambition first and calls cross-function the stretch goal, so breadth can win here, but only with Syndicate's rigor underneath: deterministic core, integer cents, real counts against a baseline, refusals shown, reproducible runs.
- Our mitigation is structural: one ledger and one judgment layer, thin function packs, a demo spine where one event ripples through five functions, and a scoreboard of real counts per function.
