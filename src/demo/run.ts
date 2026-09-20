import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { reviewAndRevise } from "../agents/review.js";
import { runCase } from "../agents/runCase.js";
import { defaultTiers } from "../agents/sdk.js";
import { selectController } from "../agents/selectController.js";
import { loadEnv } from "../env.js";
import { openDb, type Db } from "../runtime/db.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { DEMO_CASES, seedDemoWorld } from "./seed.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };
const dollars = (micros: number): string => `$${(micros / 1_000_000).toFixed(4)}`;

/** `pnpm demo [caseId...]` — seed a fresh database, run the cases with the real model tiers, review what parked. */
async function main(): Promise<number> {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write("ANTHROPIC_API_KEY is not set. Put it in .env (git-ignored).\n");
    return 1;
  }
  const dir = join("runs", "demo");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `${new Date().toISOString().replaceAll(":", "-")}.db`);
  const db = openDb(dbPath);
  seedDemoWorld(db);
  const wanted = process.argv.slice(2);
  const cases = DEMO_CASES.filter((c) => wanted.length === 0 || wanted.includes(c.intent_id) || wanted.includes(c.party_id));
  out(`database: ${dbPath}`);
  for (const c of cases) {
    out(`\n=== ${c.party_id}: expected ${c.expected_cents}, received ${c.received_cents}, shortfall ${c.shortfall_cents} cents`);
    const started = Date.now();
    const r = await runCase(db, c, { mode: "live", autonomy_level: "auto", investigators: defaultTiers() });
    out(`routes ${r.routes.join(" → ") || "(none)"} · judgment route ${r.final_route ?? "none"} · tier ${r.tier_used} · ${Date.now() - started} ms`);
    if (r.report) out(`agent: ${r.report.outcome} — ${r.report.summary}`);
    if (r.decision_id) printDecision(db, r.decision_id);
  }
  await reviewParked(db);
  const t = readControlTotals(db);
  out(`\nAR control ${t.ar_gl_cents} vs subledger ${t.ar_subledger_cents}: ${t.ar_gl_cents === t.ar_subledger_cents ? "tied" : "NOT TIED"}`);
  out(`\nnext: pnpm inbox ${dbPath} list`);
  return 0;
}

function printDecision(db: Db, decisionId: string): void {
  const d = db.prepare("SELECT route, tier, model_calls, cost_micros FROM decision WHERE id = ?").get(decisionId) as
    { route: string | null; tier: number | null; model_calls: number; cost_micros: number };
  out(`decision ${decisionId}: route ${d.route ?? "-"}, tier ${d.tier ?? "-"}, model turns ${d.model_calls}, cost ${dollars(d.cost_micros)}`);
  const steps = db.prepare("SELECT tool FROM decision_step WHERE decision_id = ? AND kind = 'tool_call' ORDER BY step_no").all(decisionId) as { tool: string }[];
  out(`tools: ${steps.map((s) => s.tool).join(", ") || "(none)"}`);
  const wp = db.prepare("SELECT marks_json, kernel_verdict FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1").get(decisionId) as
    { marks_json: string; kernel_verdict: string } | undefined;
  if (!wp) return;
  const marks = (JSON.parse(wp.marks_json) as { marks: { check: string; status: string }[] }).marks;
  out(`kernel: ${wp.kernel_verdict} · ${marks.map((m) => `${m.check}${m.status === "pass" ? "✓" : m.status === "fail" ? "✗" : "~"}`).join(" ")}`);
}

async function reviewParked(db: Db): Promise<void> {
  const parked = db.prepare("SELECT id FROM decision WHERE mode = 'live' AND route = 'PROPOSE' AND posted_at IS NULL").all() as { id: string }[];
  if (parked.length === 0) return;
  const controller = selectController();
  out(`\n=== controller review (${controller.id}) of ${parked.length} parked decision(s)`);
  for (const p of parked) {
    const loop = await reviewAndRevise(db, controller, p.id, defaultTiers());
    out(`${p.id}: ${loop.first.status}${"verdict" in loop.first ? ` — ${loop.first.verdict.note}` : ""}`);
    if (!loop.revised_decision_id) continue;
    out(`  revised by a stronger tier → ${loop.revised_decision_id}`);
    printDecision(db, loop.revised_decision_id);
    if (loop.second) out(`  second review: ${loop.second.status}${"verdict" in loop.second ? ` — ${loop.second.verdict.note}` : ""}`);
  }
}

main().then((code) => process.exit(code), (err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
