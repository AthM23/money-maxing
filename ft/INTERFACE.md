# Lane C → Lane A: the fine-tuned model interface (live now)

**Endpoint (running on the GX10 at the table):** `http://100.73.102.120:8000/v1/chat/completions`
(Tailscale IP; from any team machine on the tailnet. Health: `GET /health`.)

OpenAI-compatible. One env var in the router and zero other coupling:

```
FT_ENDPOINT_URL=http://100.73.102.120:8000/v1
```

## Contract

- **Request**: standard chat body. The prompt must open with the task instruction
  `Extract every field from this finance document as JSON. Amounts are integer cents. Respond with JSON only.`
  followed by the raw document text. No schema needed in the prompt — the model was trained on it.
- **Response**: `choices[0].message.content` is JSON with keys per doc kind
  (`remittance` / `vendor_bill` / `contract_clause` — full schema in [BENCHMARK.md](./BENCHMARK.md)).
  `usage` carries real `latency_ms` and `cost_micros: 0` — log them onto `decision_step` like any tier.
- **Trust**: treat output as a tier-1 *proposal input*, exactly like a Claude call — zod-validate, then
  kernel. Measured field-F1 0.960 / schema-valid 1.0 on held-out data, but nothing bypasses the kernel.
- **Abstention**: tier policy — on zod/kernel reject or timeout (>30 s), escalate to `claude-haiku-4-5`.
  (Confidence-threshold abstention is calibrated for the GBT head; for the LLM head, reject-and-escalate
  is the same behavior expressed at the kernel boundary.)
- **Withholding-tax case**: the current adapter has NOT seen withholding-tax remittances. Two options,
  pick at the shared checkpoint: (a) I add that template family to the generator and retrain — measured
  cost is ~15 min on the GX10 — or (b) the international case routes straight to Claude and the model
  covers the domestic volume. Say the word and (a) ships before morning.

## Measured results backing this (full table: `data/benchmark_results.json`, pushed)

base Qwen3-4B F1 0.084 → **+LoRA 0.960** (held-out 0.964, schema-valid 100%) · Muse-hinted 0.957 ·
progression 0.953/0.958/0.960 by epoch · Qwen3-0.6B floor 0.010. n=120 stratified, held-out entities
and never-seen template families included.
