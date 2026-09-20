import { getJson, h, money, pill, plain, rate, statusPill } from "/dom.js";
import { openDrawer } from "/app.js";
import { evidencePanel } from "/views/evidence.js";
import { questionCard } from "/views/queue.js";
import { flowView } from "/views/flow.js";
import { traceView } from "/views/traceview.js";

/** One receipt: the bank line on the left, the book lines that explain it on the right, then how the agents got there. */
export async function renderCase(app) {
  const v = await getJson(`/api/case?intent=${encodeURIComponent(app.route.id ?? "")}`);
  const r = v.receipt;
  const short = r.shortfall_cents > 0 ? `${money(r.shortfall_cents)} short` : "paid in full";
  return h("section", {},
    h("div", { class: "pagehead" },
      h("div", {},
        h("button", { class: "back", on: { click: () => app.go("run") } }, "← Cash application"),
        h("h1", {}, r.party_name ?? r.party_id, " ", statusPill(r.status)),
        h("p", { class: "muted" }, `${r.doc_ids.join(", ") || "no invoice named"} · ${short}`))),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "One bank line, explained to the cent"), h("span", { class: "muted" }, "Click a book line for its evidence")), cashApplication(v)),
    v.fx ? h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "Why it is short"), h("span", { class: "muted" }, `A matcher that sees one number calls the whole ${money(r.shortfall_cents)} a short-pay`)), split(v)) : null,
    ...r.open_questions.map((q) => h("div", { class: "panel ask" }, questionCard(app, q))),
    tracePanel(v));
}

let traceMode = "flow";

/** The same trace two ways: a flow on a grid for reading the story, a timeline for reading every call in order. */
function tracePanel(v) {
  const body = h("div", {});
  const draw = () => body.replaceChildren(traceMode === "flow" ? flowView(v) : h("div", { class: "console" }, traceView(v.trace)));
  const toggle = h("div", { class: "seg2" }, ["flow", "timeline"].map((m) => h("button", { class: traceMode === m ? "on" : "", on: { click: (e) => { traceMode = m; for (const b of e.target.parentElement.children) b.classList.toggle("on", b === e.target); draw(); } } }, m === "flow" ? "Flow" : "Timeline")));
  draw();
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "Agent trace"), h("p", { class: "muted" }, "Every turn anyone took on this case. Click a bubble for what the tool was given and what it gave back.")), toggle), body);
}

function cashApplication(v) {
  const b = v.receipt.bank_line;
  const bank = h("div", { class: "bankblock" },
    h("span", { class: "kick" }, `Bank line · ${b?.id ?? ""}`), h("b", {}, b ? `+${money(b.amount_cents)}` : ""), h("span", {}, b?.posted_date ?? ""),
    h("p", { class: "mono" }, b?.descriptor ?? ""),
    v.fx ? h("p", { class: "fxline" }, `${v.fx.currency} ${plain(v.fx.foreign_amount_cents)} at ${rate(v.fx.rate_ppm)}, less ${money(v.fx.fee_cents)} bank charges`) : null,
    v.invoice_fx[0] ? h("p", { class: "fxline dim" }, `Invoiced ${v.invoice_fx[0].currency} ${plain(v.invoice_fx[0].foreign_total_cents)} at ${rate(v.invoice_fx[0].booked_rate_ppm)} = ${money(v.receipt.expected_cents)}`) : null);
  const rows = v.lines.map((l) => h("button", { class: `bookline ${l.state}`, disabled: !l.decision_id, on: l.decision_id ? { click: () => showEvidence(l.decision_id) } : {} },
    h("span", { class: "amt" }, l.kind === "apply_payment" ? `+${money(l.amount_cents)}` : money(l.amount_cents)),
    h("span", { class: "what" }, h("b", {}, l.label), h("span", { class: "muted" }, l.settled_by)),
    h("span", { class: "chips" }, l.account ? h("span", { class: "chip mono" }, `GL ${l.account}`) : null, l.fx_note ? h("span", { class: "chip mono lime" }, l.fx_note) : null),
    l.state === "posted" ? pill("posted", "ok") : l.state === "parked" ? pill("awaiting approval", "wait") : pill("awaiting you", "wait")));
  return h("div", { class: "cashapp" }, bank, h("div", { class: "booklines" }, h("span", { class: "kick" }, "Book lines"), rows));
}

/** The shortfall as one bar in its causes. Only the last segment is a judgment; the rest is arithmetic. */
function split(v) {
  const short = v.receipt.shortfall_cents;
  const byKind = (k) => v.lines.filter((l) => l.kind === k).reduce((n, l) => n + l.amount_cents, 0);
  const fee = byKind("write_off");
  const fx = byKind("fx_realized");
  const rest = Math.max(short - fee - fx, 0);
  const segs = [["The bank's charges", fee, "fee", "code, from the bank's advice"], ["The rate moved", fx, "fx", "code, re-performed from two rates"], ["Held back by the customer", rest, "held", "the only judgment"]].filter((s) => s[1] > 0);
  return h("div", {},
    h("div", { class: "splitbar" }, segs.map(([, cents, cls]) => h("div", { class: `seg ${cls}`, style: { flex: `${Math.max(cents / short, 0.06)}` } }, money(cents)))),
    h("div", { class: "splitlegend" }, segs.map(([label, cents, cls, who]) => h("div", {}, h("span", { class: `dot ${cls}` }), h("b", {}, label), ` ${money(cents)} · `, h("span", { class: "muted" }, who)))),
  );
}

async function showEvidence(decisionId) {
  try { openDrawer(await evidencePanel(decisionId)); } catch (err) { openDrawer(h("p", { class: "error" }, err.message)); }
}
