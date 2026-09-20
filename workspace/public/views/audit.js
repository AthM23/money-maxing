import { act, h, toast } from "/dom.js";

let last = null;

/** The auditor's seat: re-perform every posted entry from the sources, then change one digit on a copy and do it again. */
export function auditCard(app) {
  const period = app.period;
  return h("div", { class: "panel" },
    h("div", { class: "panelhead" },
      h("div", {}, h("h2", {}, "Audit"), h("p", { class: "muted" }, "A separate pass that cannot read the preparer's memory and cannot write. It re-performs each sampled entry as of the day it posted.")),
      h("div", { class: "actions" },
        h("button", { class: "btn white", on: { click: () => run(app, period, false) } }, `Re-perform ${period}`),
        h("button", { class: "btn ink", on: { click: () => run(app, period, true) } }, "…then change one digit in a source"))),
    last ? result(last) : h("p", { class: "muted" }, "Not run yet in this session."));
}

async function run(app, period, tamper) {
  try {
    toast(tamper ? "Re-performing, then again on a tampered copy…" : "Re-performing…");
    last = await act("audit", { period, tamper });
    app.go("close");
  } catch (err) { toast(err.message, "bad"); }
}

function result(r) {
  return h("div", {},
    h("div", { class: "subpanel" }, h("h3", {}, "The books as they are"), summary(r.summary, r.population), findings(r.findings)),
    r.tampered ? h("div", { class: "subpanel" }, h("h3", {}, "The same books, one digit changed"),
      r.tampered.changed ? h("p", {}, "On a copy, source ", h("span", { class: "mono" }, r.tampered.changed.trace_id), " had ", h("mark", {}, r.tampered.changed.from), " changed to ", h("mark", {}, r.tampered.changed.to), ". The live books were not touched.") : h("p", { class: "muted" }, r.tampered.note ?? ""),
      r.tampered.summary ? summary(r.tampered.summary) : null, findings(r.tampered.findings ?? [])) : null);
}

function summary(s, population) {
  return h("div", { class: "stats" },
    population !== undefined ? h("div", { class: "stat" }, h("b", {}, population), h("span", {}, "posted entries in the period")) : null,
    h("div", { class: "stat" }, h("b", {}, s.sampled), h("span", {}, "sampled and re-performed")),
    h("div", { class: `stat ${s.reperformed_clean === s.sampled ? "ok" : "bad"}` }, h("b", {}, `${s.reperformed_clean} / ${s.sampled}`), h("span", {}, "re-performed clean")),
    h("div", { class: `stat ${s.findings_total ? "bad" : "ok"}` }, h("b", {}, s.findings_total), h("span", {}, "findings")));
}

function findings(list) {
  if (!list.length) return h("p", { class: "muted" }, "No findings.");
  return h("ul", { class: "findings" }, list.map((f) => h("li", {}, h("span", { class: "tag bad" }, f.type.replaceAll("_", " ")), " ", f.detail)));
}
