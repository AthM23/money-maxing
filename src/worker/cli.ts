import { existsSync } from "node:fs";
import { defaultTiers } from "../agents/sdk.js";
import { selectController } from "../agents/selectController.js";
import { flagInt, flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { printScoreboard } from "../cli/printScoreboard.js";
import { loadEnv } from "../env.js";
import { scoreboard } from "../learn/scoreboard.js";
import { openDb } from "../runtime/db.js";
import { reviewParked } from "./reviewParked.js";
import { runOpenIntents } from "./runOpenIntents.js";

const USAGE = "usage: pnpm worker <db> [--code-only] [--review] [--function ar] [--limit N]";

/**
 * One pass over the open intents in a seeded database. `--code-only` runs tier 0 alone and costs nothing;
 * without it the model tiers run and cost money. `--review` sends what parked to the controller once.
 * Before the first pass the database is copied to `<db>.cold`, so the same month can be run again from cold.
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ["code-only", "review"]);
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : USAGE);
    return 1;
  }
  loadEnv();
  const codeOnly = args.flags["code-only"] === true;
  if ((!codeOnly || args.flags.review === true) && !process.env.ANTHROPIC_API_KEY) {
    warn("ANTHROPIC_API_KEY is not set (put it in .env). Use --code-only to run tier 0 alone.");
    return 1;
  }
  const db = openDb(dbPath);
  const cold = `${dbPath}.cold`;
  if (!existsSync(cold)) {
    await db.backup(cold);
    out(`cold copy kept at ${cold}`);
  }
  const investigators = codeOnly ? [] : defaultTiers();
  const report = await runOpenIntents(db, {
    investigators, function: flagString(args, "function"), limit: flagInt(args, "limit"),
    onWorked: (w) => out(`${w.intent_id}: ${w.routes.join(" → ") || "(no route)"} · tier ${w.tier_used} · ${w.status} · ${w.elapsed_ms} ms${w.error ? ` · ERROR ${w.error}` : ""}`),
  });
  for (const s of report.skipped) warn(`skipped ${s.intent_id}: ${s.reason}`);
  if (args.flags.review === true) {
    const controller = selectController();
    for (const r of await reviewParked(db, controller, investigators)) out(`review ${r.decision_id}: ${r.loop.first.status}${r.loop.revised_decision_id ? ` → revised ${r.loop.revised_decision_id}` : ""}`);
  }
  printScoreboard("scoreboard", scoreboard(db, flagString(args, "function")));
  out(`\nnext: pnpm inbox ${dbPath} list`);
  return report.worked.some((w) => w.error) ? 1 : 0;
}

runCli(main);
