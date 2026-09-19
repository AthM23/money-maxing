# Brief: fine-tuning pipeline (research pass 2026-09-19). Status in repo: fine-tuned small model = STRETCH, first thing cut. Respect that: draw it as a complete pipeline but in shadow-first form.

## Key findings
- **OpenAI fine-tuning is effectively closed to new orgs** (deprecations page: orgs that never fine-tuned blocked from creating jobs 2026-05-07; all job creation ends 2027-01-06; gpt-4.1-nano and o4-mini shut down 2026-10-23). https://developers.openai.com/api/docs/deprecations — this CONTRADICTS spec §6 ("OpenAI fine-tuning is the lowest-friction route"). Skip OpenAI.
- Open-weight hosted routes (verified pricing pages): Together LoRA SFT Qwen3.5 0.8B-9B $0.34/M tokens, $4 min/job, quickstart 20-40 min end to end, dedicated endpoint serving billed per minute, built-in shadow experiments; Fireworks LoRA SFT $0.50/M up to 16B, LoRA serves on on-demand H100 $8/hr only; Tinker Qwen3.5-4B $0.737/M (access UNVERIFIED, download + self-host); Modal + Unsloth/TRL A100-80GB ~$2.50/hr, $30/month free, Unsloth guidance gte 100 rows, 1000+ preferred, QLoRA, 1-3 epochs. Team machine has NO NVIDIA GPU.
- Non-LLM is the better fit at 200-2000 examples: gradient-boosted trees (LightGBM / sklearn) on engineered PAIR FEATURES: amount delta, date delta, name similarity, reference-number hit, count of open candidates. Trains on CPU in seconds, no GPU to serve, easy to calibrate. Encoder options: Ditto (arXiv 2004.00584, sequence-pair classification), ModernBERT (arXiv 2412.13663).

## Sub-task fit
| Task | Input → output | Best tool | Label source | Examples |
|---|---|---|---|---|
| (b) bank line → open-invoice candidate ranking | pair features → score | GBT (cross-encoder later) | human-closed Q2 matches + kernel-pass matches; negatives = the OTHER real open candidates | 300-1000 positives |
| (c) descriptor normalisation / vendor resolution | string → party id | alias table first, then char n-gram or bi-encoder retrieval + GBT | Q2 + human corrections | 20-50 per vendor |
| (d) GL account coding of AP bills | vendor, memo, amount → account | GBT or encoder classifier | Q2 booked bills | 50+ per account |
| (f) exception-type triage | features + text → class | encoder or GBT | trace outcomes | 50-100 per class |
| (a) route AUTO/PROPOSE/ESCALATE/REFUSE/BLOCK | — | DO NOT fine-tune: keep as rules + calibrated threshold. The 115 corpus cases are a TEST set, not training data; ESCALATE is about missing information; a wrong AUTO has asymmetric cost | — | — |
| (e) contract / remittance extraction → JSON | document → schema | the only real small-LLM SFT candidate: distil from Claude, keep outputs passing schema + kernel | kernel/schema pass | 200-500 |

## Recommendation
- PRIMARY: GBT models for (b) and (d) from features exported from SQLite; served via small Python sidecar or ONNX export into Node. Minutes on CPU; demonstrable inside 24h.
- STRETCH: LoRA SFT of Qwen3.5-4B or 9B on Together for (e) only; under $5, under an hour; deploy dedicated endpoint only for the demo, tear down after.

## Pipeline stages
1 Export traces from SQLite → JSONL (inputs, candidate set, proposal, kernel verdict, human correction, period, entity ids).
2 Filter = rejection sampling, STaR / ReST-EM style (arXiv 2203.14465, 2312.06585): kernel is the verifier, Claude is the teacher. Keep kernel-pass traces not later corrected. For corrected traces the human version is gold and the agent original is the rejected one (DPO pairs later). De-duplicate templated cases. Weight human corrections above kernel passes (kernel pass = structurally valid, NOT judgment correct).
3 Split BY TIME: train Apr-May, calibrate June, test July. ALSO hold out whole vendors and customers so the model cannot memorise names. Seeded fixtures risk: model learns the generator — report on held-out entities.
4 Train.
5 Evaluate vs compiled-rule tier and vs Claude: top-1 and recall@3 for ranking, precision at the auto-clear threshold, cost and latency per decision.
6 Calibrate: temperature scaling (arXiv 1706.04599) or isotonic on June; choose threshold giving gte 99% precision; below threshold → ABSTAIN → next tier up.
7 Shadow: predicts on every decision, logs agreement with the accepted answer, posts nothing.
8 Promote per task and per scope: gte N shadow decisions, agreement above bar, zero kernel failures. Kernel still re-checks everything after promotion.
9 Monitor: kernel-reject rate, human-override rate, confidence distribution, share of new vendors.
10 Retrain trigger: override rate crosses threshold or K new corrections; each new model goes back through shadow.

## Datasets
BenchRec (Kaggle, Operartis, ICAIF 2023; obfuscated fields limit transfer; row counts UNVERIFIED) · FinBalance (arXiv 2606.15949; eval benchmark, 710 records, not training data) · ciru-ai/invoice-sandbox-benchmark (deterministic generator: 110 invoice PDFs, eml archives, bank CSVs with distractors, CRM aliases, answer key; no licence file) · Checkbook LA UNVERIFIED.

## Pitfalls
Negatives must come from the real candidate set (random negatives make it look easy) · hosted LoRA endpoints bill while idle · the demo needs a number: shadow-mode agreement rate and cost per decision vs Claude, not "we fine-tuned a model".
