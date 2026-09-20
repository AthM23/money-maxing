// Stands in for the sqlite3 command on a build machine that has none (Vercel's). It covers the one form
// `scripts/demo-build.sh` uses: sqlite3 <db> "<one statement>", rows printed one per line, columns joined by "|".
import Database from "better-sqlite3";

const [path, sql] = process.argv.slice(2);
if (!path || !sql || process.argv.length !== 4) {
  process.stderr.write('usage: sqlite3 <db> "<one statement>"\n');
  process.exit(1);
}
const db = new Database(path);
try {
  const statement = db.prepare(sql);
  if (statement.reader) for (const row of statement.raw().all()) process.stdout.write(`${row.map((v) => v ?? "").join("|")}\n`);
  else statement.run();
} finally {
  db.close();
}
