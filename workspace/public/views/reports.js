import { dataTable, h } from "/dom.js";
import { icon } from "/icons.js";

/** Standing reports, each computed by code from the ledger. Anything else: ask for it in words. */
export function renderReports(app) {
  const r = app.modules?.reports;
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Reports"), h("p", { class: "muted" }, "Built by code from the ledger, to the cent.")),
      h("div", { class: "actions" }, h("button", { class: "btn white", on: { click: () => app.go("ask") } }, icon("spark", 15), "Ask for a report in words"))),
    r ? h("div", { class: "panel" }, h("h2", {}, `AR ageing by customer · end of ${app.period}`), dataTable(r.ageing, { totalFirst: true })) : null,
    r ? h("div", { class: "panel" }, h("h2", {}, `Trial balance through ${app.period}`), dataTable(r.trial_balance, { totalLast: true })) : null);
}
