import { readFileSync } from "node:fs";
import { openDb } from "../runtime/db.js";
import { runCase } from "./runCase.js";
import { defaultTiers } from "./sdk.js";

/** `tsx src/agents/cli.ts <db path> <case.json>` — run one case file against a seeded database with the real model tiers. */
async function main(): Promise<number> {
  const [dbPath, casePath] = process.argv.slice(2);
  if (!dbPath || !casePath) {
    process.stderr.write("usage: tsx src/agents/cli.ts <db path> <case.json>\n");
    return 1;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write("ANTHROPIC_API_KEY is not set; the model tiers cannot run. Tier 0 still works through runCase in code.\n");
    return 1;
  }
  const db = openDb(dbPath);
  const result = await runCase(db, JSON.parse(readFileSync(casePath, "utf8")), { mode: "live", autonomy_level: "auto", investigators: defaultTiers() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

main().then((code) => process.exit(code), (err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
