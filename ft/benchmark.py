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
import argparse, json, time, urllib.request
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="ft/data")
ap.add_argument("--out", default=None)
ap.add_argument("--limit", type=int, default=120)
ap.add_argument("--local", action="append", default=[])    # name=hf_id
ap.add_argument("--adapter", action="append", default=[])  # name=hf_id:adapter_path
ap.add_argument("--api", action="append", default=[])      # name=env:BASE_URL_VAR,KEY_VAR,model
a = ap.parse_args()
out_path = Path(a.out or f"{a.data}/benchmark_results.json")

rows = [json.loads(l) for l in Path(f"{a.data}/sft.test.jsonl").read_text().splitlines() if l.strip()]
# stable, stratified slice: alternate held-out-party and normal rows so every run sees the hard cases
rows.sort(key=lambda r: (not r["meta"].get("held_out_party", False), r["meta"].get("family", "")))
step = max(1, len(rows) // a.limit)
test = rows[::step][: a.limit]

def canon(s):
    s = s.strip()
    if s.startswith("```"): s = s.strip("`").removeprefix("json").strip()
    if "{" in s: s = s[s.index("{"): s.rindex("}") + 1]
    try: return json.loads(s)
    except Exception: return None

def flat(d, prefix=""):
    o = {}
    for k, v in (d or {}).items():
        if isinstance(v, dict): o.update(flat(v, f"{prefix}{k}."))
        elif isinstance(v, list):
            for i, x in enumerate(v):
                o.update(flat(x, f"{prefix}{k}[{i}].") if isinstance(x, dict) else {f"{prefix}{k}[{i}]": x})
        else: o[f"{prefix}{k}"] = v
    return o

def score(pred_text, gold_text):
    p, g = canon(pred_text), json.loads(gold_text)
    if p is None: return {"schema_valid": 0, "exact": 0, "field_f1": 0.0}
    fp, fg = flat(p), flat(g)
    hit = sum(1 for k, v in fg.items() if fp.get(k) == v)
    prec = hit / max(len(fp), 1); rec = hit / max(len(fg), 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-9)
    return {"schema_valid": 1, "exact": int(fp == fg), "field_f1": round(f1, 4)}

def evaluate(name, gen_fn, price_per_mtok=0.0):
    per, t_lat = [], []
    for r in test:
        t0 = time.time()
        try: text, toks = gen_fn(r["messages"][:-1])
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
           "est_cost_usd": round(sum(x["tokens"] for x in per) / 1e6 * price_per_mtok, 4),
           "ts": time.strftime("%H:%M")}
    print(name, json.dumps(res))
    return res

results = json.loads(out_path.read_text()) if out_path.exists() else {}

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
            return tok.decode(o[0][ids.input_ids.shape[1]:], skip_special_tokens=True), int(o.shape[1])
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
        body = json.dumps({"model": model_id, "messages": messages, "max_tokens": 512, "temperature": 0}).encode()
        req = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=body,
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as resp:
            j = json.loads(resp.read())
        u = j.get("usage", {})
        return j["choices"][0]["message"]["content"], u.get("prompt_tokens", 0) + u.get("completion_tokens", 0)
    results[name] = {**evaluate(name, api_gen), "kind": "api", "model": model_id}

out_path.write_text(json.dumps(results, indent=2))
hdr = f"{'model':16} {'exact':>6} {'f1':>6} {'held-out f1':>11} {'lat(s)':>7} {'$':>7}"
print("\n" + hdr + "\n" + "-" * len(hdr))
for k, v in sorted(results.items(), key=lambda kv: -kv[1]["field_f1"]):
    print(f"{k:16} {v['exact']:>6} {v['field_f1']:>6} {v['held_out_f1']:>11} {v['avg_latency_s']:>7} {v['est_cost_usd']:>7}")
