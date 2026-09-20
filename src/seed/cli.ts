import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_STORES_DIR } from "../connectors/local.js";
import { dbPath, openWorldDb, resetDb } from "../ledger/db.js";
import { DEFAULT_SEED, generateWorld } from "./generate.js";
import { generateGlobalJuly } from "./globalJuly.js";
import { seedLocal, writeStores } from "./local.js";
import { WORLDS, worldName, type WorldName } from "./paths.js";
import { applySlackUserMap, slackUserMapFromEnv } from "./slackUsers.js";
import { World } from "./world.js";

const TARGETS = ["world", "local", "quickbooks", "gmail", "slack", "all"] as const;
type Target = (typeof TARGETS)[number];

interface Args { target: Target; reset: boolean; seed: number; world: WorldName }

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const target = (get("target") ?? "local") as Target;
  if (!TARGETS.includes(target)) throw new Error(`--target must be one of ${TARGETS.join(", ")}`);
  return { target, reset: argv.includes("--reset"), seed: Number(get("seed") ?? DEFAULT_SEED), world: worldName(argv) };
}

const log = (s: string): void => { process.stdout.write(`${s}\n`); };

/** Regenerate only when asked (target world) or missing: the committed file is the canonical world. */
function loadWorld(args: Args): World {
  const { path, answer_key } = WORLDS[args.world];
  if (args.target === "world" || !existsSync(path)) {
    const { world, answerKey } = args.world === "global-july" ? generateGlobalJuly() : generateWorld(args.seed);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(world, null, 2)}
`);
    writeFileSync(answer_key, `${JSON.stringify(answerKey, null, 2)}
`);
    log(`wrote ${path}${args.world === "northwind" ? ` (seed ${args.seed})` : ""} and ${answer_key} (gitignored)`);
    return world;
  }
  return World.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** `pnpm seed --target=<world|local|quickbooks|gmail|slack|all> [--world=northwind|global-july] [--reset] [--seed=N]` */
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
    const mapped = applySlackUserMap(db, world, slackUserMapFromEnv(world));
    if (mapped.owners + mapped.approvers > 0) log(`local: real Slack ids on ${mapped.owners} account owners and ${mapped.approvers} approvers`);
    else log("local: SLACK_USER_MAP / SLACK_DEFAULT_USER not set, so owners and approvers keep placeholder Slack ids and cannot be reached");
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
    const { seedSlack, slackUserMap } = await import("../connectors/slack.js");
    // Slack has no reset: a bot cannot delete other history, and seeding skips world ids already posted.
    log(`slack: ${JSON.stringify(await seedSlack(world, { log }))}`);
    // people whose email matches a workspace member map themselves; the env fills in or overrides the rest
    const db = openWorldDb(dbPath());
    const mapped = applySlackUserMap(db, world, slackUserMapFromEnv(world, process.env, await slackUserMap(world)));
    log(`slack: real Slack ids on ${mapped.owners} account owners and ${mapped.approvers} approvers`);
    db.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  // Slack names the scopes it wanted; pass that on instead of a bare "missing_scope"
  const slack = (err as { data?: { needed?: string; provided?: string } }).data;
  if (slack?.needed) process.stderr.write(`Slack scopes needed: ${slack.needed} · token has: ${slack.provided}\n`);
  process.exit(1);
});
