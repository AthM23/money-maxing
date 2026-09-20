# Lane C — minimal OpenAI-compatible endpoint for the tuned model on the GX10 (router tier 1).
# Deliberately dependency-light and ARM-proof (transformers only, no vLLM). Fine for demo latency on a 4B.
# Inside NGC container:  pip install fastapi uvicorn peft && python /ws/serve.py --adapter /ws/out/run1/adapter
import argparse, time, torch, uvicorn
from fastapi import FastAPI
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
ap.add_argument("--adapter", default=None)
ap.add_argument("--port", type=int, default=8000)
a = ap.parse_args()

tok = AutoTokenizer.from_pretrained(a.model)
model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16, device_map="cuda")
if a.adapter:
    model = PeftModel.from_pretrained(model, a.adapter)
model.eval()
app = FastAPI()

@app.post("/v1/chat/completions")
def chat(body: dict):
    t0 = time.time()
    prompt = tok.apply_chat_template(body["messages"], tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt", truncation=True, max_length=8192).to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=body.get("max_tokens", 512), do_sample=False)
    text = tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True)
    return {"id": "ft-local", "object": "chat.completion", "model": f"{a.model}+lora" if a.adapter else a.model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": int(ids.input_ids.shape[1]),
                      "completion_tokens": int(out.shape[1] - ids.input_ids.shape[1]),
                      "latency_ms": int((time.time() - t0) * 1000), "cost_micros": 0}}

@app.get("/health")
def health(): return {"ok": True}

uvicorn.run(app, host="0.0.0.0", port=a.port)
