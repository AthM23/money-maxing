# The track doc's six reference benchmarks — what each is, who uses it, status (2026-09-20 ~01:30)

| Benchmark | Shape | Fits | Status |
|---|---|---|---|
| AccountingBench (Penrose) | agent closes real books month-over-month; harness closed | framing only | captured: accountingbench-penrose.md — the drift chart + "invents transactions" quote is our foil slide |
| APEX-Accounting (Mercor×Ramp, HF) | 10 open dev tasks, expert rubrics, 90-file law-firm world | harness eval (lane A) + realism probe (lane C) | downloaded ../apex-accounting; our model passed an external invoice probe; leaderboard: best frontier 56.4%, Qwen3.5-397B 24.4% |
| Finance Agent Benchmark (vals-ai, HF) | 50 open SEC-filing research questions, needs live EDGAR retrieval | out of scope (analyst research ≠ close ops); cite "frontier ~50%" | noted only |
| DABstep (Adyen, HF) | 450 payment-data analysis questions, exact answers, open data | lane A stretch: run the easy split through the harness as an external agent eval | noted; 5.9 GB, pull only if A wants it |
| BenchRec (Kaggle) | real bank↔ledger matching, 99.8% precision bar | head B's twin; obfuscated fields limit transfer (per our brief) | needs Kaggle login to download — Preet can fetch if we want the row |
| **Invoice Sandbox (ciru-ai, GitHub)** | 110+ invoice PDFs, traps (voids/dupes/supersedes/statements), own scorer | **lane C, direct**: extraction + trap handling scored by THEIR code | cloned ../invoice-sandbox-benchmark, fixture generated, run IN PROGRESS via ft/sandbox_run.py |

Their precision framing matches ours everywhere: BenchRec requires 99.8% precision and says an unmatched
item is cheaper than a wrong match; Invoice Sandbox plants traps and grades exclusions. That is the
abstain-and-escalate philosophy the whole build runs on.

Division of labor on the sandbox run (say this honestly in the demo): the fine-tuned model reads each
PDF and extracts amounts/parties/refs; deterministic code classifies the planted traps from literal text
flags and does all arithmetic; the score comes from the benchmark's own scorer, untouched.
