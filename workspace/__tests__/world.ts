import { rebuildLadder } from "../../src/learn/autonomy.js";
import { approvePolicy, compilePolicies } from "../../src/learn/compile.js";
import { replay } from "../../src/learn/replay.js";
import { APP_CONFIG } from "../../src/packs/index.js";
import { openDb, type Db } from "../../src/runtime/db.js";
import { seedMainScene } from "../../src/demo/scenario/mainScene.js";
import { standIn } from "../../src/demo/scenario/standIns.js";
import { seedGlobalJuly } from "../../src/demo/scenario/world.js";
import { runOpenIntents } from "../../src/worker/runOpenIntents.js";

let tick = 0;
export const clock = { now: () => new Date(Date.parse("2026-07-23T12:00:00.000Z") + 1000 * tick++).toISOString() };

/** The rehearsed month with its rule learned and approved, as the workspace finds it before anyone presses Run. */
export async function learnedWorld(): Promise<Db> {
  const db = openDb();
  seedGlobalJuly(db);
  seedMainScene(db);
  await replay(db, { investigators: [], function: "ar", clock });
  const [draft] = compilePolicies(db, clock, "ar");
  approvePolicy(db, clock, draft!.policy_id!, "U_CTRL");
  await replay(db, { investigators: [], function: "ar", clock });
  rebuildLadder(db, clock);
  return db;
}

/** The same month after the agents have worked it: code first, then scripted stand-ins in place of the model tiers. */
export async function workedWorld(): Promise<Db> {
  const db = await learnedWorld();
  await runOpenIntents(db, { investigators: [standIn, standIn], function: "ar", clock, config: APP_CONFIG });
  return db;
}
