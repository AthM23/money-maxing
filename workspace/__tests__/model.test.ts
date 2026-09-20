import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { modelView } from "../model.js";

interface Row { key: string; ours: boolean; n: number; field_f1: number; exact: number; schema_valid: number | null }
interface View { extraction: { n: number; scorer: string; rows: Row[] } | null; fresh: unknown; data: unknown; harness: unknown; problems: string[] }

describe("the Model page reads measured result files and invents nothing", () => {
  it("shows the fine-tune beside the same model untouched, each with its n, from the files in this checkout", () => {
    const v = modelView() as View;
    const ours = v.extraction?.rows.find((r) => r.ours);
    const base = v.extraction?.rows.find((r) => r.key === "base4b");
    expect(ours).toBeDefined();
    expect(base).toBeDefined();
    expect(ours!.n).toBe(v.extraction!.n);
    for (const r of v.extraction!.rows) for (const x of [r.field_f1, r.exact, r.schema_valid ?? 0]) expect(x >= 0 && x <= 1).toBe(true);
    expect(ours!.field_f1).toBeGreaterThan(base!.field_f1);
  });

  it("names every file it could not show, and fills in no figure for it", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-model-"));
    mkdirSync(join(root, "ft/data"), { recursive: true });
    writeFileSync(join(root, "ft/data/manifest.json"), "{ not json");
    writeFileSync(join(root, "ft/data/fresh_exam_result.json"), JSON.stringify({ protocol: { scorer: "strict-v2" }, result: {} }));
    const v = modelView(root) as View;
    expect([v.extraction, v.fresh, v.data, v.harness]).toEqual([null, null, null, null]);
    expect(v.problems.some((p) => p.startsWith("ft/data/manifest.json: not JSON"))).toBe(true);
    expect(v.problems.some((p) => p.startsWith("ft/data/fresh_exam_result.json: not the expected shape"))).toBe(true);
    expect(v.problems).toContain("ft/data/benchmark_results_v2.json: not in this checkout");
    expect(v.problems).toContain("runs/reader-bench: not in this checkout");
  });
});
