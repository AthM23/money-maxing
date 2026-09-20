import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { refreshDownstream } from "../src/demo/downstream.js";
import type { Db } from "../src/runtime/db.js";

/**
 * One transaction, every book. When an entry posts, lane B's engines react through the bus: revenue looks at the
 * schedule, the forecast is rebuilt, the close checklist re-tests the ledger, the QuickBooks mirror plans its writes
 * (a dry run here). Each of them leaves a row in `ripple` saying what it did about that case, or that it looked and
 * left things alone. This module runs them after an action that moved the ledger, and reads those rows back.
 */
export interface RippleRow { function: string; kind: string; ref: string; summary: string; before_cents: number | null; after_cents: number | null; delta_cents: number | null; at: string }

export type RippleOutcome = { status: "refreshed"; engine_passes: number; close_done: number; close_items: number } | { status: "skipped" | "failed"; reason: string };

/** Actions after which the other books have something to react to. Learning and remembering move no ledger line. */
export const MOVES_THE_LEDGER: ReadonlySet<string> = new Set(["run", "approve", "answer", "decide"]);

function hasTable(db: Db, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

/** The stores the world was seeded into: named on the command line, or the `stores` folder beside the database. */
export function storesFor(dbPath: string, named: string | undefined): string | null {
  const dir = named ?? join(dirname(dbPath), "stores");
  return existsSync(dir) ? dir : null;
}

export function rippleView(db: Db, intentId: string): RippleRow[] {
  if (!hasTable(db, "ripple")) return [];
  return db.prepare("SELECT function, kind, ref, summary, before_cents, after_cents, delta_cents, created_at AS at FROM ripple WHERE intent_id = ? ORDER BY id").all(intentId) as RippleRow[];
}

/**
 * Code only: no model, no stand-in, nothing sent to QuickBooks. The action that called this has already succeeded, so
 * a failure here is reported beside its result and logged, and never turns that result into an error.
 */
export async function afterLedgerMoved(db: Db, stores: string | null): Promise<RippleOutcome> {
  if (!stores) return { status: "skipped", reason: "no stores folder for this database, so the other books were not refreshed" };
  if (!["rev_schedule", "forecast_line", "checklist_item"].every((t) => hasTable(db, t))) return { status: "skipped", reason: "this database has no revenue, forecast or close tables" };
  try {
    const r = await refreshDownstream(db, stores);
    return { status: "refreshed", engine_passes: r.engine_passes, close_done: r.checklist.filter((i) => i.status === "done").length, close_items: r.checklist.length };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`downstream refresh failed: ${reason}\n`);
    return { status: "failed", reason };
  }
}
