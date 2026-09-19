# Brief: self-improvement / autonomous research loop (research pass 2026-09-19; sources fetched unless UNVERIFIED)

**Recommendation (proposed):** an autoresearch-style keep/discard loop. Fitness = deterministic kernel + replay harness + edge-case corpus. Human approval gate in front of anything that changes posting behaviour. Offline GEPA fits as a *proposer inside* the loop. The 09-19 rejection of LIVE GEPA/DSPy online learning still stands; what is new for batch use: the GEPA repo states it works from ~3 examples and 100-500 metric calls, and `optimize_anything` handles code/configs.

## Karpathy autoresearch (https://github.com/karpathy/autoresearch, program.md)
- 3 files: `prepare.py` (fixed constants + evaluator, READ-ONLY), `train.py` (the only file the agent edits), `program.md` (human-edited instructions).
- Fixed 5-min wall clock per experiment (hard kill 10) → ~12/hour, ~100 overnight. Single metric. Loop: commit → run → grep metric → append `results.tsv` (commit, metric, status, description) → keep commit if improved else `git reset`. Rules: no new deps, never touch evaluator, simpler is better, never stop to ask the human.
- Generalisation: labloop (https://github.com/plicara/labloop): any command/metric, protected harness paths, metric-variance check before starting, confirmation re-runs for noisy metrics, sandbox, `labloop.jsonl` history.

## Technique fit table
| Technique | Mechanism | Fit |
|---|---|---|
| GEPA (arXiv 2507.19457, github gepa-ai/gepa) | reflect on traces, mutate text, Pareto frontier | strong OFFLINE; kernel rejection reasons = textual feedback |
| ACE, Agentic Context Engineering (arXiv 2510.04618) | generator / reflector / curator apply DELTA edits to a playbook, avoids context collapse; no labels; +8.6% on a finance benchmark | strong; maps to per-pack learned playbook |
| Reflexion | verbal self-critique retried per episode | partial; needs curation to persist (UNVERIFIED this session) |
| Voyager / SkillWeaver (arXiv 2504.07079) | agent writes reusable code skills verified by running | good for comparators/tools behind tests |
| Anthropic Skills / memory tool | SKILL.md progressive disclosure; "start with evaluation" | storage format for playbooks |
| Darwin Gödel Machine (arXiv 2505.22954) | archive of self-rewriting agents | too expensive; cautionary: it fabricated test logs and removed hallucination markers |
| AlphaEvolve / OpenEvolve / ShinkaEvolve | evolve code with LLM mutation scored by evaluator file | fits pure functions e.g. matching comparators |
| DSPy BootstrapFewShot (~10 ex) / MIPROv2 (200+ ex) / SIMBA | demo selection / Bayesian instr opt | BootstrapFewShot feasible; MIPROv2 needs more than 115 cases |
| RFT / RLVR (OpenAI) | RL against a grader | not viable in 24h |

## Guardrails
- The optimizer WILL attack the checker (DGM fabricated logs; AccountingBench models pulled in unrelated transactions to force reconciliations to balance). Keep kernel, corpus labels, scorer and held-out set READ-ONLY and outside the mutable tree.
- Hold out 25-30% of cases stratified by route class; run once per night on survivors only; never feed held-out traces back to the proposer. With 115 cases a 1-2 case gain is noise: re-run before keeping.
- Errors compound across periods (AccountingBench: within 1% after month one, more than 15% off by year end): score replay on the whole quarter SEQUENTIALLY, not only case by case.
- APEX-Accounting (arXiv 2607.27189): 59-79% of failures are reasoning/data handling, none tool use; best Pass^8 = 2.6%.
- Automated root-cause attribution is unreliable (Who&When: 53.5% agent-level, 14.2% step-level): treat each attribution as a hypothesis the eval confirms or rejects. MAST: 14 failure modes in 3 categories. Hamel Husain process: open-code 30-100 traces, axial-code into a taxonomy, count, fix the FIRST UPSTREAM failure.

## Failure class → kind of fix
| Failure class | Fix |
|---|---|
| Missing context | new scoped fact, or an escalation rule |
| Retrieval miss | comparator / index change |
| Reasoning error | prompt lesson as an ACE-style delta to the pack playbook |
| Wrong or absent policy | PROPOSED policy, needs human approval |
| Tool bug | code fix + unit test |
| Threshold | router threshold change, only if NO case moves to AUTO |
| Every failure | a new regression case (add only, never delete) |

## Recommended loop
1 Collect failed + escalated traces from replay and corpus runs → 2 Diagnose: cluster, attribute root cause, pick largest cluster → 3 Propose ONE change per experiment on its own git branch → 4 Run eval under fixed wall-clock and dollar cap, cheap cases first (cascade) → 5 Gate: keep only if dev score rises AND false auto-posts = 0 AND no pass→fail flips AND kernel rejection rate does not rise → 6 Held-out check once per night on survivors → 7 Queue survivors for human approval.
- Loop MAY edit: prompts and playbook lessons; router thresholds in the conservative direction only; comparators; new test cases (add only).
- Needs HUMAN approval: policies, scoped facts, tool code, anything that widens what can AUTO-post.
- May NEVER touch: kernel, scorer, corpus labels, held-out set.
- Fitness is LEXICOGRAPHIC, not a weighted sum: (1) false auto-posts must be 0; (2) regressions must be 0; (3) routing accuracy + replay agreement; (4) escalation count; ties → simpler change. Log every trial `results.tsv`-style into the trace store. Dollar cap on overnight run.
