import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

const SCHEMA_PATH = fileURLToPath(new URL("../contract/schema.sql", import.meta.url));

/** Open a database with the contract schema applied. Defaults to in-memory, which the tests use. */
export function openDb(path = ":memory:"): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  for (const [table, column, ddl] of ADDED_COLUMNS) ensureColumn(db, table, column, ddl);
  return db;
}

/** Columns added to the contract after databases already existed. CREATE TABLE IF NOT EXISTS never adds them. */
const ADDED_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ["policy", "code", "TEXT"],
  ["policy", "version", "INTEGER NOT NULL DEFAULT 1"],
  ["policy", "supersedes", "TEXT REFERENCES policy(id)"],
];

/** Names come from the list above, never from input. */
function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  const present = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!present) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

/** An independent in-memory copy of a database as it stands now. Used to run the same month twice from one cold start. */
export function cloneDb(db: Db): Db {
  return new Database(db.serialize());
}
