import { existsSync } from "node:fs";
import { flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { systemClock } from "../runtime/config.js";
import { openDb } from "../runtime/db.js";
import { rebuildLadder } from "./autonomy.js";
import { approvePolicy, compilePolicies } from "./compile.js";
import { harvestLiveOutcomes } from "./harvest.js";
import { replay } from "./replay.js";

const USAGE = "usage: pnpm learn <db> [--function ar] [--replay] [--approve-as <approver id>]";

/**
 * Learn from the month so far: cut decision points from what people approved, compile repeated judgment into policy
 * drafts with their backtests, and rebuild the ladder. `--replay` first re-runs the closed periods in code (no model
 * call). Drafts do nothing until approved; `--approve-as` approves every draft that passed its backtest, for a demo.
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ["replay"]);
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : USAGE);
    return 1;
  }
  const db = openDb(dbPath);
  const fn = flagString(args, "function") ?? "ar";
  if (args.flags.replay === true) {
    const rows = await replay(db, { investigators: [], function: fn });
    out(`replayed ${rows.length} closed decision(s) in code: ${rows.filter((r) => r.diff.agrees).length} agree with what the humans booked`);
  }
  out(`harvested ${harvestLiveOutcomes(db).length} decision point(s) from entries people approved this month`);
  const approver = flagString(args, "approve-as");
  for (const d of compilePolicies(db, systemClock, fn)) {
    out(`\ndraft: ${d.name}`);
    out(`  backtest: matched ${d.backtest.n}, humans did exactly this ${d.backtest.agree}, other account ${d.backtest.account_outliers.length}, would have mis-cleared ${d.backtest.regressions.length}`);
    if (!d.policy_id) out(`  REFUSED: ${d.refused_reason ?? "no reason recorded"}`);
    else if (approver) out(`  ${d.policy_id}: ${JSON.stringify(approvePolicy(db, systemClock, d.policy_id, approver))}`);
    else out(`  ${d.policy_id}: proposed. Approve with: pnpm inbox ${dbPath} approve-policy ${d.policy_id} --as <approver id>`);
  }
  out("\nladder (precision per kind of entry; auto needs 95% on at least 5 covered decisions)");
  for (const r of rebuildLadder(db, systemClock)) {
    out(`  ${r.function}/${r.kind}: ${r.agree}/${r.n} agreed · covered ${r.covered_agree}/${r.covered_n} → ${r.level}`);
  }
  return 0;
}

runCli(main);
