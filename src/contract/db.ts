// Opens a SQLite database with the contract schema applied. Every process (seeder, engines, runtime,
// console, tests) goes through here so pragmas and the core chart of accounts are identical everywhere.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.js';

export type Db = Database.Database;

/** Bumped on any schema.sql change. A database with another version is refused, not migrated: re-seed instead. */
export const SCHEMA_VERSION = 1;

export const DEFAULT_DB_PATH = 'data/footnote.db';

const SCHEMA_SQL = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');

export function openDb(path: string = DEFAULT_DB_PATH): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); // the console polls while the runtime writes
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const version = db.pragma('user_version', { simple: true }) as number;
  if (version === 0) {
    db.transaction(() => {
      db.exec(SCHEMA_SQL);
      const insert = db.prepare('INSERT INTO account (code, name, type, control_for) VALUES (?, ?, ?, ?)');
      for (const acc of ALL_ACCOUNTS) insert.run(acc.code, acc.name, acc.type, acc.control_for ?? null);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
  } else if (version !== SCHEMA_VERSION) {
    db.close();
    throw new Error(`${path} has schema version ${version}, expected ${SCHEMA_VERSION}. Delete it and re-seed.`);
  }
  return db;
}

export function openMemoryDb(): Db {
  return openDb(':memory:');
}
