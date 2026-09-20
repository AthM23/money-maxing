/**
 * `pnpm connectors` — print the connector registry: every source of context the system knows, where each one comes
 * from, what the investigator can search it with, and which live systems have their credentials set on this machine.
 *
 * It reads `registry.ts` and nothing else, so what it prints is what the agent actually gets.
 */
import { loadEnv } from "../env.js";
import { DEFAULT_STORES_DIR } from "./local.js";
import { CONNECTORS, liveCredentials, LIVE_SOURCES, type ConnectorDef } from "./registry.js";

const out = (s: string): void => { process.stdout.write(`${s}\n`); };

function mode(def: ConnectorDef): string {
  const { ready, missing } = liveCredentials(def);
  const live = def.live ? (ready ? "live ready" : `live (needs ${missing.join(", ")})`) : "";
  const local = def.local ? `local ${DEFAULT_STORES_DIR}` : "seeded, not pulled";
  return live ? `${local} · ${live}` : local;
}

function main(): void {
  loadEnv();
  const ready = CONNECTORS.filter((c) => liveCredentials(c).ready).map((c) => c.source);
  const pulled = CONNECTORS.filter((c) => c.local || c.live).length;
  out(`${CONNECTORS.length} registered sources · ${pulled} are pulled by \`pnpm ingest\` · ${ready.length} are wired to a real API right now (${ready.join(", ") || "none"})`);
  out(`--live=${LIVE_SOURCES.join(",")} swaps a local store for the real system.\n`);
  for (const def of CONNECTORS) {
    out(`  ${def.source.padEnd(9)} ${def.label}`);
    out(`  ${" ".repeat(9)} ${def.about}`);
    out(`  ${" ".repeat(9)} kinds: ${def.kinds.join(", ")} · ${mode(def)}`);
    out(`  ${" ".repeat(9)} agent tool: ${def.tool ? `${def.tool.name} — searches ${def.tool.describes}` : "none (read through typed tools)"}`);
    out("");
  }
  out("The demo runs on Gmail and Slack, live. The rest are local stores, a seeded workbook and a write-only");
  out("QuickBooks mirror; Linear is the worked example of adding a system, not part of the demo.\n");
  out("Add one: a module that maps the system's records to RawItem, plus one entry in src/connectors/registry.ts.");
  out("See src/connectors/README.md; src/connectors/linear.ts is the worked example.");
}

main();
