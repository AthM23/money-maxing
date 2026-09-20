# Ablation: how much model, how much data (for Preet, on the GX10)

Written 20 Sep 2026, 04:07 EDT by lane A, at Karan's ask: the fine-tune beat should read as research, not as one
run. Two curves do that, and the small runs are minutes on the GB10. **The workspace's Model page draws both curves
by itself the moment `ft/data/ablation_v2.json` exists**; until then it shows nothing about them.

## What to run, smallest first (stop whenever time runs out; any prefix of this is usable)

Same recipe as the headline (`ft/train_lora.py`: LoRA r=16, alpha=32, all-linear, 3 epochs, lr 1e-4 cosine, bf16),
same test slice and scorer (`ft/benchmark.py`, strict-v2, n=120, no schema hint).

| # | Contender name | Base model | Training rows | Why |
|---|---|---|---|---|
| 1 | `size-0.6b` | `Qwen/Qwen3-0.6B` | all 956 | the floor: does a model this small learn the format at all |
| 2 | `size-1.7b` | `Qwen/Qwen3-1.7B` | all 956 | the middle of the size curve |
| 3 | `data-25` | `Qwen/Qwen3-4B-Instruct-2507` | first 239 (25%) | how little data gets most of the way |
| 4 | `data-50` | `Qwen/Qwen3-4B-Instruct-2507` | first 478 (50%) | the middle of the data curve |
| 5 | `size-4b` and `data-100` | the adapter you already have (`run1/adapter`) | all 956 | no training: benchmark it twice under both names |

The names matter: the page reads `size-<billions>b` and `data-<percent>` out of the file's keys.

## One small edit to `ft/train_lora.py` (it always uses every row)

`--base` is already there (Preet, 04:13). The data curve needs one more flag:

```python
ap.add_argument("--train-rows", type=int, default=0)   # 0 = all
# after train, cal, test = load(...):
if a.train_rows: train = train[:a.train_rows]          # the file's order is the generator's, fixed by seed 7
```

Qwen3-0.6B and 1.7B are the hybrid "thinking" models (there is no 2507 instruct release below 4B). Train and
evaluate them with thinking off, as the `tiny` row was run before, or the output is a `<think>` block and not JSON.

## Commands

```bash
# train (each writes <out>/adapter)
python ft/train_lora.py --base Qwen/Qwen3-0.6B --out /ws/out/size-0.6b
python ft/train_lora.py --base Qwen/Qwen3-1.7B --out /ws/out/size-1.7b
python ft/train_lora.py --train-rows 239 --out /ws/out/data-25
python ft/train_lora.py --train-rows 478 --out /ws/out/data-50

# evaluate: one output file, merged run by run (the script refuses to mix scorers or test slices)
B=Qwen/Qwen3-4B-Instruct-2507
python ft/benchmark.py --out ft/data/ablation_v2.json \
  --adapter size-0.6b=Qwen/Qwen3-0.6B:/ws/out/size-0.6b/adapter \
  --adapter size-1.7b=Qwen/Qwen3-1.7B:/ws/out/size-1.7b/adapter \
  --adapter size-4b=$B:/ws/out/run1/adapter --adapter data-100=$B:/ws/out/run1/adapter \
  --adapter data-25=$B:/ws/out/data-25/adapter --adapter data-50=$B:/ws/out/data-50/adapter
git add ft/data/ablation_v2.json && git commit -m "Ablation: size and data, strict-v2, n=120" && git push
```

## Also worth ten minutes each, if the box is free

- The per-epoch checkpoints (`ours-ep1`, `ours-ep2`) and `Qwen/Qwen3-0.6B` untouched, re-run under strict-v2 into
  `ft/data/benchmark_results_v2.json`. The old file has them under the withdrawn scorer, so they cannot be quoted;
  under v2 they are the training curve.
- Muse Spark with the schema hint under strict-v2, in a file: the 0.942 on the marketing page is only in a commit message.

## What to say whatever comes out

A flat curve is a result too: "a quarter of the data gets 0.9x" is the argument that a customer's own few hundred
documents are enough; "0.6B collapses" is the argument for 4B. Report every row with its n, including the ugly ones.
