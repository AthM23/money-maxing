import { act, cost, flow, h, s, statusPill, toast } from "/dom.js";
import { icon } from "/icons.js";
import { askFromElsewhere } from "/views/ask.js";

/** The first screen: what the agents did with the month, what it cost, and the little that is waiting for you. */
export function renderOverview(app, o) {
  const sb = o.scoreboard;
  const cases = o.receipts.filter((r) => r.bank_line);
  const name = (o.viewer?.name ?? "").replace(/\s*\(.*\)$/, "").split(" ")[0];
  const waiting = Object.values(o.awaiting_you).reduce((n, list) => n + list.length, 0);
  return h("section", {},
    h("div", { class: "pagehead" },
      h("div", {}, h("h1", {}, name ? `Welcome back, ${name}.` : "Welcome back."),
        h("p", { class: "muted" }, waiting ? `Your finance agents worked ${cases.length} receipts this month. ${waiting === 1 ? "One thing needs" : `${waiting} things need`} you.` : `Your finance agents worked ${cases.length} receipts this month. Nothing needs you.`)),
      h("div", { class: "actions" },
        h("button", { class: "btn white", on: { click: () => learn(app) } }, icon("book", 16), "Learn from last quarter"),
        h("button", { class: "btn ink", on: { click: () => run(app) } }, icon("play", 15), "Run the code tier"))),
    h("div", { class: "brief" }, h("span", { class: "kick" }, "This month in plain words"), h("p", {}, brief(o, cases))),
    h("div", { class: "grid3" },
      h("div", { class: "panel" }, h("h2", {}, "Receipts this month"), gauge(cases)),
      h("div", { class: "panel" }, chartPanel(app)),
      h("div", { class: "tiles" },
        tile("code", "Entries posted by code", sb.auto_posted, "no person involved", "up"),
        tile("spark", "Model cost this month", cost(sb.cost_micros), `${sb.model_calls} model calls`, sb.cost_micros ? "flat" : "up"),
        tile("shield", "Checks re-performed", `${sb.checkable_num}/${sb.checkable_den}`, o.books.tied ? "books tied to the cent" : "books do NOT tie", o.books.tied ? "up" : "down"))),
    h("div", { class: "grid2" },
      h("div", { class: "panel" }, h("h2", {}, "Ask the books"), h("p", { class: "muted" }, "Reports are built by code from the ledger. No model writes a number here."), askBox(app)),
      h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "Receipts"), h("button", { class: "link", on: { click: () => app.go("run") } }, "View all")), recent(app, cases))),
    h("p", { class: "fineprint" }, "Northwind Systems is a fictional company and this month is simulated. Every figure on this page is read from the ledger."));
}

/** A half ring in three parts: settled, waiting for a person, still open. */
function gauge(cases) {
  const parts = [["Settled", cases.filter((r) => r.status === "resolved").length, "#3fae52"], ["Awaiting you", cases.filter((r) => r.status === "waiting_on_human").length, "#f0645c"], ["Open", cases.filter((r) => r.status === "open").length, "#9db4ff"]];
  const total = Math.max(cases.length, 1);
  const R = 130, CX = 160, CY = 160, LEN = Math.PI * R;
  let offset = 0;
  const arcs = parts.filter(([, n]) => n > 0).map(([, n, color]) => {
    const len = (n / total) * LEN;
    const arc = s("path", { d: `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`, fill: "none", stroke: color, "stroke-width": 14, "stroke-linecap": "butt", "stroke-dasharray": `${Math.max(len - 3, 1)} ${LEN}`, "stroke-dashoffset": -offset });
    offset += len;
    return arc;
  });
  return h("div", { class: "gauge" },
    s("svg", { viewBox: "0 0 320 176", width: "100%" }, s("path", { d: `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`, fill: "none", stroke: "#f0f0ec", "stroke-width": 14 }), arcs),
    h("div", { class: "gaugecenter" }, h("b", {}, cases.length), h("span", {}, "receipts")),
    h("div", { class: "legend" }, parts.map(([label, n, color]) => h("div", {}, h("span", { class: "sw", style: { background: color } }), h("span", {}, label), h("small", {}, `${n} (${Math.round((n / total) * 100)}%)`)))));
}

function chartPanel(app) {
  const f = app.modules?.forecast;
  if (f?.available && f.weeks.length > 1) return [h("div", { class: "panelhead" }, h("h2", {}, "13-week cash forecast"), h("span", { class: "chip" }, `as of ${f.as_of}`)), lineChart(f.weeks.map((w) => ({ label: w.week.slice(5), value: w.balance_cents }))), f.not_modelled?.length ? h("p", { class: "muted small" }, `Not modelled, and said so: ${f.not_modelled.filter(Boolean).join("; ") || "some contracts"}`) : null];
  const weeks = app.modules?.reports.cash_by_week ?? [];
  return [h("div", { class: "panelhead" }, h("h2", {}, "Cash received by week"), h("span", { class: "chip" }, app.period)), lineChart(weeks.map((w) => ({ label: w.week.slice(5), value: w.cents })))];
}

