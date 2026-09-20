# Smoke test for the GX10 fine-tune path (lane C). Proves: model loads on GB10, LoRA SFT runs,
# adapter saves, generation works. Dummy data on purpose — real traces replace it via export.ts.
# Run inside the NGC container: see smoke_run.sh.
import json, torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

MODEL = "Qwen/Qwen3-4B-Instruct-2507"

# 20 toy remittance→JSON examples, shape matches task (e) extraction
rows = []
for i in range(20):
    doc = f"Remittance advice #{1000+i}: Payment of ${(i+1)*137}.50 from Initech Corp for invoice INV-{200+i}, dated 2026-07-{(i%28)+1:02d}."
    out = {"payer": "Initech Corp", "amount_cents": ((i+1)*13750), "invoice": f"INV-{200+i}", "date": f"2026-07-{(i%28)+1:02d}"}
    rows.append({"messages": [
        {"role": "user", "content": f"Extract the remittance fields as JSON.\n\n{doc}"},
        {"role": "assistant", "content": json.dumps(out)},
    ]})

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16, device_map="cuda")
print(f"loaded on {model.device}, {sum(p.numel() for p in model.parameters())/1e9:.1f}B params")

trainer = SFTTrainer(
    model=model,
    train_dataset=Dataset.from_list(rows),
    processing_class=tok,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
    args=SFTConfig(output_dir="/ws/out/smoke", max_steps=20, per_device_train_batch_size=2,
                   gradient_accumulation_steps=2, learning_rate=1e-4, bf16=True, logging_steps=5,
                   max_length=1024, report_to=[]),
)
trainer.train()
trainer.save_model("/ws/out/smoke/adapter")

prompt = tok.apply_chat_template(
    [{"role": "user", "content": "Extract the remittance fields as JSON.\n\nRemittance advice #9999: Payment of $412.00 from Wayne Enterprises for invoice INV-777, dated 2026-07-15."}],
    tokenize=False, add_generation_prompt=True)
ids = tok(prompt, return_tensors="pt").to(model.device)
out = model.generate(**ids, max_new_tokens=80, do_sample=False)
print("GENERATION:", tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True))
print("SMOKE OK")
