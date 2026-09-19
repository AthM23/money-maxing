// Build per-sheet .excalidraw files and one combined board from x2e.mjs output.
import fs from 'node:fs';
import path from 'node:path';
const [,, inJson, outDir] = process.argv;
const data = JSON.parse(fs.readFileSync(inJson, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const wrap = (elements, files) => ({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: files || {} });
const bbox = els => { let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for (const e of els) { if (e.isDeleted) continue; const xs=e.points?[e.x]:[e.x, e.x+(e.width||0)], ys=e.points?[e.y]:[e.y, e.y+(e.height||0)]; if (e.points) for (const p of e.points) { xs.push(e.x+p[0]); ys.push(e.y+p[1]); } x0=Math.min(x0,...xs); y0=Math.min(y0,...ys); x1=Math.max(x1,...xs); y1=Math.max(y1,...ys);} return {x0,y0,x1,y1,w:x1-x0,h:y1-y0}; };
let seq = 0; const rid = () => 'fn' + (seq++).toString(36) + Math.random().toString(36).slice(2, 8);
const title = (text, x, y, size) => ({ id: rid(), type: 'text', x, y, width: text.length * size * 0.6, height: size * 1.25, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1 + seq, version: 1, versionNonce: 1 + seq, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, text, fontSize: size, fontFamily: 2, textAlign: 'left', verticalAlign: 'top', containerId: null, originalText: text, lineHeight: 1.25, autoResize: true });
const sheets = Object.keys(data).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
const combined = []; const files = {};
let cx = 0, cy = 0, rowH = 0, col = 0; const GAP = 1200, PER_ROW = Number(process.env.PER_ROW || 5);
for (const f of sheets) {
  const name = path.basename(f, '.mmd');
  let els = data[f].elements.map(e => ({ ...e, roughness: 0 }));
  fs.writeFileSync(path.join(outDir, name + '.excalidraw'), JSON.stringify(wrap(els, data[f].files)));
  const b = bbox(els);
  // remap ids so sheets never collide on the combined board
  const map = new Map(els.map(e => [e.id, name + ':' + e.id]));
  const re = id => map.get(id) || id;
  const shifted = els.map(e => ({ ...e, id: re(e.id), x: e.x - b.x0 + cx, y: e.y - b.y0 + cy + 620,
    groupIds: (e.groupIds || []).map(g => name + ':' + g), containerId: e.containerId ? re(e.containerId) : e.containerId,
    boundElements: e.boundElements ? e.boundElements.map(be => ({ ...be, id: re(be.id) })) : e.boundElements,
    startBinding: e.startBinding ? { ...e.startBinding, elementId: re(e.startBinding.elementId) } : e.startBinding,
    endBinding: e.endBinding ? { ...e.endBinding, elementId: re(e.endBinding.elementId) } : e.endBinding }));
  combined.push(title(name.replace(/-/g, " "), cx, cy, 400), ...shifted);
  Object.assign(files, data[f].files || {});
  cx += b.w + GAP; rowH = Math.max(rowH, b.h + 620); col++;
  if (col >= PER_ROW) { col = 0; cx = 0; cy += rowH + GAP; rowH = 0; }
  console.log(name, els.length, Math.round(b.w) + 'x' + Math.round(b.h));
}
fs.writeFileSync(path.join(outDir, 'footnote-architecture-board.excalidraw'), JSON.stringify(wrap(combined, files)));
console.log('combined elements', combined.length);
