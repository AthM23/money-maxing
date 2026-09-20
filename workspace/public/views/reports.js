import { act, dataTable, h, toast } from "/dom.js";
import { icon } from "/icons.js";

let asked = null;

/** Standing reports, each computed by code from the ledger, and a box to ask for one in words. */
export function renderReports(app) {
  const r = app.modules?.reports;
  const input = h("input", { type: "text", placeholder: "AR ageing by customer, trial balance, cash by week, what is waiting…", "aria-label": "Ask the books" });
  const submit = async (e) => {
    e.preventDefault();
    try { asked = await act("ask", { question: input.value, period: app.period }); app.go("reports"); } catch (err) { toast(err.message, "bad"); }
  };
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Reports"), h("p", { class: "muted" }, "Built by code from the ledger, to the cent. Ask for one in words and it says which tables it read."))),
    h("div", { class: "panel" }, h("form", { class: "askrow", on: { submit } }, input, h("button", { class: "btn lime", type: "submit" }, icon("spark", 15), "Ask")),
      asked ? h("div", { class: "subpanel" }, h("h3", {}, asked.title), h("p", {}, asked.summary), asked.table ? dataTable(asked.table, { totalFirst: asked.title.startsWith("AR"), totalLast: asked.title.startsWith("Trial") }) : null, h("p", { class: "muted small" }, `Source tables: ${asked.source}`)) : null),
    r ? h("div", { class: "panel" }, h("h2", {}, `AR ageing by customer · end of ${app.period}`), dataTable(r.ageing, { totalFirst: true })) : null,
    r ? h("div", { class: "panel" }, h("h2", {}, `Trial balance through ${app.period}`), dataTable(r.trial_balance, { totalLast: true })) : null);
}
