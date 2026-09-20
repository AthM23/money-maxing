import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openWorldDb } from "../../src/ledger/db.js";
import { openDb } from "../../src/runtime/db.js";
import { generateWorld } from "../../src/seed/generate.js";
import { seedLocal, writeStores } from "../../src/seed/local.js";
import { afterLedgerMoved, MOVES_THE_LEDGER, rippleView, storesFor } from "../ripple.js";

describe("one transaction, every book: the workspace lets the other functions react, in code", () => {
  it("refreshes revenue, forecast and close after the ledger moves, and reads back what each book did about a case", async () => {
    const { world } = generateWorld();
    const db = openWorldDb();
    seedLocal(db, world);
    const stores = mkdtempSync(join(tmpdir(), "mm-ripple-"));
    writeStores(world, stores);

    const out = await afterLedgerMoved(db, stores);

    expect(out.status).toBe("refreshed");
    expect((db.prepare("SELECT COUNT(*) AS n FROM decision WHERE mode = 'live' AND tier >= 1").get() as { n: number }).n).toBe(0);
    const touched = db.prepare("SELECT intent_id FROM ripple ORDER BY id LIMIT 1").get() as { intent_id: string };
    const rows = rippleView(db, touched.intent_id);
    expect(rows[0]).toMatchObject({ function: "ar", kind: "cash_applied" });
    expect(rows[0]!.summary).toMatch(/^Cash \$/);
  }, 60_000);

  it("says why when it cannot, and never turns the action that called it into an error", async () => {
    expect(await afterLedgerMoved(openDb(), "/nowhere")).toEqual({ status: "skipped", reason: "this database has no revenue, forecast or close tables" });
    expect(await afterLedgerMoved(openWorldDb(), null)).toMatchObject({ status: "skipped" });
    // A stores folder that is not there makes the engines throw; the caller still gets an answer, not an exception.
    expect((await afterLedgerMoved(openWorldDb(), "/nowhere")).status).toBe("failed");
    expect(rippleView(openDb(), "int_none")).toEqual([]);
    expect(storesFor("/nowhere/x.db", undefined)).toBeNull();
    expect([...MOVES_THE_LEDGER].sort()).toEqual(["answer", "approve", "decide", "run"]);
  });
});
