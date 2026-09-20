# GX10 local fine-tune plan (Preet's lane) — 2026-09-19 19:55 ET

**Status: proposed by Preet with a Claude Code session. Supersedes one fact in
[`architecture-briefs/fine-tuning.md`](./architecture-briefs/fine-tuning.md): "Team machine has NO NVIDIA GPU."
We checked out an ASUS Ascent GX10 from the ASUS hardware booth.** Everything else in that brief stands —
in particular: GBT baseline is PRIMARY, the LLM fine-tune targets task (e) extraction (plus (f) triage if data
allows), routes stay rules, shadow-only today, and the demo number is agreement rate + cost per decision, not
"we fine-tuned a model."

## What the GX10 is (and why it changes the plan)

NVIDIA GB10 Grace Blackwell superchip: 20-core Arm CPU + Blackwell GPU, **128 GB unified LPDDR5x**
(~273 GB/s), up to ~1 PFLOP sparse FP4, aarch64, ships with DGX OS (Ubuntu-based) and CUDA preinstalled.
Same silicon as DGX Spark, so **NVIDIA's DGX Spark playbooks apply directly** (fine-tuning with
TRL/PEFT, llama.cpp, vLLM, Ollama all have published Spark guides). Practical implications:

- The hosted-LoRA route (Together/Fireworks/Modal) from the brief is **no longer needed**: no upload of our
  traces, no per-minute endpoint billing, no idle-endpoint pitfall, works even if venue Wi-Fi dies.
- 128 GB unified memory means a 4B-class QLoRA/LoRA SFT is comfortable (fits in bf16 with LoRA, no
  memory gymnastics), and we can **serve the tuned model locally** with an OpenAI-compatible endpoint.
- Memory bandwidth is the constraint, not FLOPs: 4B-class serving is fast enough for router tier-1 latency
  numbers; don't plan on serving anything ≥30B for the demo.
- aarch64 caveat: install nothing bare-metal from PyPI that needs custom CUDA kernels. **Use NGC containers**
  (see setup below). If a wheel fights us for >30 min, fall back per the ladder at the bottom.

## Three builders again

Spec §10 planned three lanes; ROADMAP re-cut for two when only Karan and Atharv were assigned. Preet is
the third. Proposal — **A (Karan) and B (Atharv) keep their ROADMAP lanes unchanged**; the items A was
carrying that are actually lane-C items move to Preet:

