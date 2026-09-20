# Judge-readiness review — 20 September 2026

Assessment, not a new implementation plan approved by the team. Based on the original track brief, both judge conversations, source inspection, and the authenticated Vercel site after the user reported redeploying it. No application code or deployment was changed.

## Verdict

The underlying system is a credible hackathon entry with real technical depth. The hosted demonstration currently undersells the actual agent and memory work while the marketing page oversells completion and generality. The highest-value next work is making the demonstrated evidence match the claim, then tightening the scope of remembered authority. Adding another finance function is lower priority.

The judge's second conversation narrows the first: two or three excellent processes in one realistic customer story, plus measured improvement. Breadth belongs in the architecture explanation, not a tour of every menu.

## Evidence boundaries

- The original checkout remained at `dc33ce3`. On that checkout I ran the suite: 72 files, 686 tests passed; typecheck passed. These are NOT fresh test results for the deployed revision.
- Found the newer deployment worktree at `C:/Users/A1M/Projects/mm-vercel`, branch `vercel-setup`, observed at `9bed874` during this review. Read its newer status, implementation, runbook and results. Its log reports main merged and later test counts; I did not re-run that worktree's suite.
- Inspected the live overview, cash table, Vossberg case, Close, Agents, Model, and marketing page. The deployment changed during the review; observations describe the pages seen, not an immutable release.
- Ran the hosted read-only audit: 14 posted entries sampled, 14 clean, zero findings. Did not submit approvals, run paid models, reseed anything, or write to external systems.
- Benchmark figures below are stored results and displayed results, not independently repeated GPU experiments.

## Rubric alignment

These are qualitative assessments, not official scoring weights.

| Criterion from the brief/interviews | Assessment | What changes the assessment most |
|---|---|---|
| Ambition and cross-workflow consistency | Strong architecture; partially demonstrated | Show one decision's actual AR, revenue/forecast or close effects, with unchanged/blocked outcomes stated truthfully |
| Technical difficulty | Strong bounded implementation | Show an actual rejected model proposal, evidence, final treatment and duplicate-safe rerun |
| Frontier/model choice | Credible specialization | Lead with downstream reader usefulness; add schema-prompted base Qwen and reproducible comparison metadata |
| Memory and measurable self-improvement | Strong mechanism, incomplete business scope | New invoice uses the answer; same customer with unrelated incident does not |
| Autonomy with genuine blockers | Partial alignment | Separate questions from approvals and explain why each human action remains necessary |
| Realistic customer story | Good international receipt scenario | Tie to researched customer pain, authority and service period; avoid claiming full multi-entity accounting |
| Demo | Main weakness on hosted copy | Put the real model trace and memory transition in the demonstrated environment |

## Priority 0: complete the evidence the judge actually sees

### Hosted copy has not reached the central agent moment

Observed: 12 receipts, 3 settled, 8 open, 1 awaiting a person; 14 posted entries; zero model calls. The two Input needed items include an accrual, so they are not two settled payment exceptions. Vossberg shows cash USD 105,800, fee USD 40 and FX loss USD 1,960 posted, with USD 2,200 unexplained. Its trace contains code turns only. Agents labels the investigators “not needed this month” despite unresolved work.

`workspace/vercel.ts` passes read-only mode unconditionally. `scripts/vercel-build.mjs` uses a supplied `runs/snapshot/month.db` or builds the code-only `prepared.db`. A newer code deployment alone does not supply the paid investigation or its human decision.

Recommendation: demonstrate the writable local workspace using the existing prepared real-model demo database. Publish a clearly labeled read-only snapshot containing the real trace for judges to inspect afterward. Keep hosted writes disabled; hide or disable unsupported write buttons and explain where interactive work runs. Do not try to turn ephemeral Vercel SQLite into a persistent finance backend before judging.

Acceptance: first invoice investigated; human answer recorded; next invoice prepared from memory; mismatched case refused; duplicate rerun changes nothing. Show a recording fallback with the same run identity.

### Freeze one story and one set of numbers

The live landing page mixes Initech/Wayne/Globex with Vossberg; says “One month, closed” while Close is 4/11 done; ends with “8 of 11” while the dashboard has 12 receipts and 14 entries. Entry count is not receipt resolution. A balanced ledger is not a finished close.

Use one run summary everywhere: dataset/world, run ID, timestamp, commit, receipts resolved/total, entries posted, context questions, approvals, model calls and cost. Separate these counts rather than combining them into an automation percentage.

Suggested title: “Resolve payment exceptions. Remember the answer.” Suggested concrete promise: “An international wire is short for three reasons. We explain each one, book what is supported, and remember the authorized credit for the next invoice.”

### Reconcile benchmark artifacts before quoting a winner

Observed live Model page: Sonnet field-F1 0.976, exact 77.5%. Observed refreshed landing page: Sonnet field-F1 0.949, exact 78/120. The newer worktree's result file and runbook say the API evaluation was rerun after a test-slice mismatch. This may be deployment/version drift rather than a scorer defect, but a judge cannot tell which result to trust.

Publish one versioned manifest used by both pages: sample hash, sample count, scorer, model/checkpoint, prompt/schema condition, adapter/harness, timestamp, raw prediction artifact. Remove silent fallback to an older result. Say “schema supplied”; “cheat sheet” makes a normal integration practice sound unfair.

The key reader result is stronger and more relevant than the giant before/after F1 jump: on 200 remittances, 168 settled, cash applied with deduction left open on 32, zero observed wrong postings, matching the oracle's achievable settlement count. Untouched and deliberately bad readers settle none. Clearly identify oracle and saboteur as non-model controls.

