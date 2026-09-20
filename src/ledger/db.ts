import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { openDb, type Db } from "../runtime/db.js";

export type { Db };

export const DEFAULT_DB_PATH = "data/footnote.db";

const SCHEMA_B_PATH = fileURLToPath(new URL("./schema-b.sql", import.meta.url));

/**
 * Columns added to a lane-B table after databases already existed. `CREATE TABLE IF NOT EXISTS` skips an existing
 * table whole, and SQLite has no `ADD COLUMN IF NOT EXISTS`, so each one is added on open when it is missing. The
 * column definition here must match the one in schema-b.sql, minus anything ALTER cannot add (a CHECK is fine).
 */
const ADDITIVE_COLUMNS: ReadonlyArray<{ table: string; column: string; ddl: string }> = [
  { table: "seed_manifest", column: "origin", ddl: "origin TEXT CHECK (origin IN ('created','adopted'))" },
];

export function dbPath(): string {
  return process.env.FOOTNOTE_DB || DEFAULT_DB_PATH;
}

/** The contract schema plus Person B's lane tables. Every B process (seeder, ingest, drift, console) opens through here. */
export function openWorldDb(path = ":memory:"): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = openDb(path);
  db.pragma("busy_timeout = 5000"); // the console polls while the runtime writes
  db.exec(readFileSync(SCHEMA_B_PATH, "utf8"));
  for (const { table, column, ddl } of ADDITIVE_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length > 0 && !columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
  return db;
}

/**
 * A clean state for --reset. Deleting the file is the simple way; on Windows it fails while the console (or
 * anything else) holds the database open, so then every table is dropped in place and the schema re-applied
 * on the next open. Readers keep their connection and simply see the new world.
 */
export function resetDb(path: string): "deleted" | "wiped" {
  try {
    for (const f of [path, `${path}-wal`, `${path}-shm`]) rmSync(f, { force: true });
    return "deleted";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EPERM") throw err;
  }
  const db = new Database(path);
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = OFF");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  db.transaction(() => { for (const t of tables) db.exec(`DROP TABLE "${t.name}"`); })();
  db.close();
  return "wiped";
}
