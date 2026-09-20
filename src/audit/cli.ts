import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { systemClock } from "../runtime/config.js";
import { openDb } from "../runtime/db.js";
import { buildAuditPack } from "./pack.js";
import type { AuditPack } from "./types.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };

const USAGE = "usage: pnpm auditpack <db path> <period YYYY-MM> [seed] [size]";
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
/** The seed lands in a filename, so it is restricted at the boundary rather than trusted. */
const SEED = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_SIZE = 5;
const MAX_SIZE = 1000;

interface Args {
  db: string;
  period: string;
  seed: string;
  size: number;
}

/** Build one period's audit pack from a database on disk and leave it in runs/audit for a person to read. */
function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const db = openDb(args.db);
  try {
    const pack = buildAuditPack(db, systemClock, { period: args.period, seed: args.seed, size: args.size });
    const file = join("runs", "audit", `${args.period}-${args.seed}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
    summarise(pack, file);
    return 0;
  } catch (err) {
    process.stderr.write(`audit pack failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  } finally {
    db.close();
  }
}

function parseArgs(argv: readonly string[]): Args | null {
  const [db, period, seed = "default", size = String(DEFAULT_SIZE)] = argv;
  if (!db || !period || !PERIOD.test(period) || !SEED.test(seed)) return null;
  const n = Number(size);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SIZE) return null;
  return { db, period, seed, size: n };
}

function summarise(pack: AuditPack, file: string): void {
  const { summary, controls } = pack;
  out(`audit pack ${pack.period} · seed ${pack.seed} · ${file}`);
  out(`  population ${pack.population_size} · sampled ${summary.sampled} (${pack.sample.must_test.length} must-test, ${pack.sample.random.length} random)`);
  out(`  re-performed clean ${summary.reperformed_clean}/${summary.sampled} (${(summary.reperformed_clean_share * 100).toFixed(1)}%)`);
  out(`  findings ${summary.findings_total}`);
  for (const [type, count] of Object.entries(summary.findings_by_type)) out(`    ${type}: ${count}`);
  out(`  approved by a controller agent: ${controls.agent_approved.agent_approved}/${controls.agent_approved.posted}`);
}

process.exit(main());
