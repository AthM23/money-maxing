import { copyFileSync, existsSync } from "node:fs";
import { defaultTiers } from "../agents/sdk.js";
import { flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { printComparison, printScoreboard } from "../cli/printScoreboard.js";
import { loadEnv } from "../env.js";
import { openDb } from "../runtime/db.js";
import { runOpenIntents } from "../worker/runOpenIntents.js";
import { carryMemory } from "./carry.js";
import { compareRuns, scoreboard } from "./scoreboard.js";

const USAGE = "usage: pnpm rerun <db> [--models] [--force] [--function ar]";

/**
 * Run the same month again from the cold copy, carrying over only what was learned (active facts, approved
 * policies, the ladder). Code only unless `--models`. The second run lands in `<db>.run2`; an existing one is
 * never overwritten without `--force`.
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ["models", "force"]);
  const dbPath = args.positional[0];
  const cold = `${dbPath}.cold`;
  if (!dbPath || !existsSync(dbPath) || !existsSync(cold)) {
    warn(!dbPath ? USAGE : `need both ${dbPath} and ${cold} (the cold copy is made by the first \`pnpm worker\` pass)`);
    return 1;
  }
  const run2Path = `${dbPath}.run2`;
  if (existsSync(run2Path) && args.flags.force !== true) {
    warn(`${run2Path} already exists; pass --force to replace it`);
    return 1;
  }
  loadEnv();
  if (args.flags.models === true && !process.env.ANTHROPIC_API_KEY) {
    warn("ANTHROPIC_API_KEY is not set (put it in .env); drop --models to run in code only.");
    return 1;
  }
  copyFileSync(cold, run2Path);
  const run1 = openDb(dbPath);
  const run2 = openDb(run2Path);
  out(`carried into ${run2Path}: ${JSON.stringify(carryMemory(run1, run2))}`);
  const fn = flagString(args, "function");
  await runOpenIntents(run2, {
    investigators: args.flags.models === true ? defaultTiers() : [], function: fn,
    onWorked: (w) => out(`${w.intent_id}: ${w.routes.join(" → ") || "(no route)"} · tier ${w.tier_used} · ${w.status}`),
  });
  const [s1, s2] = [scoreboard(run1, fn), scoreboard(run2, fn)];
  printScoreboard("run 1", s1);
  printScoreboard("run 2", s2);
  printComparison(compareRuns(s1, s2));
  return 0;
}

runCli(main);
