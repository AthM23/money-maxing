import { getJson, h, toast } from "/dom.js";
import { icon } from "/icons.js";
import { renderOverview } from "/views/overview.js";
import { renderRun } from "/views/run.js";
import { renderCase } from "/views/case.js";
import { renderRevenue } from "/views/revenue.js";
import { renderClose } from "/views/close.js";
import { renderReports } from "/views/reports.js";
import { renderQueue } from "/views/queue.js";
import { renderPolicies } from "/views/policies.js";
import { renderFleet } from "/views/fleet.js";
import { renderAsk } from "/views/ask.js";
import { renderModel } from "/views/model.js";

// One object holds what the page knows. Views read it and call `app.go` or `app.refresh`; nothing else is shared.
export const app = {
  overview: null,
  modules: null,
  route: { view: "overview", id: null },
  signature: "",
  /** The one person this workspace reports to. Every approval and answer made here is made as them. */
  get viewer() { return this.overview?.viewer ?? null; },
  get period() {
    const dates = (this.overview?.receipts ?? []).map((r) => r.bank_line?.posted_date).filter(Boolean).sort();
    return (dates.at(-1) ?? new Date().toISOString()).slice(0, 7);
  },
  go(view, id = null) {
    const moved = this.route.view !== view || this.route.id !== id;
    this.route = { view, id };
    history.replaceState(null, "", id ? `#${view}/${id}` : `#${view}`);
    closeDrawer();
    // Only a change of page starts from the top. Redrawing the page you are on leaves you where you were.
    if (moved) window.scrollTo({ top: 0 });
    render();
  },
  /** Re-reads the books. The page is only redrawn when something in them changed, so an open trace stays open. */
  async refresh(force = true) {
    try {
      const next = await getJson("/api/overview");
      const signature = JSON.stringify({ ...next, generated_at: null });
      if (!force && signature === this.signature) return;
      this.signature = signature;
      this.overview = next;
      this.modules = await getJson(`/api/modules?period=${this.period}`);
      render();
    } catch (err) {
      toast(err.message, "bad");
    }
  },
};

const VIEWS = {
  overview: { label: "Overview", icon: "grid", render: renderOverview },
  ask: { label: "Ask", icon: "spark", render: renderAsk },
  run: { label: "Cash", icon: "cash", render: renderRun },
  revenue: { label: "Revenue", icon: "trend", render: renderRevenue },
  close: { label: "Close", icon: "list", render: renderClose },
  reports: { label: "Reports", icon: "chart", render: renderReports },
  queue: { label: "Input needed", icon: "inbox", render: renderQueue, count: (o) => Object.values(o.awaiting_you).reduce((n, list) => n + list.length, 0) },
  policies: { label: "Policies", icon: "book", render: renderPolicies },
  fleet: { label: "Agents", icon: "flow", render: renderFleet },
  model: { label: "Model", icon: "chip", render: renderModel },
  case: { label: null, render: renderCase },
};

export function openDrawer(content) {
  const drawer = document.getElementById("drawer");
  drawer.replaceChildren(h("button", { class: "close", on: { click: closeDrawer }, "aria-label": "Close" }, "×"), content);
  drawer.hidden = false;
}

export function closeDrawer() {
  const drawer = document.getElementById("drawer");
  drawer.hidden = true;
  drawer.replaceChildren();
}

function render() {
  const o = app.overview;
  if (!o) return;
  document.getElementById("brand").textContent = o.brand;
  document.title = o.brand;
  renderNav(o);
  renderMe(o);
  const main = document.getElementById("main");
  const view = VIEWS[app.route.view] ?? VIEWS.overview;
  Promise.resolve().then(() => view.render(app, o)).then((node) => main.replaceChildren(node)).catch((err) => main.replaceChildren(h("p", { class: "error" }, err.message)));
}

// The rail shows the sections in two groups: the books themselves, then the agents that keep them.
const GROUPS = [["Books", ["overview", "run", "revenue", "close", "reports"]], ["Agents", ["ask", "queue", "fleet", "policies", "model"]]];

function renderNav(o) {
  const button = (key) => {
    const v = VIEWS[key];
    const n = v.count ? v.count(o) : 0;
    const active = app.route.view === key || (key === "run" && app.route.view === "case");
    return h("button", { class: active ? "active" : "", on: { click: () => app.go(key) } }, icon(v.icon, 17), v.label, n > 0 ? h("span", { class: "count" }, n) : null);
  };
  document.getElementById("nav").replaceChildren(...GROUPS.flatMap(([title, keys]) => [h("p", { class: "railgroup" }, title), ...keys.map(button)]));
}

function renderMe(o) {
  const v = o.viewer;
  if (!v) return document.getElementById("me").replaceChildren();
  const name = v.name.replace(/\s*\(.*\)$/, "");
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("me").replaceChildren(h("span", { class: "avatar" }, initials), h("span", { class: "who" }, h("b", {}, name), h("span", {}, v.role.replaceAll("_", " ").toUpperCase())));
}

function fromHash() {
  const [view, id] = location.hash.slice(1).split("/");
  if (VIEWS[view]) app.route = { view, id: id ?? null };
}

fromHash();
window.addEventListener("hashchange", () => { fromHash(); render(); });
app.refresh();
// Other processes change the books too (the worker in a terminal, an approval in Slack), so the page keeps looking.
setInterval(() => { if (document.getElementById("drawer").hidden && !document.querySelector("textarea:focus, input:focus, select:focus")) app.refresh(false); }, 4000);
