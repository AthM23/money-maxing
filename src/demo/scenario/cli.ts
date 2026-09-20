import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { out, parseArgs, runCli, warn } from "../../cli/flags.js";
import { loadEnv } from "../../env.js";
import { openDb, type Db } from "../../runtime/db.js";
import { seedMainScene } from "./mainScene.js";
import { seedGlobalJuly } from "./world.js";

const USAGE = "usage: pnpm demo:scenario <db> [--no-main-scene]";

/**
 * The rehearsed scenario (`context/SCENARIO.md`), seeded onto a database file instead of the in-memory copy the
 * tests use, so the UI and a live demo have a fallback that does not depend on lane B's seed. Never touches an
 * existing file. `--no-main-scene` seeds the global July alone, without the Vossberg FX scene.
 */
export function main(argv: string[] = process.argv.slice(2)): number {
  const args = parseArgs(argv, ["no-main-scene"]);
  const dbPath = args.positional[0];
  if (!dbPath) {
    warn(USAGE);
    return 1;
  }
  if (existsSync(dbPath)) {
    warn(`${dbPath} already exists; choose another path`);
    return 1;
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  seedGlobalJuly(db);
  const withMainScene = args.flags["no-main-scene"] !== true;
  if (withMainScene) seedMainScene(db);
  loadEnv();
  const mapped = applySlackIds(db);
  if (mapped > 0) out(`Slack: ${mapped} owner and approver row(s) now carry real Slack ids, so pnpm desk can reach them`);
  const n = db.prepare("SELECT COUNT(*) AS n FROM intent WHERE status = 'open'").get() as { n: number };
  // Released so the file is not left locked for an in-process caller (a test, or a script that seeds then reads).
  db.close();
  out(`seeded ${dbPath}: ${n.n} open intent(s)${withMainScene ? "" : " (global July only)"}`);
  out("next, for a code-only run:");
  out(`  pnpm learn ${dbPath} --replay --approve-as U_CTRL`);
  out(`  pnpm learn ${dbPath} --replay`);
  out(`  pnpm worker ${dbPath} --code-only`);
  out(`  pnpm inbox ${dbPath} list`);
  out(`  pnpm auditpack ${dbPath} 2026-07 demo 50`);
  return 0;
}

/**
 * The scenario's people carry placeholder Slack ids (U_SAM, U_CTRL). With SLACK_USER_MAP (JSON, person id to real
 * Slack id) or SLACK_DEFAULT_USER set, the same variables `pnpm seed` reads, account owners and approvers get real
 * ids so the desk can message them. Approver ids stay as they are: they are what the kernel checks.
 */
export function applySlackIds(db: Db, env: NodeJS.ProcessEnv = process.env): number {
  let explicit: Record<string, string> = {};
  if (env.SLACK_USER_MAP) {
    try {
      explicit = JSON.parse(env.SLACK_USER_MAP) as Record<string, string>;
    } catch {
      throw new Error('SLACK_USER_MAP must be JSON, e.g. {"U_SAM":"U0123ABC"}');
    }
  }
  const realFor = (person: string): string | undefined => explicit[person] ?? env.SLACK_DEFAULT_USER;
  let changed = 0;
  for (const a of db.prepare("SELECT id FROM approver WHERE role != 'controller_agent'").all() as { id: string }[]) {
    const real = realFor(a.id);
    if (real) changed += db.prepare("UPDATE approver SET slack_user = ? WHERE id = ?").run(real, a.id).changes;
  }
  for (const o of db.prepare("SELECT DISTINCT owner_user FROM party WHERE owner_user IS NOT NULL").all() as { owner_user: string }[]) {
    const real = realFor(o.owner_user);
    if (real) changed += db.prepare("UPDATE party SET owner_user = ? WHERE owner_user = ?").run(real, o.owner_user).changes;
  }
  return changed;
}

// Guard the CLI's own process.exit from firing when a test imports `main` without running this file directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main);
