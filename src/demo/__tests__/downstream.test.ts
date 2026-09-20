import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openWorldDb } from "../../ledger/db.js";
import { generateWorld } from "../../seed/generate.js";
import { seedLocal, writeStores } from "../../seed/local.js";
import { pickOpenIntents } from "../../worker/pickup.js";
import { refreshDownstream } from "../downstream.js";

describe("downstream: lane B's engines with no model and no stand-in", () => {
  it("builds the forecast and the close checklist and leaves a case only code has tried open for the model", async () => {
    const { world } = generateWorld();
    const db = openWorldDb();
    seedLocal(db, world);
    const stores = mkdtempSync(join(tmpdir(), "mm-downstream-"));
    writeStores(world, stores);

    const r = await refreshDownstream(db, stores);

    expect(r.ar_tied).toBe(true);
    expect(r.checklist.length).toBeGreaterThan(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM forecast_line").get() as { n: number }).n).toBeGreaterThan(0);
    // Nothing above the code tier ran, scripted or real.
    expect((db.prepare("SELECT COUNT(*) AS n FROM decision WHERE mode = 'live' AND tier >= 1").get() as { n: number }).n).toBe(0);
    // The regression: `pnpm spine` without a key left every such case waiting on a person, so a model pass found none.
    const initech = db.prepare("SELECT id, status FROM intent WHERE question LIKE '%INV-1042%'").get() as { id: string; status: string };
    expect(initech.status).toBe("open");
    expect(pickOpenIntents(db, { has_model_tiers: true, intent_id: initech.id }).ready.map((p) => p.intent_id)).toEqual([initech.id]);
  }, 60_000);
});
