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
  return db;
}

/** An independent in-memory copy of a database as it stands now. Used to run the same month twice from one cold start. */
export function cloneDb(db: Db): Db {
  return new Database(db.serialize());
}
