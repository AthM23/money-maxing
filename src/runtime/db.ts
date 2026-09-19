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
