# Lane C — micro-batching server: same OpenAI-compatible API as serve.py, but concurrent requests
# are gathered for up to 120 ms and run through the GPU as ONE padded batch. Decoding is memory-bound
# on GB10, so a batch of 8 costs barely more wall time than a batch of 1: per-document throughput
# improves roughly linearly with concurrency until compute saturates.
#   ~/ftenv/bin/python serve_batch.py --adapter ~/ft/out/run1/adapter --port 8000 --max-batch 8
import argparse, asyncio, time, torch, uvicorn
from fastapi import FastAPI
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
ap.add_argument("--adapter", default=None)
ap.add_argument("--port", type=int, default=8000)
ap.add_argument("--max-batch", type=int, default=8)
ap.add_argument("--gather-ms", type=int, default=120)
a = ap.parse_args()

tok = AutoTokenizer.from_pretrained(a.model, padding_side="left")
model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16, device_map="cuda")
if a.adapter: model = PeftModel.from_pretrained(model, a.adapter)
model.eval()

queue: asyncio.Queue = asyncio.Queue()

async def batcher():
    while True:
        first = await queue.get()
        batch = [first]
        t0 = time.time()
        while len(batch) < a.max_batch and (time.time() - t0) * 1000 < a.gather_ms:
            try: batch.append(queue.get_nowait())
            except asyncio.QueueEmpty: await asyncio.sleep(0.01)
        prompts = [tok.apply_chat_template(b["messages"], tokenize=False, add_generation_prompt=True,
                                           enable_thinking=False) for b in batch]
        max_new = max(b.get("max_tokens", 512) for b in batch)
        enc = tok(prompts, return_tensors="pt", padding=True, truncation=True, max_length=6144).to(model.device)
        t1 = time.time()
        with torch.no_grad():
            out = await asyncio.to_thread(model.generate, **enc, max_new_tokens=max_new, do_sample=False,
                                          pad_token_id=tok.pad_token_id or tok.eos_token_id)
        dt = int((time.time() - t1) * 1000)
        for i, b in enumerate(batch):
            text = tok.decode(out[i][enc.input_ids.shape[1]:], skip_special_tokens=True)
            b["future"].set_result({
                "id": "ft-batch", "object": "chat.completion",
                "model": f"{a.model}{'+lora' if a.adapter else ''}",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": int(enc.input_ids.shape[1]),
                          "completion_tokens": int(out.shape[1] - enc.input_ids.shape[1]),
                          "latency_ms": dt, "batch_size": len(batch), "cost_micros": 0}})

app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def start(): asyncio.create_task(batcher())

@app.post("/v1/chat/completions")
async def chat(body: dict):
    fut = asyncio.get_event_loop().create_future()
    await queue.put({**body, "future": fut})
    return await fut

@app.post("/v1/extract")
def extract(body: dict):
    # PDF text extraction next to the model: the pipeline page uploads a PDF, we hand back its text layer.
    import base64, io
    from pypdf import PdfReader
    try:
        pdf = base64.b64decode(body.get("pdf_b64", ""))
        rd = PdfReader(io.BytesIO(pdf))
        text = "\n".join((p.extract_text() or "") for p in rd.pages[:6]).strip()
        return {"text": text[:6000], "pages": len(rd.pages), "empty": not text}
    except Exception as e:
        return {"error": str(e)[:200]}

@app.get("/health")
def health(): return {"ok": True, "batching": a.max_batch}

uvicorn.run(app, host="0.0.0.0", port=a.port)
