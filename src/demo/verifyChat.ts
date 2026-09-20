/** Local QA bridge: a chat agent uses the SAME tool caller as the SDK investigator. Never hosted. */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import type { InvestigationReport, Investigator, ToolCaller } from "../agents/investigator.js";
import { ALL_TOOLS } from "../agents/toolset.js";
import { buildConnectors } from "../connectors/index.js";
import { driftOnce } from "../drift/monitor.js";
import { ingestAll } from "../ingest/ingest.js";
import { openWorldDb } from "../ledger/db.js";
import { APP_CONFIG } from "../packs/index.js";
import { generateGlobalJuly } from "../seed/globalJuly.js";
import { seedLocal, writeStores } from "../seed/local.js";
import { runOpenIntents } from "../worker/runOpenIntents.js";
import { ACTIONS } from "../../workspace/actions.js";
import { afterLedgerMoved } from "../../workspace/ripple.js";
import { FinishInput } from "../agents/tools/write.js";
import { z } from "zod";

const dir = resolve("runs", `chat-verification-${Date.now()}`);
mkdirSync(dir, { recursive: true });
const db = openWorldDb(join(dir, "month.db"));
const stores = join(dir, "stores");
const { world } = generateGlobalJuly();
seedLocal(db, world);
writeStores(world, stores);
const ingested = await ingestAll(db, await buildConnectors(new Set(), stores));
if (Object.values(ingested).some(r => "error" in r)) throw new Error("ingest failed");
await driftOnce(db);
const learned = await ACTIONS.learn!(db, {}) as { drafts: { policy_id?: string }[] };
for (const draft of learned.drafts) if (draft.policy_id) await ACTIONS.policy!(db, { policy_id: draft.policy_id, as: "U_CTRL" });
await ACTIONS.run!(db, {});
await afterLedgerMoved(db, stores);
const main = db.prepare("SELECT id FROM intent WHERE json_extract(case_json, '$.bank_txn_id') = 'BTX-320'").get() as { id: string };
await db.backup(join(dir, "before-investigation.db"));
const token = randomUUID();
let task: unknown;
let call: ToolCaller | undefined;
let finish: ((r: InvestigationReport) => void) | undefined;
const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
  try {
    if (req.method === "GET" && req.url === "/task") { res.end(JSON.stringify(task)); return; }
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error("request too large"); }
    const body = JSON.parse(raw);
    if (req.method === "POST" && req.url === "/tool" && call) { res.end(JSON.stringify(call(body.name, body.input))); return; }
    if (req.method === "POST" && req.url === "/finish" && finish) {
      const report = FinishInput.parse(body);
      res.end(JSON.stringify({ accepted: true }));
      // No invented API tokens/cost. The recorded actor names this chat-agent harness explicitly.
      finish(report); finish = undefined; call = undefined; return;
    }
    res.writeHead(404).end('{}');
  } catch (e) { res.writeHead(400).end(JSON.stringify({ error: String(e) })); }
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const investigator: Investigator = { name: "chat-agent-verification", investigate: async (t, caller) => {
  task = { ...t, tools: ALL_TOOLS.map(s => ({ name: s.name, description: s.description, input: z.toJSONSchema(s.input) })) };
  call = caller;
  writeFileSync(join(dir, "task.json"), JSON.stringify(task, null, 2));
  writeFileSync("runs/chat-verification-latest.json", JSON.stringify({ dir, base, token, intent_id: main.id }, null, 2));
  process.stdout.write(`Chat bridge ready: runs/chat-verification-latest.json\n`);
  return new Promise<InvestigationReport>((r) => { finish = r; });
} };
try {
  const result = await runOpenIntents(db, { investigators: [investigator], intent_id: main.id, config: APP_CONFIG });
  writeFileSync(join(dir, "investigation-result.json"), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result)}\nSaved database: ${join(dir, "month.db")}\n`);
} finally {
  server.closeAllConnections(); server.close(); db.close();
}
