# Audit correction — 19 September 2026

The historical figures below use the old harness and are **not validated results for the corrected code**.
The audit found that the GBT operating threshold was selected using test labels, arbitrary JSON was counted as
schema-valid, malformed completions could crash scoring, and result rows could silently mix prompt conditions
or datasets. Those defects are fixed. Missing cost information now reads `unknown`, not $0.

Re-run each contender before quoting a score. `benchmark.py` now writes `benchmark_results_v2.json` with a
`protocol` (scorer version, exact test-slice SHA-256, hint condition, n) and `models`. It refuses incompatible
merges. Use separate `--out` files for bare and hinted prompts. The corrected field-F1 includes container
structure and exact value types, so old scores are not directly comparable.

`train_gbt.py` freezes its threshold from the calibration split, then reports actual test precision, coverage,
and false clears, including transactions with no correct candidate. A 99% calibration target is not a guarantee
of 99% test precision. Head B splits by hashed transaction ID; the time-split claim below applies to extraction,
not this matching baseline. Calibration also fits the isotonic map, so a separate operating-point validation set
would strengthen this small experiment.

Verified locally: four dependency-free scoring/protocol tests and all 1,546 generated test labels self-grade as
schema-valid exact matches. That checks the scorer, **not model accuracy or label inferability**. No model/API
benchmark was run during this audit; `scikit-learn` is absent from the local Python environment.
The production remittance path currently parses a defined email table; it does not invoke the fine-tune.

---

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

## Results v1 (measured 2026-09-20 ~00:20, n=120 stratified test slice, GX10)

| model | exact | field-F1 | held-out F1 | latency | cost |
|---|---|---|---|---|---|
| **Qwen3-4B + our LoRA (ep3)** | 0.692 | **0.960** | **0.964** | 6.3 s | $0 local |
| ours ep2 | 0.700 | 0.958 | 0.957 | 6.3 s | $0 local |
| Muse Spark 1.3 + schema hint | 0.767 | 0.957 | 0.967 | 6.7 s | API |
| ours ep1 | 0.658 | 0.953 | 0.955 | 6.3 s | $0 local |
| Muse Spark 1.3 bare | 0.000 | 0.140 | 0.155 | 8.1 s | API |
| Qwen3-4B base bare | 0.000 | 0.084 | 0.094 | 6.4 s | $0 local |
| Qwen3-0.6B bare | 0.000 | 0.010 | 0.014 | 1.3 s | $0 local |

Readings: one epoch does most of the work (0.084 → 0.953); the fine-tune ties/beats Muse *without* the
schema in the prompt; held-out ≈ overall for every row (no memorization signal); Muse keeps the edge on
exact-match (0.767 vs 0.692) — reported, not hidden. Latency is unoptimized `transformers.generate`;
serving-path numbers will differ and will be reported separately.

## Honest-numbers rule

Every reported number carries its n. Unflattering rows (unseen-vendor coding at 38.9%, Muse bare at
0.14) stay in the table — they are the argument for calibration, abstention and escalation, not noise.
