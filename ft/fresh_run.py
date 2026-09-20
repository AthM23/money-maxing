# Lane C — fresh-seed exam through the batched endpoint: one run measures BOTH
# (a) accuracy on documents that did not exist until tonight (anti-memorization proof)
# (b) real parallel throughput of serve_batch.py under sustained load.
#   python3 ft/fresh_run.py --data ft/data_fresh --endpoint http://100.73.102.120:8000 --concurrency 8
import argparse, asyncio, json, time
from pathlib import Path
import urllib.request
import importlib.util
spec = importlib.util.spec_from_file_location("scoring", Path(__file__).parent / "scoring.py")
scoring = importlib.util.module_from_spec(spec); spec.loader.exec_module(scoring)

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="ft/data_fresh")
ap.add_argument("--endpoint", default="http://100.73.102.120:8000")
ap.add_argument("--concurrency", type=int, default=8)
ap.add_argument("--limit", type=int, default=0)
a = ap.parse_args()

rows = [json.loads(l) for l in open(f"{a.data}/sft.test.jsonl") if l.strip()]
if a.limit: rows = rows[: a.limit]
print(f"{len(rows)} fresh documents, concurrency {a.concurrency}")

def call(messages):
    body = json.dumps({"messages": messages, "max_tokens": 700}).encode()
    req = urllib.request.Request(a.endpoint + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=300).read())
    return j["choices"][0]["message"]["content"] or "", j["usage"]

async def worker(q, out):
    loop = asyncio.get_event_loop()
    while True:
        try: i, r = q.get_nowait()
        except asyncio.QueueEmpty: return
        try:
            text, usage = await loop.run_in_executor(None, call, r["messages"][:-1])
            s = scoring.score(text, r["messages"][-1]["content"])
            s["tokens"] = usage.get("completion_tokens", 0); s["batch"] = usage.get("batch_size", 1)
        except Exception as e:
            s = {"schema_valid": 0, "exact": 0, "field_f1": 0.0, "tokens": 0, "batch": 0, "err": str(e)[:80]}
        s["held_out"] = r["meta"].get("held_out_party", False) or r["meta"].get("test_only_family", False)
        out.append(s)
        if len(out) % 50 == 0: print(f"  {len(out)} done")

async def main():
    q = asyncio.Queue()
    for i, r in enumerate(rows): q.put_nowait((i, r))
    out = []
    t0 = time.time()
    await asyncio.gather(*[worker(q, out) for _ in range(a.concurrency)])
    wall = time.time() - t0
    n = len(out); toks = sum(x["tokens"] for x in out)
    agg = lambda k: round(sum(x[k] for x in out) / max(n, 1), 3)
    res = {"n": n, "schema_valid": agg("schema_valid"), "exact": agg("exact"), "field_f1": agg("field_f1"),
           "wall_s": round(wall, 1), "docs_per_min": round(n / wall * 60, 1),
           "effective_s_per_doc": round(wall / n, 2), "tokens_per_s_aggregate": round(toks / wall, 1),
           "avg_batch_size": round(sum(x["batch"] for x in out) / max(n, 1), 1),
           "errors": sum(1 for x in out if "err" in x)}
    print("FRESH_EXAM", json.dumps(res))
    Path("ft/data/fresh_exam_result.json").write_text(json.dumps(
        {"protocol": {"scorer": getattr(scoring, "SCORER_VERSION", "v2"), "data": "seed-99 fresh, zero overlap"},
         "result": res}, indent=1))

asyncio.run(main())