Add base Qwen WITH schema, under the same serving and generation conditions. A bare base model failing the required output schema conflates format learning with accounting capability. Give whole-document exactness equal visibility: 0.972 field-F1 is 84/120 entirely correct, not 97.2% error-free documents. New-seed synthetic data does not prove absence of memorization or real-world generalization. “Zero errors” in throughput is execution failures, not extraction mistakes: the fresh file reports 0.674 exact and 0.99 schema validity.

The dollar cost comparison needs its hardware utilization, amortization and power assumptions next to it. Batched throughput is not single-request latency. Prefer measured cost per accepted document or resolved case, including fallback, over output-token price comparisons. Separate training on synthetic documents from the implemented future trace-export loop; the current generator explicitly exists to avoid waiting for runtime traces.

## Priority 1: the two most useful correctness additions

### Remember the business authorization, not just its percentage

Current applicability checks party, entry kind, dates, one-time use and amount ceiling. It does not compare contract, reason/incident or service period. A standing 2% concession for a June outage can therefore prepare a 2% concession for an unrelated later dispute for the same customer. Parking reduces posting risk but does not make that suggested treatment correct.

Add explicit contract/incident/service-period scope, default missing scope to non-reusable or review, and expose scope on the memory card. Test: covered add-on, same customer/different reason, expired service period, other contract, other entity/customer, later contradictory evidence. Separately enforce the contract's required officer role: a dollar approval limit alone does not establish that role.

### Distinguish knowing the answer from permission to post

The next USD 550 credit still needs approval. The first decision also has an answer and a posting approval. “Asked once” can truthfully mean context is not requested twice; it does not currently mean one human interaction total or autonomous future posting.

Do not delete the approval control to satisfy a slogan. Make the two states visible: “Context resolved from approved memory; posting awaits authorization.” If adding bounded standing authorization, it must explicitly state who granted it, allowed treatment, scope, amount limit and expiration and pass all existing posting checks. The 95%/minimum-five-history ladder is a prototype policy, not statistical assurance of production safety.

## Practical finance and architecture boundaries

- USD 4,200 decomposes into USD 40 fees, USD 1,960 realized FX and USD 2,200 customer withholding. That is the main scene; explain why each cause requires different evidence.
- The booked 1.1000 rate is in `invoice_fx` without a source reference/date/type. Add provenance before describing both rates as independently sourced.
- Describe the credit treatment as the seeded company's policy and disclose the earned/unearned allocation limit. Do not claim a general revenue-accounting engine from this case.
- Entity and bank labels are useful realism; they do not establish separate legal-entity ledgers, consolidation or intercompany processing. Full FX gain handling and automated remeasurement remain outside this bounded demonstration.
- The overview correctly calls the forecast expected receipts and excludes payments out. Keep that wording; it is not net liquidity/runway.
- Deterministic validation and an audit re-performance pass are strengths. The audit shares accounting logic with the system, so it is not independent accounting certification; common logical errors can survive both.
- Learned fee-policy parameters and reusable memory are real. Exact matching, FX arithmetic, validation and the policy template are hand-written logic. Remove “Nobody here wrote those rules by hand” where it lumps all of them together.
- Keep the shared ledger, one proposal path, idempotency and source history. Do not add an agent to deterministic arithmetic just to inflate the agent count.
- The current flow still depends on operator-triggered runs. Be ready to show what is scheduled/event-driven and what is manual. The long-term architecture needs durable ingestion/work queues and authenticated role-based authority; that is follow-on work, not a reason for a last-minute rewrite.

## A four-minute presentation

1. 20 seconds: finance receives one international wire; fees, FX and an unapproved service credit are mixed in one apparent shortfall.
2. 60 seconds: show the four amounts, source documents, real model tool trace and one refused draft. Explain what is arithmetic and what is missing authority.
3. 60 seconds: officer gives bounded answer; show memory card; new invoice uses it; unrelated case does not. Identify remaining approval honestly.
4. 35 seconds: one actual downstream consequence and the read-only auditor. An unchanged or blocked revenue schedule must remain labeled that way.
5. 45 seconds: reader benchmark, 168/200 settled, 32 deductions preserved, zero observed wrong postings; show exactness and prompted baselines if asked.
6. 20 seconds: architecture and current boundaries. Keep the full model table, AP/accruals tour, Ask and architecture board as Q&A material.

## Questions worth rehearsing

| Judge asks | Defensible answer |
|---|---|
| Why is this more than cash matching? | One apparent shortfall is split into distinct causes; the unresolved part requires finding evidence and authority, then remembering the authorized treatment. |
| What did the agent actually decide? | Show the real stored tool trace and proposal. Arithmetic and validation are deterministic; the model investigates and proposes treatment or a blocker. |
| Does it never ask again? | It reuses context within scope. Posting approvals can remain, and changed/expired evidence can require a new question. |
| Does the fine-tune run in this demo? | Not in the prepared main scene. It is wired as a remittance reader and separately measured through the actual posting harness. |
| Is zero wrong postings a guarantee? | No. It is an observation on the named run/benchmark. A check can pass while an unmodeled accounting assumption is wrong. |
| How much time does this save a controller? | We measured machine work and human actions; no controlled human time-savings study yet. Do not invent hours or headcount savings. |
| Can it close the whole month? | The current hosted close is 4/11 complete. Show the implemented close assistance and named blockers; do not claim a fully autonomous close. |
| What is actually live? | Distinguish seeded documents in real connectors, a local real-model run, the read-only hosted snapshot, and the separate trained-reader benchmark. |

## What to cut or leave alone

Do not add equity, payroll, another orchestration framework, or a new memory vendor. Existing rejected directions remain rejected; this review supplies no evidence to reopen them. Keep the realistic wire story. Cut inconsistent promotional claims, the full model leaderboard from the opening pitch, and buttons that cannot work on the hosted copy. The new accrual work can support breadth in Q&A without replacing the already-rehearsed scene.