function lineChart(points) {
  if (points.length < 2) return h("p", { class: "muted" }, "Not enough weeks to draw yet.");
  const W = 640, H = 250, PAD = { l: 58, r: 16, t: 14, b: 30 };
  // The axis hugs the data: a balance of millions that moves by thousands is a flat line on an axis that starts at zero.
  const hi = Math.max(...points.map((p) => p.value)), lo = Math.min(...points.map((p) => p.value));
  const pad = Math.max((hi - lo) * 0.25, 1);
  const max = hi + pad, min = Math.max(lo - pad, 0);
  const x = (i) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - min) / Math.max(max - min, 1)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.value)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  return s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" },
    s("defs", {}, s("pattern", { id: "hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, s("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#101012", "stroke-width": 1.2 }))),
    ticks.map((t) => [s("line", { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t), stroke: "#eeeeea" }), s("text", { x: PAD.l - 10, y: y(t) + 4, "text-anchor": "end", class: "axis" }, axisMoney(t))]),
    s("path", { d: `${path} L ${x(points.length - 1)} ${H - PAD.b} L ${x(0)} ${H - PAD.b} Z`, fill: "url(#hatch)", opacity: 0.16 }),
    s("path", { d: path, fill: "none", stroke: "#101012", "stroke-width": 2 }),
    points.map((p, i) => [s("circle", { cx: x(i), cy: y(p.value), r: 3.5, fill: "#fff", stroke: "#101012", "stroke-width": 1.8 }), i % Math.ceil(points.length / 7) === 0 ? s("text", { x: x(i), y: H - 8, "text-anchor": "middle", class: "axis" }, p.label) : null]));
}

function axisMoney(cents) {
  const dollars = cents / 100;
  return dollars >= 1_000_000 ? `$${(dollars / 1_000_000).toFixed(2)}M` : `$${Math.round(dollars / 1000)}k`;
}

function tile(iconName, label, value, note, direction) {
  return h("div", { class: "tile" }, h("span", { class: "tilelabel" }, icon(iconName, 16), label), h("div", { class: "tilevalue" }, h("b", {}, value), h("span", { class: `delta ${direction}` }, note)));
}

const PROMPTS = ["AR ageing by customer", "What is waiting for a person?", "Cash received by week", "Show me the trial balance"];

function askBox(app) {
  const input = h("input", { type: "text", placeholder: "Ask for a report…", "aria-label": "Ask the books" });
  return h("div", { class: "askbox" },
    h("div", { class: "prompts" }, PROMPTS.map((p) => h("button", { class: "prompt", on: { click: () => askFromElsewhere(app, p) } }, p, icon("send", 13)))),
    h("form", { class: "askrow", on: { submit: (e) => { e.preventDefault(); if (input.value.trim()) askFromElsewhere(app, input.value, null); } } }, input, h("button", { class: "btn lime", type: "submit" }, icon("spark", 15), "Ask")));
}

/** The month in three sentences, written by code from the same figures the page shows. */
function brief(o, cases) {
  const sb = o.scoreboard;
  const settled = cases.filter((r) => r.status === "resolved").length;
  const waiting = cases.filter((r) => r.status === "waiting_on_human");
  const open = cases.filter((r) => r.status === "open").length;
  const parts = [`${cases.length} customer payments came in. Code matched and posted ${sb.auto_posted} ledger entries on its own${sb.model_calls ? `, and the models were called ${sb.model_calls} times for ${cost(sb.cost_micros)}` : " without calling a model"}; ${settled} payment${settled === 1 ? " is" : "s are"} fully settled.`];
  if (waiting.length) parts.push(`${waiting.length === 1 ? "One payment is" : `${waiting.length} payments are`} waiting for you: ${waiting.map((r) => r.party_name ?? r.party_id).join(", ")}.`);
  if (open) parts.push(`${open} more ${open === 1 ? "is" : "are"} short or unexplained and still being worked.`);
  parts.push(o.books.tied ? "The receivable ledger agrees to the open invoices to the cent." : "The receivable ledger does NOT agree to the open invoices.");
  return parts.join(" ");
}

function recent(app, cases) {
  const order = { waiting_on_human: 0, open: 1, resolved: 2 };
  const rows = [...cases].sort((a, b) => order[a.status] - order[b.status]).slice(0, 6);
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["Customer", "Status", "Received", "Short"].map((t, i) => h("th", { class: i > 1 ? "num" : "" }, t)))),
    h("tbody", {}, rows.map((r) => h("tr", { class: "click", on: { click: () => app.go("case", r.intent_id) } },
      h("td", {}, h("div", { class: "namecell" }, h("span", { class: "sq" }, icon("bank", 18)), h("div", {}, h("b", {}, r.party_name ?? r.party_id), h("small", {}, r.doc_ids.join(", ") || "no invoice named")))),
      h("td", {}, statusPill(r.status)), h("td", { class: "num" }, flow(r.received_cents, "in")), h("td", { class: "num" }, flow(r.shortfall_cents > 0 ? r.shortfall_cents : 0, "out"))))));
}

async function run(app) {
  try {
    const r = await act("run", {});
    toast(r.worked.length === 0 ? "Nothing new for code to settle." : `Code worked ${r.worked.length} case(s) in ${r.worked.reduce((n, w) => n + w.elapsed_ms, 0)} ms, with no model call.`);
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

async function learn(app) {
  try {
    const r = await act("learn", {});
    const fresh = r.drafts.filter((d) => d.policy_id && !d.unchanged);
    toast(`Replayed ${r.replayed} closed decisions: ${r.agreed} agree. ${fresh.length ? `${fresh.length} policy draft(s) are waiting for you.` : "No new policy to draft."}`);
    await app.refresh();
    if (fresh.length) app.go("queue");
  } catch (err) { toast(err.message, "bad"); }
}
