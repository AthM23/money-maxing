// `pnpm db:init [path]`: create an empty database with the contract schema. The seeder fills it.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_DB_PATH, openDb } from './db.js';

const path = process.argv[2] ?? DEFAULT_DB_PATH;
mkdirSync(dirname(path), { recursive: true });
const db = openDb(path);
const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number };
console.log(`${path}: ${tables.n} tables, schema version ${db.pragma('user_version', { simple: true })}`);
db.close();
