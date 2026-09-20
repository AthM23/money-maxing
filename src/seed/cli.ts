import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_STORES_DIR } from "../connectors/local.js";
import { dbPath, openWorldDb, resetDb } from "../ledger/db.js";
import { DEFAULT_SEED, generateWorld } from "./generate.js";
import { seedLocal, writeStores } from "./local.js";
import { ANSWER_KEY_PATH, WORLD_PATH } from "./paths.js";
import { World } from "./world.js";

const TARGETS = ["world", "local", "quickbooks", "gmail", "slack", "all"] as const;
type Target = (typeof TARGETS)[number];

interface Args { target: Target; reset: boolean; seed: number }

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const target = (get("target") ?? "local") as Target;
  if (!TARGETS.includes(target)) throw new Error(`--target must be one of ${TARGETS.join(", ")}`);
  return { target, reset: argv.includes("--reset"), seed: Number(get("seed") ?? DEFAULT_SEED) };
}

const log = (s: string): void => { process.stdout.write(`${s}\n`); };

/** Regenerate only when asked (target world) or missing: the committed file is the canonical world. */
function loadWorld(args: Args): World {
  if (args.target === "world" || !existsSync(WORLD_PATH)) {
    const { world, answerKey } = generateWorld(args.seed);
    mkdirSync(dirname(WORLD_PATH), { recursive: true });
    writeFileSync(WORLD_PATH, `${JSON.stringify(world, null, 2)}\n`);
    writeFileSync(ANSWER_KEY_PATH, `${JSON.stringify(answerKey, null, 2)}\n`);
    log(`wrote ${WORLD_PATH} (seed ${args.seed}) and ${ANSWER_KEY_PATH} (gitignored)`);
    return world;
  }
  return World.parse(JSON.parse(readFileSync(WORLD_PATH, "utf8")));
}

/** `pnpm seed --target=<world|local|quickbooks|gmail|slack|all> [--reset] [--seed=N]` */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const world = loadWorld(args);
  const wants = (t: Target): boolean => args.target === t || args.target === "all";

  if (wants("local")) {
    const path = dbPath();
    if (args.reset && resetDb(path) === "wiped") log("local: database is open elsewhere (console?), so tables were wiped in place");
    const db = openWorldDb(path);
    const r = seedLocal(db, world);
    writeStores(world, DEFAULT_STORES_DIR);
    log(`local: ${r.parties} parties, ${r.invoices} invoices, ${r.bills} bills, ${r.gl_entries} GL entries, ${r.decision_points} Q2 decision points → ${path}; stores → ${DEFAULT_STORES_DIR}`);
    db.close();
  }
  if (wants("quickbooks")) {
    const { QboClient, qboConfigFromEnv } = await import("../connectors/qboClient.js");
    const { seedQuickBooks } = await import("./quickbooks.js");
    const db = openWorldDb(dbPath());
    const counts = await seedQuickBooks(db, world, new QboClient(qboConfigFromEnv()), { reset: args.reset, log });
    log(`quickbooks: ${JSON.stringify(counts)}`);
    db.close();
  }
  if (wants("gmail")) {
    const { seedGmail } = await import("../connectors/gmail.js");
    log(`gmail: ${JSON.stringify(await seedGmail(world, { reset: args.reset, log }))}`);
  }
  if (wants("slack")) {
    const { seedSlack } = await import("../connectors/slack.js");
    // Slack has no reset: a bot cannot delete other history, and seeding skips world ids already posted.
    log(`slack: ${JSON.stringify(await seedSlack(world, { log }))}`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  // Slack names the scopes it wanted; pass that on instead of a bare "missing_scope"
  const slack = (err as { data?: { needed?: string; provided?: string } }).data;
  if (slack?.needed) process.stderr.write(`Slack scopes needed: ${slack.needed} · token has: ${slack.provided}\n`);
  process.exit(1);
});
