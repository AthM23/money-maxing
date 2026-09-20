# Lane C — model benchmark harness (sheet 21 stage 6: "a falsifiable comparison").
# One frozen test set, many contenders, one table. Two stories it produces:
#   1. PROGRESSION: base model → epoch-1 → epoch-2 → epoch-3 checkpoints of OUR fine-tune (same test set)
#   2. COMPARISON: our tuned model vs other local models (Qwen sizes, anything on disk) vs API models
#      (Muse / Claude / GPT via any OpenAI-compatible endpoint) — accuracy, latency, $/call.
#
# Run inside the NGC container on the GX10 (local models) and/or anywhere (API models):
#   python benchmark.py --data /ws/data --limit 120 \
#     --local base=Qwen/Qwen3-4B-Instruct-2507 \
#     --local tiny=Qwen/Qwen3-0.6B \
#     --adapter ours-ep1=Qwen/Qwen3-4B-Instruct-2507:/ws/out/run1/checkpoint-ep1 \
#     --adapter ours=Qwen/Qwen3-4B-Instruct-2507:/ws/out/run1/adapter \
#     --api muse=env:MUSE_BASE_URL,MUSE_API_KEY,MUSE_MODEL \
#     --api haiku=env:ANTHROPIC_BASE_URL,ANTHROPIC_KEY,claude-haiku-4-5
# Results merge into --out (benchmark_results.json): rerunning adds/updates contenders, never drops rows,
# so API models can be benchmarked from the Mac and local models on the GX10 into the same file.
import argparse, hashlib, json, time, urllib.request
from collections import defaultdict
from scoring import SCORER_VERSION, score
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="ft/data")
ap.add_argument("--out", default=None)
ap.add_argument("--limit", type=int, default=120)
ap.add_argument("--local", action="append", default=[])    # name=hf_id
ap.add_argument("--adapter", action="append", default=[])  # name=hf_id:adapter_path
ap.add_argument("--api", action="append", default=[])      # name=env:BASE_URL_VAR,KEY_VAR,model
ap.add_argument("--hint", action="store_true", help="append the JSON schema to every prompt (fair zero-shot condition)")
a = ap.parse_args()
if a.limit < 1: ap.error("--limit must be positive")

SCHEMA_HINT = """
Output schema (use EXACTLY these keys; amounts are INTEGER CENTS, dates ISO YYYY-MM-DD):
- remittance: {"doc_kind":"remittance","payer":str,"date":str,"amount_cents":int,"applications":[{"invoice":str,"amount_cents":int}],"discount_pct":int,"discount_cents":int,"method":"ACH"|"wire"|"check","ref":str}
- vendor_bill: {"doc_kind":"vendor_bill","vendor":str,"date":str,"amount_cents":int,"period":str,"terms_days":int,"ref":str}
- contract_clause: {"doc_kind":"contract_clause","payer":str,"date":str,"amount_cents":int,"billing":str,"discount_pct":int,"escalator_pct":int,"ref":str}"""
out_path = Path(a.out or f"{a.data}/benchmark_results_v2.json")

rows = [json.loads(l) for l in Path(f"{a.data}/sft.test.jsonl").read_text().splitlines() if l.strip()]
# Deterministic round-robin over actual strata, including held-out families.
strata = defaultdict(list)
for row in rows:
    key = (row["meta"].get("family", ""), bool(row["meta"].get("held_out_party")), bool(row["meta"].get("test_only_family")))
    strata[key].append(row)
for group in strata.values():
    group.sort(key=lambda row: hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest())
test = []
while len(test) < a.limit and any(strata.values()):
    for key in sorted(strata):
        if strata[key] and len(test) < a.limit: test.append(strata[key].pop(0))
if not test: ap.error("test dataset is empty")
protocol = {"scorer": SCORER_VERSION, "hint": a.hint, "n": len(test),
            "test_sha256": hashlib.sha256(json.dumps(test, sort_keys=True).encode()).hexdigest()}

def with_hint(messages):
    if not a.hint: return messages
    m = [dict(x) for x in messages]
    m[0]["content"] = m[0]["content"].replace("as JSON.", "as JSON." + SCHEMA_HINT, 1)
    return m

