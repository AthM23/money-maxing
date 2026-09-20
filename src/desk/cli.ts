import { existsSync } from "node:fs";
import { startSlack } from "../agents/slack/transport.js";
import { flagInt, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { loadEnv } from "../env.js";
import { systemClock } from "../runtime/config.js";
import { openDb } from "../runtime/db.js";
import { deskPass } from "./deskPass.js";

const USAGE = "usage: pnpm desk <db> [--once] [--interval seconds]";

/**
 * The human desk over Slack. Open questions go to the person they were addressed to, parked entries to an approver
 * with the authority to sign them, each once. Stays connected so button clicks and answers come back over Socket
 * Mode. `--once` posts what is waiting and exits, for a smoke test; clicks are not received after it exits.
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ["once"]);
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    warn(dbPath ? `no database at ${dbPath}` : USAGE);
    return 1;
  }
  loadEnv();
  const db = openDb(dbPath);
  const slack = await startSlack(db);
  const intervalMs = (flagInt(args, "interval") ?? 5) * 1000;
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  const askedAboutFacts = new Set<string>();
  do {
    const report = await deskPass(db, slack, systemClock, askedAboutFacts);
    for (const f of report.facts_posted) out(`asked to remember: ${f.fact_id} → ${f.approver_id}`);
    for (const id of report.escalations_posted) out(`asked: ${id}`);
    for (const a of report.approvals_posted) out(`approval requested: ${a.decision_id} → ${a.approver_id}`);
    for (const u of report.unroutable) warn(`not routed: ${u.decision_id}: ${u.reason}`);
    if (args.flags.once === true) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (!stopping);
  await slack.stop();
  return 0;
}

runCli(main);
