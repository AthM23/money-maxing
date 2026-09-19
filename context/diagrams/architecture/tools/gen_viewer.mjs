// Build the single-file architecture board viewer from rendered SVG sheets.
// usage: node gen_viewer.mjs <svgDir> <out.html>
import fs from 'node:fs';
import path from 'node:path';
const [, , svgDir, outFile] = process.argv;

const SHEETS = [
  ['Map', [['00-master', 'Master map', 'The whole system on one sheet: sources, ingestion, context graph, drift monitor, nine function packs, judgment layer, routes, posting, human loop, learning, fine-tune, testing, proof.']]],
  ['Inputs and shared state', [
    ['01-inputs-integrators', 'Inputs and integrators', 'Seeded world, connectors per source, structural validation, canonicalisation, extraction, entity resolution, as-of trace store, evidence versioning.'],
    ['02-context-graph', 'Context graph and memory', 'Entity layer, decision-trace layer, three knowledge tiers, fact and policy anatomy, lifecycle, retrieval order, the audit fence.'],
    ['03-drift-intents-coordination', 'Drift monitor, intents, coordination', 'Nine deterministic comparators, difference triage, fact suppression, intent as state, event bus, close conductor.']]],
  ['Shared judgment layer', [
    ['04-judgment-layer', 'Judgment layer and kernel', 'Router tiers, investigator, proposal and workpaper, every kernel check F E P J, hard BLOCK rules, disposition, post and ripple.'],
    ['05-human-loop-memory', 'Human loop: asked once', 'When to escalate, composing the question, Slack round trip, answer to fact or policy with guards, automatic re-use, decay.']]],
  ['Function packs', [
    ['10-ar-collections', 'AR, cash application, collections', 'Payer resolution, ordered matching passes, residual classification, collections, output cases.'],
    ['11-bank-rec', 'Cash and bank reconciliation', 'Typed match groups, two-sided proof, timing items, unexplained residue, amended statements.'],
    ['12-ap', 'Accounts payable', 'Bill intake, vendor master controls, three-way match, duplicate-payment defence, approvals, payment run.'],
    ['13-revenue', 'Revenue', 'Term extraction, ASC 606 steps, schedule engine in code, modifications and the double-hit guard, leakage checks.'],
    ['14-close', 'Month-end close', 'Close conductor, accruals, prepaids, cutoff, tie-outs, three materiality thresholds, lock, the late invoice.'],
    ['15-forecast', '13-week cash forecast', 'Direct-method build, versioned re-forecasts, miss attribution, artifact checks.'],
    ['16-reporting', 'Reporting and flux', 'Variance detection, decomposition to decisions and intents, bound numerals, board pack.'],
    ['17-audit-controls', 'Audit and controls', 'Independence fence, sampling, re-performance, journal-entry screens, control tests, evidence pack.'],
    ['18-equity-lite-payroll', 'Equity-lite and payroll touchpoints', 'Stretch pack: ASC 718 schedule, termination ripple, four compliance checks, payroll accrual.']]],
  ['Learning, models, proof', [
    ['20-learning-loops', 'Learning loops', 'Replay, compile, online corrections, the overnight research loop with mutation zones, CI, autonomy ladder.'],
    ['21-finetune-pipeline', 'Open-weight fine-tune pipeline', 'Label sources, task heads, dataset build, time and entity splits, LoRA training, calibration, shadow, promotion, monitoring.'],
    ['22-observability-eval', 'Observability and eval', 'Decision traces, console views, scoreboard, tie-out, corpus harness, reproducibility.'],
    ['23-testing-benchmarking', 'Testing and benchmarking', 'Test pyramid, reliability and ablations, sponsor reference benchmarks, the metric tree, CI gating.'],
    ['30-demo-spine', 'Demo spine: one event, every book', 'Initech short-pay rippling through every function, then the Wayne escalation that is asked once.']]],
];

