import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * The document reader's report card. This page computes nothing: every figure is read from a result file that lane
 * C's benchmark (`ft/benchmark.py`, `ft/fresh_run.py`) or the harness's own reader bench (`pnpm bench:reader`) wrote,
 * and is shown with its n. A file that is missing or does not parse is named on the page with the reason; no figure is
 * filled in.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const Score = z.object({
  n: z.number(), schema_valid: z.number().nullable(), exact: z.number(), field_f1: z.number(),
  held_out_n: z.number().optional(), held_out_exact: z.number().optional(), held_out_f1: z.number().optional(),
  avg_latency_s: z.number().nullable().optional(), model: z.string().optional(),
});
const Bench = z.object({ protocol: z.object({ scorer: z.string(), n: z.number(), hint: z.boolean().optional(), test_sha256: z.string().optional(), note: z.string().optional() }), models: z.record(z.string(), Score) });
const Fresh = z.object({
  protocol: z.object({ scorer: z.string(), data: z.string() }),
  result: z.object({ n: z.number(), schema_valid: z.number(), exact: z.number(), field_f1: z.number(), docs_per_min: z.number(), effective_s_per_doc: z.number(), tokens_per_s_aggregate: z.number(), avg_batch_size: z.number(), errors: z.number() }),
});
const Manifest = z.object({
  seed: z.number(), sft_counts: z.object({ train: z.number(), cal: z.number(), test: z.number() }),
  held_out_customers: z.array(z.string()), held_out_vendors: z.array(z.string()), test_only_families: z.array(z.string()), honesty_note: z.string().optional(),
});
const ReaderRun = z.object({
  reader: z.string(), n: z.number(), settled_from_code: z.number(), applied_deduction_open: z.number(), left_for_judgment: z.number(),
  wrong_postings: z.number(), books_tied: z.boolean(), avg_latency_ms: z.number(), refusal_reasons: z.record(z.string(), z.number()),
});

/** How the adapter was trained. Read off `ft/train_lora.py`; nothing here is measured. */
const RECIPE = {
  source: "ft/train_lora.py",
  base_model: "Qwen/Qwen3-4B-Instruct-2507",
  licence: "Apache-2.0 open weights",
  adapter: "LoRA · r=16 · alpha=32 · every linear layer",
  training: "3 epochs · lr 1e-4, cosine · batch 2 × 8 accumulation · bf16 · max length 4,096",
  hardware: "one ASUS Ascent GX10 (GB10), trained and served on it",
};

/** The contenders of the extraction benchmark, in the order they are shown. `ours` is the row to look at. */
const CONTENDERS: { file: string; key: string; label: string; note: string; ours?: true }[] = [
  { file: "ft/data/benchmark_results_v2.json", key: "base4b", label: "Qwen3-4B, not fine-tuned", note: "the same open model before our training" },
  { file: "ft/data/benchmark_v2_haiku.json", key: "haiku-bare", label: "Claude Haiku 4.5", note: "same prompt as ours, no schema given" },
  { file: "ft/data/benchmark_v2_haiku.json", key: "haiku-hinted", label: "Claude Haiku 4.5 + schema", note: "the full JSON schema pasted into every prompt" },
  { file: "ft/data/benchmark_results_v2.json", key: "ours", label: "Qwen3-4B + our LoRA", note: "no schema in the prompt: it learned the format", ours: true },
];

/** One result file. What cannot be shown is written down in `problems`, so the page says which file and why. */
function read<S extends z.ZodType>(root: string, path: string, schema: S, problems: string[]): z.infer<S> | null {
  const full = join(root, path);
  if (!existsSync(full)) {
    problems.push(`${path}: not in this checkout`);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, "utf8"));
  } catch (err) {
    problems.push(`${path}: not JSON (${err instanceof Error ? err.message.slice(0, 80) : "unreadable"})`);
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) problems.push(`${path}: not the expected shape (${parsed.error.issues[0]?.path.join(".") ?? "root"})`);
  return parsed.success ? parsed.data : null;
}

function extraction(root: string, problems: string[]): unknown {
  const files = new Map<string, z.infer<typeof Bench> | null>();
  for (const c of CONTENDERS) if (!files.has(c.file)) files.set(c.file, read(root, c.file, Bench, problems));
  const rows = CONTENDERS.flatMap((c) => {
    const score = files.get(c.file)?.models[c.key];
    return score ? [{ key: c.key, label: c.label, note: c.note, ours: c.ours === true, ...score }] : [];
  });
  const local = files.get("ft/data/benchmark_results_v2.json");
  if (rows.length === 0 || !local) return null;
  return { scorer: local.protocol.scorer, n: local.protocol.n, test_sha256: local.protocol.test_sha256 ?? null, api_note: files.get("ft/data/benchmark_v2_haiku.json")?.protocol.note ?? null, rows };
}

/** Every reader the harness was benchmarked with, each at the largest n it was run on. */
function harness(root: string, problems: string[]): unknown {
  const dir = join(root, "runs/reader-bench");
  if (!existsSync(dir)) {
    problems.push("runs/reader-bench: not in this checkout");
    return null;
  }
  const best = new Map<string, z.infer<typeof ReaderRun>>();
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const run = read(root, join("runs/reader-bench", name), ReaderRun, problems);
    if (run && run.reader !== "smoke" && run.n >= 100 && run.n >= (best.get(run.reader)?.n ?? 0)) best.set(run.reader, run);
  }
  const order = ["no reader", "Qwen3-4B base", "saboteur (deliberately wrong, not a model)", "Qwen3-4B + our LoRA", "oracle (gold labels, not a model)"];
  const rows = [...best.values()].sort((a, b) => order.indexOf(a.reader) - order.indexOf(b.reader));
  return rows.length ? { rows } : null;
}

/** `root` is the checkout the result files are read from; only a test passes another one. */
export function modelView(root: string = ROOT): unknown {
  const problems: string[] = [];
  return { recipe: RECIPE, data: read(root, "ft/data/manifest.json", Manifest, problems), extraction: extraction(root, problems), fresh: read(root, "ft/data/fresh_exam_result.json", Fresh, problems), harness: harness(root, problems), problems };
}
