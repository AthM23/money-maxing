import { h, money, s } from "/dom.js";
import { openDrawer } from "/app.js";

/** Contracts and the revenue schedules built from them. Lane B's revenue engine writes these; this page reads them. */
export function renderRevenue(app) {
  const rev = app.modules?.revenue;
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Revenue"), h("p", { class: "muted" }, "Every contract on file, and the schedule code built from its terms. A concession approved in Cash revises the schedule as a new version."))),
    !rev?.available ? h("div", { class: "panel" }, h("p", { class: "muted" }, "This database has no revenue schedules. Seed the world with pnpm seed and run pnpm spine.")) :
      h("div", { class: "panel" }, table(rev.contracts)));
}

function table(contracts) {
  const head = ["Customer", "Contract", "Term", "Schedule", "Contract value", "Scheduled"];
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { class: i > 3 ? "num" : "" }, t)))),
    h("tbody", {}, contracts.map((c) => h("tr", { class: c.schedule_id ? "click" : "", on: c.schedule_id ? { click: () => openDrawer(schedule(c)) } : {} },
      h("td", {}, h("div", { class: "namecell" }, h("span", { class: "avatar sm" }, (c.party ?? c.party_id).slice(0, 1).toUpperCase()), h("b", {}, c.party ?? c.party_id))),
      h("td", { class: "mono" }, c.id), h("td", { class: "muted" }, `${c.start_date} → ${c.end_date}`),
      h("td", {}, c.schedule_id ? h("span", { class: "pill ok" }, `v${c.version} · ${c.method.replaceAll("_", " ")}`) : h("span", { class: "pill wait" }, "needs a schedule")),
      h("td", { class: "num" }, money(c.value_cents)), h("td", { class: `num ${c.scheduled_cents !== c.value_cents && c.schedule_id ? "short" : ""}` }, c.schedule_id ? money(c.scheduled_cents) : "—")))));
}

function schedule(c) {
  const max = Math.max(...c.lines.map((l) => l.amount_cents), 1);
  const W = 560, H = 160, bw = (W - 20) / c.lines.length;
  return h("div", {}, h("p", { class: "kick" }, `${c.id} · schedule v${c.version}`), h("h2", {}, c.party ?? c.party_id),
    h("p", { class: "lead" }, `${money(c.scheduled_cents)} recognised ${c.method.replaceAll("_", " ")} over ${c.lines.length} months.`),
    s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" }, c.lines.map((l, i) => s("rect", { x: 10 + i * bw + 2, y: H - 20 - (l.amount_cents / max) * (H - 40), width: Math.max(bw - 4, 2), height: (l.amount_cents / max) * (H - 40), rx: 3, fill: "#101012" }))),
    h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, h("th", {}, "Month"), h("th", { class: "num" }, "Revenue"))), h("tbody", {}, c.lines.map((l) => h("tr", {}, h("td", { class: "mono" }, l.period), h("td", { class: "num" }, money(l.amount_cents)))))));
}
