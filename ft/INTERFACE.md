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

## Lane A's side of this interface (added by Person A, 2026-09-19 23:40 ET)

Wired. `FT_ENDPOINT_URL` alone switches it on (`src/reader/openaiCompat.ts`; 30 s limit, then the case goes on
without the reading). The model is used as a **remittance reader**, one step before the code tier, when the drift
monitor cannot tell which invoices a payment is for. Code then decides whether to believe the reading
(`src/worker/readRemittances.ts`), and the kernel re-checks the allocation against the customer's own words at every
gate (`E_REMIT`, free-form mode). Vendor bills and contract clauses are not consumed by the harness yet.

**Two commands lane A could not run: this machine is not on the tailnet, so the endpoint timed out from here.**
From a machine that can reach the GX10 (the repo, `pnpm install`, nothing else):

```bash
# server started WITHOUT --adapter
pnpm bench:reader --n 200 --reader-url http://100.73.102.120:8000/v1 --reader-model qwen --reader-name "Qwen3-4B base"
# server started WITH --adapter
pnpm bench:reader --n 200 --reader-url http://100.73.102.120:8000/v1 --reader-model qwen --reader-name "Qwen3-4B + our LoRA"
```

It rebuilds a ledger from the held-out remittances in `ft/data/sft.test.jsonl`, runs the real worker, and checks
every posting against what the customer wrote; exit code 2 on any wrong posting; results land in
`runs/reader-bench/`. Already measured at n = 200: no reader settles 0; a perfect reader settles 168 and applies the
other 32 with the claimed deduction left open; a deliberately wrong reader settles 0; wrong postings 0 in all three.
That table with your two rows in it is the system-level result: what the fine-tune is worth **to the harness**,
not only in field F1.

On withholding tax: option (b) is already how it works. That case has one invoice and its reason is a judgment, so it
goes to the investigator, not the reader. Option (a) is welcome but not needed for the demo.