def evaluate(name, gen_fn, price_per_mtok=None):
    per, t_lat = [], []
    for r in test:
        t0 = time.time()
        try: text, toks = gen_fn(with_hint(r["messages"][:-1]))
        except Exception as e: text, toks = f"ERROR {e}", 0
        lat = time.time() - t0; t_lat.append(lat)
        s = score(text, r["messages"][-1]["content"])
        s["held_out"] = r["meta"].get("held_out_party", False) or r["meta"].get("test_only_family", False)
        s["tokens"] = toks
        per.append(s)
    n = len(per); ho = [x for x in per if x["held_out"]]
    agg = lambda xs, k: round(sum(x[k] for x in xs) / max(len(xs), 1), 3)
    res = {"n": n, "schema_valid": agg(per, "schema_valid"), "exact": agg(per, "exact"),
           "field_f1": agg(per, "field_f1"), "held_out_n": len(ho), "held_out_exact": agg(ho, "exact"),
           "held_out_f1": agg(ho, "field_f1"), "avg_latency_s": round(sum(t_lat) / max(n, 1), 2),
           "est_cost_usd": None if price_per_mtok is None else round(sum(x["tokens"] for x in per) / 1e6 * price_per_mtok, 4),
           "ts": time.strftime("%H:%M")}
    print(name, json.dumps(res))
    return res

saved = json.loads(out_path.read_text()) if out_path.exists() else None
if saved is not None and saved.get("protocol") != protocol:
    ap.error("output contains a different dataset, prompt condition, or scorer; choose a new --out file")
results = saved["models"] if saved else {}

# ---- local HF models (GX10) -------------------------------------------------
if a.local or a.adapter:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    def hf_gen(model, tok):
        def go(messages):
            try:
                prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
            except TypeError:
                prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            ids = tok(prompt, return_tensors="pt", truncation=True, max_length=6144).to(model.device)
            with torch.no_grad():
                o = model.generate(**ids, max_new_tokens=512, do_sample=False)
            text = tok.decode(o[0][ids.input_ids.shape[1]:], skip_special_tokens=True)
            # gpt-oss wraps the answer in harmony channels; keep only the final message.
            if "<|message|>" in text: text = text.split("<|message|>")[-1]
            text = text.replace("<|return|>", "").strip()
            # with special tokens stripped, the channel name itself can remain glued to the JSON: final{...}
            i = text.rfind("final{")
            if i != -1: text = text[i + len("final"):]
            return text, int(o.shape[1])
        return go
    for spec in a.local:
        name, hf_id = spec.split("=", 1)
        tok = AutoTokenizer.from_pretrained(hf_id)
        m = AutoModelForCausalLM.from_pretrained(hf_id, dtype=torch.bfloat16, device_map="cuda")
        results[name] = {**evaluate(name, hf_gen(m, tok)), "kind": "local", "model": hf_id}
        del m; torch.cuda.empty_cache()
    for spec in a.adapter:
        name, rest = spec.split("=", 1); hf_id, ad = rest.split(":", 1)
        from peft import PeftModel
        tok = AutoTokenizer.from_pretrained(hf_id)
        m = AutoModelForCausalLM.from_pretrained(hf_id, dtype=torch.bfloat16, device_map="cuda")
        m = PeftModel.from_pretrained(m, ad)
        results[name] = {**evaluate(name, hf_gen(m, tok)), "kind": "local+lora", "model": f"{hf_id}+{ad}"}
        del m; torch.cuda.empty_cache()

# ---- API models (OpenAI-compatible; Muse / Claude / GPT gateways) -----------
import os
for spec in a.api:
    name, cfg = spec.split("=", 1)
    base_var, key_var, model_id = cfg.removeprefix("env:").split(",")
    base, key = os.environ.get(base_var, ""), os.environ.get(key_var, "")
    if not base or not key:
        print(f"skip {name}: {base_var}/{key_var} not set"); continue
    def api_gen(messages, base=base, key=key, model_id=model_id):
        payload = {"model": model_id, "messages": messages, "max_tokens": 1536, "temperature": 0}
        if "muse" in model_id or "spark" in model_id:
            payload["reasoning_effort"] = "low"  # else Spark spends the whole budget thinking and returns content:null
        body = json.dumps(payload).encode()
        req = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=body,
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as resp:
            j = json.loads(resp.read())
        u = j.get("usage", {})
        return j["choices"][0]["message"]["content"], u.get("prompt_tokens", 0) + u.get("completion_tokens", 0)
    results[name] = {**evaluate(name, api_gen), "kind": "api", "model": model_id}

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps({"protocol": protocol, "models": results}, indent=2))
hdr = f"{'model':16} {'exact':>6} {'f1':>6} {'held-out f1':>11} {'lat(s)':>7} {'$':>7}"
print("\n" + hdr + "\n" + "-" * len(hdr))
for k, v in sorted(results.items(), key=lambda kv: -kv[1]["field_f1"]):
    print(f"{k:16} {v['exact']:>6} {v['field_f1']:>6} {v['held_out_f1']:>11} {v['avg_latency_s']:>7} {str(v['est_cost_usd']) if v['est_cost_usd'] is not None else 'unknown':>7}")
