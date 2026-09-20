import { randomUUID } from "node:crypto";
import { copyFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type Db } from "../src/runtime/db.js";
import { handle } from "./app.js";
import { gate } from "./gate.js";

/**
 * The hosted copy (Vercel): the same handler as `server.ts`, read-only by construction rather than by a variable, so
 * no setting on the host can make it a workspace that writes or spends. `scripts/vercel-build.mjs` puts the month
 * beside this file; the function's own disk cannot be written, so the month is opened from a copy in the temp folder.
 * The dashboard sits behind DASHBOARD_PASSWORD (`gate.ts`); with none set it answers nothing but the marketing page.
 */
const MONTH = join(dirname(fileURLToPath(import.meta.url)), "..", "runs", "public", "month.db");

let db: Db | undefined;

function month(): Db {
  if (!db) {
    const copy = join(tmpdir(), "month.db");
    copyFileSync(MONTH, copy);
    db = openDb(copy);
  }
  return db;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // An unset password is not an open door: the gate then holds a key nobody has.
  if (await gate(process.env.DASHBOARD_PASSWORD || randomUUID(), req, res)) return;
  return handle(month(), null, true, req, res);
}
