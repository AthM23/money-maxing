# Team roadmap — 2026-09-19

Direction recorded from the live team planning conversation: prove one realistic
international payment investigation end to end with Claude while Preet fine-tunes
and benchmarks independently. Reinforcement learning and voice-call approvals are
not dependencies of the first demo. The exact fixture and assignments below are
**proposed**. A/B personal names were ambiguous in this conversation; these labels
do not reinterpret the historical assignments in PROJECT_STATUS.md.

The existing harness must be inspected and extended where needed, not rewritten
or assumed complete. Earlier status entries report real-model runs and safety
fixes; they do not establish readiness for this new scenario. FX is new scope
relative to the 22:17 recommendation. This narrows the demo's first proof, not the
shared-ledger architecture: the new evidence is the judges' preference for a
realistic customer story and this team's chosen starting point. See
[project status](./PROJECT_STATUS.md) and its Tried & rejected table.

## Proposed owners and handoffs

| Owner | Deliverables | Handoff / acceptance |
|---|---|---|
| Person A — harness and controls | Assess existing gaps; wire Claude investigation and tools; deterministic checks and safe posting; bounded recovery retries; genuine human blocker handling; retrieval of scoped, verified memory; interchangeable model adapter; execution trace events. | Give B the fixture/schema requirements and trace contract; agree the precise model input/output task with C. Evidence and authority must survive every posting gate; retry exhaustion is visible and never causes duplicate posting. |
| Person B — world and demo | International fixtures and hidden ground truth; consistent local, Gmail, Slack and QuickBooks sandbox representations; FX/entity bookkeeping support with A; repeatable reset; UI consuming real traces and showing business impact and memory reuse. | Give A canonical IDs, evidence, balances, rates and expected outcomes; give C evaluation fixtures with answer keys isolated from model input. Verify source consistency, ledger tie-out and repeatable reset before presenting the demo. Label local versus live sources truthfully. |
| Preet (Person C) — fine-tune and evaluation | Define the exact fine-tune task with A; disjoint training/dev/held-out benchmark data; compare base, fine-tuned and strong reference models with identical harness and evidence; later hybrid experiment; measured accuracy, false auto-posts, human intervention, latency and cost. | Give A a compatible model endpoint/adapter contract and B a reproducible results artifact. Record model/configuration, dataset split, denominators and failures. No fabricated scores or claim that training guarantees improvement. |

## Starting fixture — proposed, not approved ground truth

A simulated US cybersecurity entity invoices a European customer **EUR 100,000**.
The customer remits **EUR 98,000**, converted at **USD 1.08/EUR**, with a **USD 40**
bank fee: `98,000 × 1.08 − 40 = USD 105,800` deposited. The customer withholds
**EUR 2,000** for an outage. Remittance identifies the invoice; Slack establishes
that the outage occurred. An outage alone does not authorize a credit: explicit
policy/evidence or an authorized human answer must establish the treatment.

This is an invented scenario inspired by the Kiteworks case-study shape, not a
claim about a real Kiteworks incident. Do not invent country restrictions or treat
the outage deduction as withholding tax. Before building, A/B must agree invoice
recognition date/rate, functional currency, conversion evidence, rounding, accounts,
entity ownership and authorized treatment. The deposit arithmetic alone does not
determine realized FX or the final journal entry.

| Variant | Required demonstration |
|---|---|
| Fully evidenced | All needed authority and applicable autonomy requirements are present; investigate, validate and post without a human. Do not bypass existing controls to obtain AUTO. |
| Missing authority | Available evidence explains the outage but cannot authorize treatment; ask the appropriate person once, record a verified answer with explicit scope, then resume safely. |
| New in-scope invoice | Reuse the applicable standing answer on a distinct invoice without asking again. A one-time answer cannot support this variant. |
| Out-of-scope counterexample | Reject memory that does not apply, with the failed scope dimension visible; obtain missing authority if needed. |
| Identical transaction replay | No duplicate posting or question; label this idempotency, not learning. |

An optional wrong-entity decoy follows the core variants. Scope of stored authority
must include applicable entity, party, treatment, amount limits and validity, with
provenance and approver identity; never broaden a human answer to make reuse work.

## Milestones and acceptance gates

1. **A/B/C agree the contract.** A assesses harness gaps; all agree fixture,
   expected entries/routes and model input/output contract. Keep answer keys out
   of investigative tools and settle new FX/entity requirements explicitly.
2. **Build concurrently.** B prepares fixtures/reset while A connects Claude to
   the existing harness and C prepares training/evaluation. Handoffs use the same
   evidence IDs and contract; the first working demo does not wait for training.
3. **A/B prove the full path.** From reset, real investigation retrieves evidence,
   validates authority, passes deterministic checks and safely posts or raises a
   genuine blocker. UI reflects actual events, balances and business outcome.
   Report measured before/after intervention, elapsed time, cost and unresolved
   work; do not invent manual time savings or equate routed work with posted work.
4. **Verify memory and recovery.** Run distinct in-scope reuse, out-of-scope refusal
   and identical-transaction idempotency separately. Show bounded retries and a
   visible terminal blocker rather than an infinite loop or unsafe fallback.
5. **Swap and measure.** C compares base, fine-tuned and strong reference models
   using the same held-out evidence, tools, controls and budgets; disclose any
   configuration differences. Report actual accuracy and false auto-post counts,
   human intervention, latency and cost with sample sizes. Keep benchmark answers
   out of training; the existing test corpus is not training data. Route/posting
   authority remains controlled by the harness, not a trained route classifier.
   Attempt a hybrid only after standalone comparisons; report regressions too.
6. **Finish UI and demo.** B presents the verified run and measured results with A/C
   checking claims. Mark anything incomplete, simulated or not run. Preserve a
   repeatable reset and runnable Claude path regardless of fine-tune outcome.

This document records planning only. No new scenario run, benchmark result or
implementation completion is asserted here. Exact fixture/contract agreement is
the first implementation gate, not a blocker to completing this documentation.