const data = {}; const missing = [];
for (const [, items] of SHEETS) for (const [id] of items) {
  const f = path.join(svgDir, id + '.svg');
  if (!fs.existsSync(f)) { missing.push(id); continue; }
  data[id] = fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*\?>/, '');
}
if (missing.length) console.error('missing sheets:', missing.join(', '));
const nav = SHEETS.map(([group, items]) => ({ group, items: items.filter(([id]) => data[id]).map(([id, name, note]) => ({ id, name, note })) }));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const html = `<title>Footnote Architecture Board</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600&display=swap">
<style>
:root{--ground:#eef0ea;--panel:#fbfcf8;--ink:#1b2420;--muted:#5b6861;--rule:#cfd5cb;--accent:#1d6b47;--accent-ink:#ffffff;--hover:#e3e8df;--paper:#fdfdf9;
  --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--cond:"IBM Plex Sans Condensed","IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#121815;--panel:#19211d;--ink:#e3e9e4;--muted:#93a199;--rule:#2c3832;--accent:#58c08d;--accent-ink:#0c1a13;--hover:#222c27}}
:root[data-theme="dark"]{--ground:#121815;--panel:#19211d;--ink:#e3e9e4;--muted:#93a199;--rule:#2c3832;--accent:#58c08d;--accent-ink:#0c1a13;--hover:#222c27}
html,body{height:100%}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.45;display:flex;flex-direction:column}
header{padding-block:12px 10px;padding-inline:16px;border-bottom:1px solid var(--rule);display:flex;flex-wrap:wrap;gap:6px 20px;align-items:baseline}
h1{font-family:var(--cond);font-size:22px;font-weight:600;margin:0;letter-spacing:.01em}
header p{margin:0;color:var(--muted);max-width:75ch}
.app{flex:1;min-height:0;display:grid;grid-template-columns:270px 1fr}
nav{border-right:1px solid var(--rule);overflow-y:auto;padding-block:10px 16px;background:var(--panel)}
nav h2{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:14px 16px 4px}
nav button{display:flex;gap:10px;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;color:var(--ink);font:inherit;padding:6px 16px 6px 13px;cursor:pointer}
nav button:hover{background:var(--hover)}
nav button:focus-visible,.tools button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
nav button[aria-current="true"]{border-left-color:var(--accent);background:var(--hover);font-weight:500}
nav .num{font-family:var(--mono);font-size:12px;color:var(--muted);padding-top:1px}
main{min-width:0;min-height:0;display:flex;flex-direction:column}
.bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--rule);background:var(--panel)}
.bar .what{flex:1 1 320px;min-width:0}
.bar strong{font-weight:600}
.bar .note{color:var(--muted);display:block}
.bar code{font-family:var(--mono);font-size:12px;color:var(--muted)}
.tools{display:flex;gap:4px;align-items:center}
.tools button{font:500 13px var(--sans);min-width:34px;height:30px;padding:0 10px;border:1px solid var(--rule);background:var(--ground);color:var(--ink);border-radius:4px;cursor:pointer}
.tools button:hover{background:var(--hover)}
.tools output{font-family:var(--mono);font-size:12px;color:var(--muted);min-width:48px;text-align:right;font-variant-numeric:tabular-nums}
select{display:none;font:inherit;width:100%;padding:8px;border:1px solid var(--rule);border-radius:4px;background:var(--panel);color:var(--ink)}
.stage{flex:1;min-height:320px;position:relative;overflow:hidden;background:var(--paper);cursor:grab;touch-action:none}
.stage.drag{cursor:grabbing}
.sheet{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.sheet svg{display:block;max-width:none!important}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 16px;border-top:1px solid var(--rule);background:var(--panel);font-size:12px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:14px;height:11px;border:1.5px solid;display:inline-block}
@media (max-width:760px){.app{grid-template-columns:1fr}nav{display:none}select{display:block}.mobile{padding:8px 16px;border-bottom:1px solid var(--rule);background:var(--panel)}}
@media (min-width:761px){.mobile{display:none}}
</style>
<header>
  <h1>Footnote Architecture Board</h1>
  <p>Target architecture for the autonomous finance-ops agent team. Nothing here has been built or measured yet. Drag to pan; scroll, pinch or use the buttons to zoom. Editable sources live in <code style="font-family:var(--mono)">context/diagrams/architecture/</code>.</p>
</header>
<div class="app">
  <nav id="nav" aria-label="Sheets"></nav>
  <main>
    <div class="mobile"><label for="pick" hidden>Sheet</label><select id="pick"></select></div>
    <div class="bar">
      <div class="what"><strong id="name"></strong> <code id="file"></code><span class="note" id="note"></span></div>
      <div class="tools"><button id="zout" aria-label="Zoom out">−</button><button id="zin" aria-label="Zoom in">+</button><button id="fit">Fit</button><button id="one">100%</button><output id="zoom"></output></div>
    </div>
    <div class="stage" id="stage"><div class="sheet" id="sheet"></div></div>
    <div class="legend" aria-label="Legend">
      <span><i style="background:#e7eefc;border-color:#3b5bab"></i>source or input</span>
      <span><i style="background:#e3f5e6;border-color:#2e7d46"></i>deterministic code</span>
      <span><i style="background:#efe6fb;border-color:#6b3fb3"></i>model call</span>
      <span><i style="background:#fdebd3;border-color:#c0720f"></i>human</span>
      <span><i style="background:#fff6cf;border-color:#a88a06"></i>store</span>
      <span><i style="background:#fff;border-color:#b3261e;border-width:2.5px"></i>kernel check or hard gate</span>
      <span><i style="background:#dbf3f3;border-color:#16787a"></i>learning and testing</span>
      <span><i style="background:#f1f1f1;border-color:#666"></i>outbound artifact</span>
      <span><i style="background:#fafafa;border-color:#999;border-style:dashed"></i>stretch or undecided</span>
      <span>routes: AUTO green · PROPOSE blue · ESCALATE orange · REFUSE grey · BLOCK red</span>
    </div>
  </main>
</div>
<script>
const NAV = ${json(nav)};
const SVG = ${json(data)};
const $ = (id) => document.getElementById(id);
const stage = $('stage'), sheet = $('sheet');
let k = 1, tx = 0, ty = 0, w = 0, h = 0, current = null;
const apply = () => { sheet.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')'; $('zoom').textContent = Math.round(k * 100) + '%'; };
const fit = () => { const r = stage.getBoundingClientRect(); k = Math.min(r.width / w, r.height / h) * 0.97; tx = (r.width - w * k) / 2; ty = (r.height - h * k) / 2; apply(); };
const zoomAt = (f, cx, cy) => { const nk = Math.min(4, Math.max(0.03, k * f)); tx = cx - (cx - tx) * (nk / k); ty = cy - (cy - ty) * (nk / k); k = nk; apply(); };
const centre = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
function show(id) {
  if (!SVG[id]) return; current = id;
  sheet.innerHTML = SVG[id];
  const svg = sheet.querySelector('svg'); const vb = svg.viewBox.baseVal; w = vb.width; h = vb.height;
  svg.removeAttribute('style'); svg.setAttribute('width', w); svg.setAttribute('height', h);
  let meta; for (const g of NAV) for (const it of g.items) if (it.id === id) meta = it;
  $('name').textContent = meta.name; $('note').textContent = meta.note; $('file').textContent = 'mmd/' + id + '.mmd';
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.id === id ? 'true' : 'false'));
  $('pick').value = id; fit();
  try { localStorage.setItem('fn-sheet', id); } catch (e) {}
}
for (const g of NAV) {
  const h2 = document.createElement('h2'); h2.textContent = g.group; $('nav').appendChild(h2);
  const og = document.createElement('optgroup'); og.label = g.group; $('pick').appendChild(og);
  for (const it of g.items) {
    const b = document.createElement('button'); b.dataset.id = it.id;
    const n = document.createElement('span'); n.className = 'num'; n.textContent = it.id.slice(0, 2);
    const t = document.createElement('span'); t.textContent = it.name; b.append(n, t);
    b.addEventListener('click', () => show(it.id)); $('nav').appendChild(b);
    const o = document.createElement('option'); o.value = it.id; o.textContent = it.id.slice(0, 2) + ' · ' + it.name; og.appendChild(o);
  }
}
$('pick').addEventListener('change', (e) => show(e.target.value));
$('fit').addEventListener('click', fit);
$('one').addEventListener('click', () => { const [cx, cy] = centre(); zoomAt(1 / k, cx, cy); });
$('zin').addEventListener('click', () => zoomAt(1.3, ...centre()));
$('zout').addEventListener('click', () => zoomAt(1 / 1.3, ...centre()));
stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
const ptrs = new Map(); let pinch = 0;
stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); stage.classList.add('drag'); pinch = 0; });
stage.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { tx += e.clientX - prev[0]; ty += e.clientY - prev[1]; apply(); }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = stage.getBoundingClientRect();
    if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = d; }
});
const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) stage.classList.remove('drag'); };
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
window.addEventListener('resize', () => { if (current) fit(); });
let first = NAV[0].items[0].id; try { const s = localStorage.getItem('fn-sheet'); if (s && SVG[s]) first = s; } catch (e) {}
show(first);
</script>
`;
fs.writeFileSync(outFile, html);
console.log('wrote', outFile, (html.length / 1e6).toFixed(2) + ' MB', 'sheets', Object.keys(data).length);
