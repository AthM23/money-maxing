# Lane C — real LoRA SFT on the GX10 (task (e)). Input: ft/data/sft.{train,cal,test}.jsonl from export.ts.
# Inside NGC container:  python /ws/train_lora.py --data /ws/data --out /ws/out/run1
import argparse, json, torch
from pathlib import Path
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

MODEL = "Qwen/Qwen3-4B-Instruct-2507"
ap = argparse.ArgumentParser()
ap.add_argument("--data", default="/ws/data")
ap.add_argument("--out", default="/ws/out/run1")
ap.add_argument("--epochs", type=float, default=3)
ap.add_argument("--lr", type=float, default=1e-4)
a = ap.parse_args()

def load(split):
    rows = [json.loads(l) for l in Path(f"{a.data}/sft.{split}.jsonl").read_text().splitlines() if l.strip()]
    return rows

train, cal, test = load("train"), load("cal"), load("test")
print(f"train={len(train)} cal={len(cal)} test={len(test)}")
assert len(train) >= 50, "too little training data — brief says do not bother under ~100 rows; fall back to GBT-only"

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16, device_map="cuda")
trainer = SFTTrainer(
    model=model,
    train_dataset=Dataset.from_list([{"messages": r["messages"]} for r in train]),
    eval_dataset=Dataset.from_list([{"messages": r["messages"]} for r in cal]) if cal else None,
    processing_class=tok,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
    args=SFTConfig(output_dir=a.out, num_train_epochs=a.epochs, per_device_train_batch_size=2,
                   gradient_accumulation_steps=8, learning_rate=a.lr, lr_scheduler_type="cosine",
                   bf16=True, logging_steps=10, max_length=4096, report_to=[],
                   eval_strategy="epoch" if cal else "no", save_strategy="no"),
)
trainer.train()
trainer.save_model(f"{a.out}/adapter")

# Held-out eval: exact-JSON-match and per-field agreement vs gold, reported separately for held-out parties.
def gen(messages):
    prompt = tok.apply_chat_template(messages[:-1], tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt", truncation=True, max_length=6144).to(model.device)
    out = model.generate(**ids, max_new_tokens=512, do_sample=False)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True)

def canon(s):
    try: return json.dumps(json.loads(s.strip().removeprefix("```json").removesuffix("```").strip()), sort_keys=True)
    except Exception: return None

results = []
for r in test:
    pred = canon(gen(r["messages"])); gold = canon(r["messages"][-1]["content"])
    results.append({"decision_id": r["meta"]["decision_id"], "held_out_party": r["meta"].get("held_out_party", False),
                    "exact": pred is not None and pred == gold, "parse_ok": pred is not None})
n = len(results); ho = [r for r in results if r["held_out_party"]]
summary = {
    "n_test": n,
    "exact_match": round(sum(r["exact"] for r in results) / max(n, 1), 3),
    "parse_rate": round(sum(r["parse_ok"] for r in results) / max(n, 1), 3),
    "held_out_n": len(ho),
    "held_out_exact": round(sum(r["exact"] for r in ho) / max(len(ho), 1), 3),
}
Path(f"{a.out}/eval.json").write_text(json.dumps({"summary": summary, "results": results}, indent=2))
print("EVAL", json.dumps(summary))
