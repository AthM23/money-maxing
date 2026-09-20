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
  by_family: z.record(z.string(), z.object({ n: z.number(), settled: z.number() })).optional(),
});
/** The two smaller heads of lane C's benchmark: which open invoice a bank line pays, and which GL account a bill goes to. */
const Matcher = z.object({
  n_test_txns: z.number(), top1: z.number(), recall_at_3: z.number(), threshold_source: z.string(), n_cal_txns: z.number(),
  test_auto_clear_coverage: z.number(), test_auto_clear_precision: z.number(), test_false_auto_clears: z.number(), n_train_pairs: z.number(),
});
const Coder = z.object({ n_test: z.number(), acc_all: z.number(), acc_seen_vendor: z.number(), n_seen: z.number(), acc_unseen_vendor: z.number(), n_unseen: z.number() });
const SandboxDoc = z.object({ kind: z.string(), void: z.boolean().optional(), revised: z.boolean().optional(), model_parse_ok: z.boolean().optional() });

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

/**
 * A benchmark this team did not build: ciru-ai's Invoice Sandbox (cited in the track brief). Its own scorer wrote
 * `score_output.txt`; `audit.json` is one row per PDF the model read. Both are read as they are.
 */
function external(root: string, problems: string[]): unknown {
  const path = "ft/data/sandbox/score_output.txt";
  const full = join(root, path);
  if (!existsSync(full)) {
    problems.push(`${path}: not in this checkout`);
    return null;
  }
  const lines = readFileSync(full, "utf8").split(/\r?\n/).map((l) => l.trim());
  const scores = new Map(lines.filter((l) => /^[a-z_]+,[-\d.]+$/.test(l)).map((l) => l.split(",") as [string, string]));
  const scored = Number(scores.get("customers_scored")), exact = Number(scores.get("customers_exact"));
  if (!Number.isFinite(scored) || !Number.isFinite(exact) || scored <= 0) {
    problems.push(`${path}: the scorer's output does not state customers_scored and customers_exact`);
    return null;
  }
  const missed = lines.slice(lines.indexOf("Mismatches:") + 2).filter((l) => /^[A-Z]\d+,/.test(l)).map((l) => l.split(",")).map(([customer, expected, actual, error]) => ({ customer, expected_usd: Number(expected), actual_usd: Number(actual), error_usd: Number(error) }));
  const docs = read(root, "ft/data/sandbox/audit.json", z.array(SandboxDoc), problems);
  const kinds: Record<string, number> = {};
  for (const d of docs ?? []) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
  return { name: "ciru-ai Invoice Sandbox Benchmark", customers_scored: scored, customers_exact: exact, total_absolute_error_usd: Number(scores.get("total_absolute_error_usd") ?? NaN), missed,
    documents: docs ? { n: docs.length, kinds, void: docs.filter((d) => d.void).length, revised: docs.filter((d) => d.revised).length, parsed: docs.filter((d) => d.model_parse_ok).length } : null };
}

/**
 * Optional: a size and data ablation, if lane C has run one (`context/ABLATION_PLAN.md`). Same scorer and test slice as
 * the headline, written by the same `ft/benchmark.py`. Contenders are named `size-<billions>b` (the base model's
 * size, all of the training data) and `data-<percent>` (the 4B model on that share of the training rows). Absent,
 * nothing is shown: a missing experiment is not advertised.
 */
function ablation(root: string, problems: string[]): unknown {
  const path = "ft/data/ablation_v2.json";
  if (!existsSync(join(root, path))) return null;
  const file = read(root, path, Bench, problems);
  if (!file) return null;
  const pick = (pattern: RegExp): { x: number; key: string; field_f1: number; exact: number; held_out_f1: number | null }[] => Object.entries(file.models)
    .flatMap(([key, m]) => { const hit = pattern.exec(key); return hit ? [{ x: Number(hit[1]), key, field_f1: m.field_f1, exact: m.exact, held_out_f1: m.held_out_f1 ?? null }] : []; })
    .sort((a, b) => a.x - b.x);
  const bySize = pick(/^size-([\d.]+)b$/), byData = pick(/^data-(\d+)$/);
  return bySize.length + byData.length === 0 ? null : { scorer: file.protocol.scorer, n: file.protocol.n, by_size: bySize, by_data: byData };
}

/** `root` is the checkout the result files are read from; only a test passes another one. */
export function modelView(root: string = ROOT): unknown {
  const problems: string[] = [];
  return { recipe: RECIPE, data: read(root, "ft/data/manifest.json", Manifest, problems), extraction: extraction(root, problems), fresh: read(root, "ft/data/fresh_exam_result.json", Fresh, problems), seen: read(root, "ft/data/seen_exam_result.json", Fresh, problems), harness: harness(root, problems),
    matcher: read(root, "ft/data/gbt_report_v2.json", Matcher, problems), coder: read(root, "ft/data/coding_report.json", Coder, problems), external: external(root, problems), ablation: ablation(root, problems), problems };
}
