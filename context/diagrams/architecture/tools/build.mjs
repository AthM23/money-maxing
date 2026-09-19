// Rebuild everything from the Mermaid sources: SVG renders, per-sheet Excalidraw files, and the combined board.
// usage (from this folder): npm install && node build.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mmdDir = path.join(root, 'mmd'), svgDir = path.join(root, 'svg'), excDir = path.join(root, 'excalidraw');
fs.mkdirSync(svgDir, { recursive: true }); fs.mkdirSync(excDir, { recursive: true });
const sheets = fs.readdirSync(mmdDir).filter((f) => f.endsWith('.mmd')).sort();
const bin = path.join(here, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');
for (const f of sheets) {
  execFileSync(bin, ['-c', path.join(here, 'mermaid.config.json'), '-i', path.join(mmdDir, f), '-o', path.join(svgDir, f.replace(/\.mmd$/, '.svg'))], { stdio: 'inherit', shell: process.platform === 'win32' });
}
const tmp = path.join(here, '.board.json');
execFileSync(process.execPath, [path.join(here, 'svg2exc.mjs'), tmp, ...sheets.map((f) => path.join(mmdDir, f))], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(here, 'assemble.mjs'), tmp, excDir], { stdio: 'inherit' });
fs.rmSync(tmp, { force: true });
