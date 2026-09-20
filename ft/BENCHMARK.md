# NorthwindBench — the benchmark behind the fine-tune headline

**Owner: Preet (lane C). Status: v1 defined 2026-09-19 ~22:00, per judge feedback v2 §4
([`../context/judge-feedback-v2-2026-09-19.md`](../context/judge-feedback-v2-2026-09-19.md)):
"create your own benchmark… run with our fine-tuned model, compared against open-source base models."**

In the spirit of AccountingBench (the track doc's reference points): fixed task set, hidden answers,
graded by code, reported with n — but scoped to the document-and-matching layer our tier-1 model owns.

## Tasks (three heads, all deterministic to grade)

| Head | Task | n (test) | Metric |
|---|---|---|---|
| E | finance document → schema JSON (remittances, vendor bills, contract clauses) | 1,546 (120-row stratified slice for slow/API models) | schema-valid rate · field-F1 · exact match |
| B | bank line → which open invoice(s) it pays | 93 txns / ~600 pairs | top-1 · recall@3 · auto-clear coverage @ ≥99% precision |
| D | vendor bill → GL account | 369 | accuracy, split seen-vendor vs unseen-vendor |

## Why the test set can't be gamed (judge-feedback §8 risks, answered)

1. **Split by time**: train Apr–May, calibrate June, test July. No shuffling across months.
2. **Held-out entities**: 18 customers + 5 vendors appear in NO training row; their scores are reported
   as a separate column.
3. **Held-out template families**: two document styles (OCR-noise, foreign layout) exist only in test —
   the model has never seen the *format*, not just the values.
4. **Label audit**: every label is machine-checked to be inferable from its document (0/3000 failures);
   a label the document doesn't state was a generator bug and was fixed, not shipped.
5. **Fair baselines**: zero-shot models are benchmarked twice — bare, and with the full JSON schema
   pasted into the prompt (`--hint`). We report the hinted number as the real comparison.
6. **Asymmetric cost**: the auto-clear metric charges wrong-but-confident far more than abstain —
   coverage is only counted at a calibrated ≥99% precision threshold. An unnecessary escalation costs
   coverage; a wrong auto-post would cost the demo claim itself (target: zero).

## Contenders

| Row | What it shows |
|---|---|
| GBT pair-features (CPU) | the floor an LLM must beat: 91.4% top-1 on head B |
| Qwen3-0.6B / Qwen3-4B base | open-weight zero-shot, bare and hinted |
| **Qwen3-4B + our LoRA (per-epoch checkpoints)** | the progression curve and the headline row |
| Muse Spark 1.3 (API) | frontier-lab small model: F1 0.14 bare (measured), hinted TBD; 8.1 s/doc |
| claude-haiku-4-5 / sonnet (API, needs Karan's key) | frontier reference, with $/decision |

All rows come from `benchmark.py` on the same frozen test slice; results merge into
`data/benchmark_results.json`, reruns update rows in place. The table prints ranked by field-F1 with
latency and estimated cost per row.

## Public-benchmark bridge (credibility beyond our own data)

Our generator grades us on our world. To anchor against something we didn't build, the plan (bandwidth
permitting) is to run the extraction head on **ciru-ai's Invoice Sandbox Benchmark** (synthetic AP inbox,
planted traps, hidden-answer grader — cited in the track doc) and report that number unmodified. If time
runs out, we say plainly: our benchmark is self-built, here is everything needed to re-run it
(`gen_data.py --seed 7` reproduces the exact test set).

## Honest-numbers rule

Every reported number carries its n. Unflattering rows (unseen-vendor coding at 38.9%, Muse bare at
0.14) stay in the table — they are the argument for calibration, abstention and escalation, not noise.