| Lane C (Preet) owns | Comes from |
|---|---|
| GX10 setup, NGC containers, model downloads (tonight, before venue closes) | new |
| Trace-export → JSONL script (`ft/export.ts`, reads SQLite, writes prompt/completion pairs) | A's Phase 3 ⏱ item |
| Rejection-sampling filter + time/entity split (brief stages 2-3) | A's Phase 3 ⏱ item |
| GBT pair-feature baseline for (b) matching and (d) coding (CPU, minutes) | A's Phase 3 item |
| LoRA SFT on GX10 for (e) extraction; calibrate; **shadow-only** eval vs base vs Claude | A's Phase 4 item |
| Local serving endpoint + router tier-1 wiring (OpenAI-compatible, one env var for A's router) | new |
| Cost/latency per decision numbers, run 1 vs run 2 → Token Company story | shared with A |
| Stretch (cut 1st, per ROADMAP): autoresearch-style overnight loop D on the GX10 | A's stretch |

This un-loads A's overnight so replay/compile and the eval harness get full attention, and it removes cut #4's
pressure: the fine-tune can no longer block anything, because nobody on the critical path owns it.

## Setup (do this NOW, ~45 min, mostly downloads)

```bash
# on the GX10 (DGX OS). 1) sanity
nvidia-smi                                  # GB10 visible
docker run --rm --gpus all nvcr.io/nvidia/pytorch:25.08-py3 python -c "import torch; print(torch.cuda.get_device_name())"

# 2) pull what we need while bandwidth is free
docker pull nvcr.io/nvidia/pytorch:25.08-py3          # training (TRL/PEFT install inside)
docker pull ghcr.io/ggml-org/llama.cpp:server-cuda    # serving fallback
# hf CLI on host:
pip install -U "huggingface_hub[cli]"
hf download Qwen/Qwen3-4B-Instruct-2507                # primary SFT target
hf download Qwen/Qwen3-4B-Instruct-2507-GGUF q8_0     # llama.cpp serving fallback (if published; else quantize locally)

# 3) training env inside the container
docker run --gpus all -it -v $PWD:/ws nvcr.io/nvidia/pytorch:25.08-py3 bash
pip install trl peft datasets accelerate bitsandbytes  # bitsandbytes optional; bf16 LoRA fits without it
```

Verify tonight with a 20-example smoke SFT on dummy data **before** real traces exist. If the smoke run
doesn't work by ~23:00, drop to the fallback ladder and stop spending time on it.

## Training recipe (task (e): document → schema JSON, distilled from Claude)

- **Data**: A's runtime already stores every decision's traces. Export pairs where input = raw doc text
  (contract clause / remittance email / bill PDF text) + tool-visible context, target = the schema JSON that
  **passed zod + kernel and was not later corrected** (rejection sampling, kernel as verifier, Claude as
  teacher — brief stage 2). Human-corrected versions are gold over agent originals. 200-500 examples expected
  from Q2 seed + July run 1.
- **Split by time and entity** (brief stage 3): train Apr-May, calibrate June, test July; hold out whole
  vendors/customers. Seeded-world risk stands: report held-out-entity numbers only.
- **Hyperparams**: Qwen3-4B-Instruct, LoRA r=16 α=32 on attn+MLP, bf16, lr 1e-4 cosine, 2-3 epochs,
  effective batch 16 via grad accumulation, max_seq 4096. On GB10 this is minutes-to-tens-of-minutes per
  run — cheap enough to sweep lr × epochs overnight if idle.
- **Eval** (before any router wiring): exact-schema-match and field-level F1 vs base Qwen and vs
  `claude-haiku-4-5` on the July held-out set; then temperature-scale on June, pick threshold for ≥99%
  precision, below → ABSTAIN → next tier (brief stage 6). **Shadow only today** (stage 7); promotion criteria
  exist in the brief but are out of scope for the demo.

## Serving + router wiring

vLLM (NGC/Spark container) or `llama.cpp --server` on the GX10, OpenAI-compatible on the table LAN.
A's router tier-1 gets `FT_ENDPOINT_URL`; if unset, tier 1 is skipped — zero coupling. Log per-call latency
and tokens into `decision.cost_micros`/`model_calls` like every other tier.

**Token Company framing**: tier-0 compiled hits cost $0; tier-1 local model costs $0 marginal (own
hardware, measured watts if we're feeling cute); frontier calls are the only paid tokens. Report the paid-token
curve run 1 → run 2. **ASUS framing**: model trained and served on ASUS hardware at the table — check
whether ASUS challenge submission stacks with Maximor before listing it on Plume (Long Lake rules say
one track; sponsor challenges appear stackable, verify at the booth).

## Autoresearch loop (stretch, cut 1st — unchanged)

Cloned https://github.com/karpathy/autoresearch locally for reference. Its shape (agent edits one file →
fixed 5-min budget → keep/discard by metric) is what sheet 20 loop D already describes; on the GX10 the
budgeted metric would be held-out extraction F1 with kernel/scorer/labels read-only. Only start it if the SFT
pipeline is green AND run 1 finished AND nothing else needs the GPU. Do not let it touch the posting path.

## Fallback ladder (30-min rule per rung)

1. NGC PyTorch container + TRL/PEFT on GX10 (primary).
2. Unsloth's published DGX Spark Docker image (they shipped Spark support; same recipe).
3. llama.cpp LoRA finetune on GX10 (crude but ARM-proof).
4. MLX LoRA on Preet's M5 MacBook (mlx-lm, Qwen 4B fits) — slower, zero CUDA risk.
5. Cut to GBT baseline only (ROADMAP cut #4) — the demo still has a shadow-tier number.
