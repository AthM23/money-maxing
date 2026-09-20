// Builds the hosted read-only copy for Vercel (Build Output API v3) into .vercel/output. No model call, no secret.
//
//   node scripts/vercel-build.mjs
//
//   the month     runs/snapshot/month.db if someone put one there (say, the demo's start.db with its paid pass on it);
//                 otherwise scripts/demo-build.sh builds prepared.db from the code as it stands.
//   the function  workspace/vercel.ts as one file, with the files it reads at run time laid out beside it at their
//                 repo paths, and better-sqlite3 (a native module) copied in as it was installed on this machine.
//                 Every request goes to it, so the pages carry the same headers as they do from `pnpm workspace`.
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import Database from "better-sqlite3";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".vercel", "output");
const FUNC = join(OUT, "functions", "index.func");
const SNAPSHOT = join(ROOT, "runs", "snapshot", "month.db");
/** Read at run time, relative to the source file that reads them. They keep their repo paths inside the function. */
const READ_AT_RUN_TIME = ["src/contract/schema.sql", "src/ledger/schema-b.sql", "workspace/public", "frontend", "ft/data", "runs/reader-bench"];
/** Large and never read by the workspace: training rows. */
const NOT_NEEDED = /\.(jsonl|csv)$/;

process.chdir(ROOT);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(FUNC, "runs", "public"), { recursive: true });

// 1. The month, as one file with no journal beside it.
const month = join(FUNC, "runs", "public", "month.db");
if (existsSync(SNAPSHOT)) {
  console.log(`== the month: ${relative(ROOT, SNAPSHOT)}, as provided`);
  vacuumInto(SNAPSHOT, month);
} else {
  console.log("== the month: built here by scripts/demo-build.sh, no model call");
  const hasSqlite = spawnSync("sqlite3", ["--version"], { stdio: "ignore" }).status === 0;
  const shims = join(ROOT, "scripts", "vercel", "bin");
  chmodSync(join(shims, "sqlite3"), 0o755); // a deploy from Windows uploads it without its execute bit
  const env = hasSqlite && !process.env.VERCEL ? process.env : { ...process.env, PATH: `${shims}${delimiter}${process.env.PATH}` };
  const built = spawnSync("bash", ["scripts/demo-build.sh", "runs/public"], { stdio: "inherit", env });
  if (built.status !== 0) process.exit(built.status ?? 1);
  vacuumInto(join(ROOT, "runs", "public", "prepared.db"), month);
}

// 2. The function. Bundled, a source file's own address would become the bundle's; each keeps its repo address.
await build({
  entryPoints: [join(ROOT, "workspace", "vercel.ts")], outfile: join(FUNC, "index.mjs"),
  bundle: true, platform: "node", format: "esm", target: `node${process.versions.node.split(".")[0]}`,
  external: ["better-sqlite3"], logLevel: "warning", legalComments: "none",
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  plugins: [{ name: "own-address", setup(b) {
    b.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.includes(`${sep}node_modules${sep}`)) return undefined;
      const here = JSON.stringify(relative(ROOT, args.path).split(sep).join("/"));
      return { loader: "ts", contents: readFileSync(args.path, "utf8").replaceAll("import.meta.url", `new URL(${here}, import.meta.url).href`) };
    });
  } }],
});
for (const path of READ_AT_RUN_TIME) cpSync(join(ROOT, path), join(FUNC, path), { recursive: true, filter: (from) => !NOT_NEEDED.test(from) });

// 3. The native module and the two packages it loads itself with, from wherever pnpm put them.
let from = pathToFileURL(join(ROOT, "package.json")).href;
for (const name of ["better-sqlite3", "bindings", "file-uri-to-path"]) {
  const manifest = createRequire(from).resolve(`${name}/package.json`);
  cpSync(dirname(manifest), join(FUNC, "node_modules", name), { recursive: true, dereference: true,
    filter: (path) => !/[\\/](deps|src|docs|benchmark|obj|node_modules)([\\/]|$)/.test(path.slice(dirname(manifest).length)) });
  from = pathToFileURL(manifest).href;
}

// 4. What Vercel reads. The runtime is this machine's Node: the native module was built for it.
writeFileSync(join(FUNC, ".vc-config.json"), JSON.stringify({ runtime: `nodejs${process.versions.node.split(".")[0]}.x`, handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 30 }, null, 2));
writeFileSync(join(OUT, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2));
console.log(`Built ${relative(ROOT, OUT)}: one read-only function over ${relative(ROOT, month)}`);

function vacuumInto(source, target) {
  const db = new Database(source, { readonly: true });
  try { db.prepare("VACUUM INTO ?").run(target); } finally { db.close(); }
}
