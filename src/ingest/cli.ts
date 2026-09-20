import { buildConnectors, liveFromArgv } from "../connectors/index.js";
import { driftOnce } from "../drift/monitor.js";
import { dbPath, openWorldDb } from "../ledger/db.js";
import { ingestAll } from "./ingest.js";

/**
 * `pnpm ingest [--live=gmail,slack]` — pull every source once, then let the drift monitor look at what changed.
 * Local stores by default; a live system replaces its local store behind the same trace shape.
 */
async function main(): Promise<void> {
  const connectors = await buildConnectors(liveFromArgv(process.argv));

  const db = openWorldDb(dbPath());
  const results = await ingestAll(db, connectors);
  for (const [name, r] of Object.entries(results)) process.stdout.write(`${name.padEnd(16)} ${JSON.stringify(r)}\n`);
  const findings = await driftOnce(db);
  process.stdout.write(`drift: ${findings.filter((f) => f.opened).length} intents opened, ${findings.filter((f) => !f.opened).length} already known\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  const slack = (err as { data?: { needed?: string; provided?: string } }).data;
  if (slack?.needed) process.stderr.write(`Slack scopes needed: ${slack.needed} · token has: ${slack.provided}\n`);
  process.exit(1);
});
