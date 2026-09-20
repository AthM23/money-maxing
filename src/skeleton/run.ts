import { existsSync } from "node:fs";
import type { Investigator } from "../agents/investigator.js";
import { runCase } from "../agents/runCase.js";
import { poll } from "../bus/bus.js";
import { buildConnectors, liveFromArgv, type LiveSource } from "../connectors/index.js";
import { closeSettledIntents, driftOnce } from "../drift/monitor.js";
import { ingestAll } from "../ingest/ingest.js";
import { dbPath, openWorldDb, type Db } from "../ledger/db.js";
import { bankUnmatched } from "../ledger/read.js";
import { readControlTotals } from "../runtime/kernelContext.js";
import { WORLD_PATH } from "../seed/paths.js";

export interface SkeletonRow { intent_id: string; bank_txn_id: string | undefined; question: string; routes: string[]; final_route: string | null; tier: number; intent_status: string }

/**
 * The Phase 1 walking skeleton, one pass, no long-running process: sources → ingestion → drift → intent →
 * router (tier 0 in code, then model tiers if a key is set) → propose_entry → kernel → ledger. The console reads
 * the same database. Each stage talks to the next only through tables and the event bus.
 */
export async function runSkeleton(db: Db, opts: { stores_dir?: string; investigators?: Investigator[]; live?: ReadonlySet<LiveSource> } = {}): Promise<SkeletonRow[]> {
  await ingestAll(db, await buildConnectors(opts.live, opts.stores_dir));
  await driftOnce(db);
  const rows: SkeletonRow[] = [];
  // AR's seat on the bus: every unmatched credit is a case for the router.
  await poll(db, "ar-dispatch", ["bankrec.unmatched"], async (e) => {
    if (e.payload.side !== "credit" || !e.intent_id) return;
    const intent = db.prepare("SELECT question, case_json FROM intent WHERE id = ?").get(e.intent_id) as { question: string; case_json: string };
    const result = await runCase(db, JSON.parse(intent.case_json), { mode: "live", autonomy_level: "auto", investigators: opts.investigators ?? [] });
    rows.push({ intent_id: e.intent_id, bank_txn_id: e.payload.bank_txn_id as string | undefined, question: intent.question, routes: result.routes, final_route: result.final_route, tier: result.tier_used, intent_status: "open" });
  });
  closeSettledIntents(db);
  for (const r of rows) r.intent_status = (db.prepare("SELECT status FROM intent WHERE id = ?").get(r.intent_id) as { status: string }).status;
  return rows;
}

async function main(): Promise<number> {
  const db = openWorldDb(dbPath());
  const seeded = (db.prepare("SELECT COUNT(*) AS n FROM seed_manifest WHERE system = 'local'").get() as { n: number }).n;
  if (seeded === 0 || !existsSync(WORLD_PATH)) {
    process.stderr.write("database is not seeded. Run: pnpm seed --target=local --reset\n");
    return 1;
  }
  let investigators: Investigator[] = [];
  if (process.env.ANTHROPIC_API_KEY) investigators = (await import("../agents/sdk.js")).defaultTiers();
  else process.stdout.write("ANTHROPIC_API_KEY not set: tier 0 (code) only. Anything that needs judgment stays open.\n\n");

  const rows = await runSkeleton(db, { investigators, live: liveFromArgv(process.argv) });
  for (const r of rows) {
    process.stdout.write(`${(r.bank_txn_id ?? "").padEnd(9)} ${(r.routes.join("+") || "-").padEnd(14)} tier ${r.tier}  ${r.intent_status.padEnd(9)} ${r.question}\n`);
  }
  const c = readControlTotals(db);
  process.stdout.write(`\n${rows.length} cases this pass · bank lines still unmatched: ${bankUnmatched(db).length} · AR GL ${c.ar_gl_cents} vs subledger ${c.ar_subledger_cents} (${c.ar_gl_cents === c.ar_subledger_cents ? "tied" : "NOT TIED"})\n`);
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("src/skeleton/run.ts")) {
  main().then((code) => process.exit(code), (err: unknown) => { console.error(err); process.exit(1); });
}
