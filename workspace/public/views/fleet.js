import { clock, cost, duration, getJson, h, money } from "/dom.js";

/** What every agent did, for someone who will not open a case: who decided what, what was refused, what it cost. */
export async function renderFleet(app) {
  const f = await getJson("/api/fleet");
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Agent trace"), h("p", { class: "muted" }, "Every turn is a row in the ledger's own database, so this is a record, not a log someone chose to keep."))),
    h("div", { class: "stats" }, stat(f.totals.tool_calls, "lookups"), stat(f.totals.model_calls, "model calls"), stat(`${cost(f.totals.cost_micros)}${f.totals.uncosted_turns ? "+" : ""}`, f.totals.uncosted_turns ? `model cost · ${f.totals.uncosted_turns} aborted turn(s) not costed` : "model cost"), stat(f.totals.kernel_refusals, "drafts the kernel refused", f.totals.kernel_refusals ? "bad" : "")),
    h("div", { class: "panel" }, h("h2", {}, "Who did what"), workers(f.workers)),
    h("div", { class: "panel" }, h("h2", {}, "As it happened"), h("ol", { class: "feed" }, f.feed.map((item) => feedRow(app, item)))));
}

function stat(value, label, tone = "") {
  return h("div", { class: `stat ${tone}` }, h("b", {}, value), h("span", {}, label));
}

function workers(rows) {
  const head = ["Worker", "Turns", "Posted alone", "Parked", "Asked", "Refused by kernel", "Lookups", "Model calls", "Cost", "Working time"];
  return h("table", { class: "grid tight" }, h("thead", {}, h("tr", {}, head.map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((w) => h("tr", {}, h("td", {}, h("span", { class: `dot ${w.lane}` }), " ", h("b", {}, w.worker)),
      ...[w.turns, w.posted_alone, w.parked, w.asked, w.kernel_refusals, w.tool_calls, w.model_calls].map((n) => h("td", { class: "num" }, n || "—")),
      h("td", { class: "num mono" }, cost(w.cost_micros)), h("td", { class: "num mono" }, w.busy_ms ? duration(w.busy_ms) : "—")))));
}

function feedRow(app, item) {
  return h("li", { class: `feeditem ${item.tone}`, on: { click: () => app.go("case", item.intent_id) } },
    h("span", { class: "when mono" }, clock(item.at)), h("span", {}, h("b", {}, item.worker), ` ${item.what}`, item.party ? ` · ${item.party}` : "", item.amount_cents ? ` · ${money(item.amount_cents)}` : ""));
}
