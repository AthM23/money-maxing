// Mermaid flowchart -> Excalidraw, keeping Mermaid's own layout, colours, line breaks and edge routes.
// Renders each .mmd with Mermaid in headless Chrome, reads node / cluster / edge geometry from the
// live SVG, and emits Excalidraw elements (shapes with bound labels, arrows bound to their nodes).
// usage: node svg2exc.mjs <out.json> <a.mmd> [b.mmd ...]
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , outFile, ...inputs] = process.argv;
const mermaidJs = path.join(here, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const html = `<!doctype html><html><body style="margin:0"><div id="host"></div>
<script type="module">
  import { convertToExcalidrawElements } from "https://esm.sh/@excalidraw/excalidraw@0.18.0";
  window.toElements = (skeleton) => convertToExcalidrawElements(skeleton, { regenerateIds: false });
  window.ready = true;
</script></body></html>`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.setContent(html, { waitUntil: 'networkidle0', timeout: 180000 });
await page.addScriptTag({ path: mermaidJs });
await page.waitForFunction('window.ready === true && !!window.mermaid', { timeout: 180000 });

const convert = async (src) => page.evaluate(async (src) => {
  const hex = (c) => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map((v) => parseFloat(v));
    if (a === 0) return 'transparent';
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', maxEdges: 5000, maxTextSize: 900000, flowchart: { htmlLabels: true, useMaxWidth: false } });
  const host = document.getElementById('host'); host.innerHTML = '';
  const { svg } = await mermaid.render('g' + Math.random().toString(36).slice(2, 8), src);
  host.innerHTML = svg;
  const root = host.querySelector('svg');
  const vb = root.viewBox.baseVal; root.removeAttribute('style'); root.setAttribute('width', vb.width); root.setAttribute('height', vb.height);
  const o = root.getBoundingClientRect();
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height }; };
  const labelText = (el) => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); return c.textContent.split('\n').map((s) => s.trim()).join('\n').trim(); };
  const svgId = root.id + '-';

  const db = (await mermaid.mermaidAPI.getDiagramFromText(src)).db;
  const vertices = db.getVertices();
  const vtype = (id) => { const v = vertices.get ? vertices.get(id) : vertices[id]; return v ? v.type : undefined; };

  const out = []; const clusters = []; const nodes = []; const ids = new Set();
  root.querySelectorAll('g.cluster').forEach((g) => {
    const rect = g.querySelector('rect'); if (!rect) return;
    const id = g.id.replace(svgId, ''); const b = box(rect); ids.add(id);
    clusters.push({ id, b, title: labelText(g.querySelector('.cluster-label')) });
  });
  clusters.sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height);
  clusters.forEach((c, i) => {
    const gid = 'grp_' + c.id;
    out.push({ type: 'rectangle', id: c.id, x: c.b.x, y: c.b.y, width: c.b.width, height: c.b.height, backgroundColor: '#fffbe0', strokeColor: '#b9ae6a', strokeWidth: 1, fillStyle: 'solid', roughness: 0, opacity: 55, groupIds: [gid] });
    if (c.title) out.push({ type: 'text', id: c.id + '__title', x: c.b.x + 14, y: c.b.y + 8, text: c.title, fontSize: 20, fontFamily: 2, strokeColor: '#4a4520', groupIds: [gid] });
  });

  root.querySelectorAll('g.node').forEach((g) => {
    const id = g.id.replace(svgId, '').replace(/^flowchart-/, '').replace(/-\d+$/, '');
    const shape = g.querySelector('.label-container, rect.basic, polygon, circle, ellipse, path, rect'); if (!shape) return;
    const cs = getComputedStyle(shape); const b = box(shape); const t = vtype(id);
    const lab = g.querySelector('.nodeLabel') || g.querySelector('.label');
    const sw = parseFloat(cs.strokeWidth) || 1; ids.add(id);
    nodes.push({
      type: t === 'circle' || t === 'doublecircle' || t === 'ellipse' ? 'ellipse' : 'rectangle', id,
      x: b.x, y: b.y, width: b.width, height: b.height,
      backgroundColor: hex(cs.fill) || '#ffffff', strokeColor: hex(cs.stroke) || '#333333',
      strokeWidth: sw >= 2.5 ? 4 : 2, strokeStyle: cs.strokeDasharray && cs.strokeDasharray !== 'none' ? 'dashed' : 'solid',
      fillStyle: 'solid', roughness: 0, roundness: t === 'stadium' || t === 'round' || t === 'cylinder' ? { type: 3 } : null,
      label: { text: labelText(lab), fontSize: 16, fontFamily: 2, strokeColor: hex(getComputedStyle(lab || shape).color) || '#1e1e1e' },
    });
  });

  const edgeLabels = new Map();
  root.querySelectorAll('g.edgeLabel g.label[data-id]').forEach((g) => { const t = labelText(g); if (t) edgeLabels.set(g.getAttribute('data-id'), t); });
  const split = (did) => { // L_<start>_<end>_<n>
    const body = did.replace(/^L_/, '').replace(/_\d+$/, ''); const parts = body.split('_');
    for (let i = 1; i < parts.length; i++) { const a = parts.slice(0, i).join('_'), b = parts.slice(i).join('_'); if (ids.has(a) && ids.has(b)) return [a, b]; }
    return [null, null];
  };
  const arrows = [];
  root.querySelectorAll('path.flowchart-link').forEach((p) => {
    const did = p.getAttribute('data-id') || ''; const [a, b] = split(did);
    const len = p.getTotalLength(); const n = Math.max(2, Math.min(10, Math.ceil(len / 160)));
    const m = p.getScreenCTM(); const pts = [];
    for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((len * i) / n); pts.push([q.x * m.a + q.y * m.c + m.e - o.x, q.x * m.b + q.y * m.d + m.f - o.y]); }
    const cls = p.getAttribute('class') || ''; const x0 = pts[0][0], y0 = pts[0][1];
    const arrow = { type: 'arrow', id: 'e_' + did, x: x0, y: y0, points: pts.map(([x, y]) => [x - x0, y - y0]),
      strokeColor: '#3d3d3d', strokeWidth: /thickness-thick/.test(cls) ? 4 : 1, strokeStyle: /pattern-dotted/.test(cls) ? 'dashed' : 'solid',
      roughness: 0, roundness: { type: 2 }, endArrowhead: p.getAttribute('marker-end') ? 'arrow' : null, startArrowhead: p.getAttribute('marker-start') ? 'arrow' : null };
    if (a) arrow.start = { id: a }; if (b) arrow.end = { id: b };
    const t = edgeLabels.get(did); if (t) arrow.label = { text: t, fontSize: 13, fontFamily: 2, strokeColor: '#3d3d3d' };
    arrows.push(arrow);
  });

  // keep Mermaid's routed geometry: convert without bindings first, then bind by id ourselves
  const raw = arrows.map((a) => ({ ...a, start: undefined, end: undefined }));
  const elements = window.toElements([...out, ...raw, ...nodes]);
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const a of arrows) {
    const el = byId.get(a.id); if (!el) continue;
    // restore Mermaid's exact route: the skeleton converter mirrors leftward / upward arrows
    const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1]);
    el.x = a.x; el.y = a.y; el.points = a.points; el.width = Math.max(...xs) - Math.min(...xs); el.height = Math.max(...ys) - Math.min(...ys);
    const lbl = elements.find((t) => t.type === 'text' && t.containerId === el.id);
    if (lbl) { const mid = a.points[Math.floor(a.points.length / 2)]; lbl.x = a.x + mid[0] - lbl.width / 2; lbl.y = a.y + mid[1] - lbl.height / 2; }
    for (const [k, ref] of [['startBinding', a.start], ['endBinding', a.end]]) {
      if (!ref || !byId.has(ref.id)) continue;
      el[k] = { elementId: ref.id, focus: 0, gap: 4 };
      const tgt = byId.get(ref.id); tgt.boundElements = [...(tgt.boundElements || []), { id: el.id, type: 'arrow' }];
    }
  }
  return { elements, files: {}, stats: { nodes: nodes.length, clusters: clusters.length, edges: arrows.length, unbound: arrows.filter((a) => !a.start || !a.end).length, w: vb.width, h: vb.height } };
}, src);

const results = {};
for (const f of inputs) {
  try { const r = await convert(fs.readFileSync(f, 'utf8')); results[f] = r; console.log('ok', path.basename(f), JSON.stringify(r.stats)); }
  catch (e) { console.error('FAIL', path.basename(f), String(e.message).slice(0, 500)); }
}
fs.writeFileSync(outFile, JSON.stringify(results));
await browser.close();
