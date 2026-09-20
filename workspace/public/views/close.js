import { act, h, s, toast } from "/dom.js";
import { auditCard } from "/views/audit.js";

const TONE = { done: "ok", in_progress: "prog", todo: "open", blocked: "wait" };
const AREA = { "bank-rec": "Bank reconciliation", ar: "Accounts receivable", ap: "Accounts payable", revenue: "Revenue", forecast: "Forecast", close: "Close" };

/** The close as a checklist that ticks itself from the ledger, and the auditor's seat beside it. */
export function renderClose(app) {
  const c = app.modules?.close;
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, c?.available ? `Close run · ${c.period}` : "Close run"), h("p", { class: "muted" }, "Items are tests on the ledger, not boxes someone ticks. A blocked item says what it is waiting on, and one that is not built yet says so."))),
    !c?.available ? h("div", { class: "panel" }, h("p", { class: "muted" }, "This database has no close checklist. Run pnpm spine on a seeded world.")) :
      h("div", { class: "grid2 lean" }, h("div", { class: "panel center" }, ring(c.done, c.items.length), h("p", { class: "muted" }, "items that hold in the ledger today")), h("div", { class: "panel" }, checklist(app, c.items))),
    auditCard(app));
}

function ring(done, total) {
  const R = 70, LEN = 2 * Math.PI * R;
  return h("div", { class: "ring" }, s("svg", { viewBox: "0 0 180 180", width: 180 },
    s("circle", { cx: 90, cy: 90, r: R, fill: "none", stroke: "#f0f0ec", "stroke-width": 14 }),
    s("circle", { cx: 90, cy: 90, r: R, fill: "none", stroke: "#3fae52", "stroke-width": 14, "stroke-linecap": "round", "stroke-dasharray": `${(done / Math.max(total, 1)) * LEN} ${LEN}`, transform: "rotate(-90 90 90)" })),
    h("div", { class: "ringcenter" }, h("b", {}, `${done}/${total}`), h("span", {}, "done")));
}

function checklist(app, items) {
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["Task", "Area", "Status", ""].map((t) => h("th", {}, t)))),
    h("tbody", {}, items.map((i) => h("tr", {},
      h("td", {}, h("b", {}, i.name), i.reason ? h("small", { class: "muted block" }, i.reason) : null),
      h("td", { class: "muted" }, AREA[i.area] ?? i.area), h("td", {}, h("span", { class: `pill ${TONE[i.status] ?? "open"}` }, i.status.replaceAll("_", " "))),
      h("td", { class: "num" }, moveIt(app, i))))));
}

/**
 * What would move an item, as a button. Work the agents can do is run here; work that is a person's is one click from
 * where that person does it. An item that waits on another item has no button: finishing the other one moves it.
 */
function moveIt(app, item) {
  if (item.status === "done" || item.status === "blocked") return null;
  const waiting = Object.values(app.overview.awaiting_you).reduce((n, list) => n + list.length, 0);
  if (item.area === "bank-rec") return h("button", { class: "btn ink sm", on: { click: () => runCode(app) } }, "Run the code tier");
  if (item.area === "ar" || /question|people/i.test(item.name)) return waiting ? h("button", { class: "btn lime sm", on: { click: () => app.go("queue") } }, `Review ${waiting} waiting`) : h("button", { class: "btn white sm", on: { click: () => app.go("run") } }, "Open the cases");
  // Accruals: the close's own monitor looks for recurring expenses nobody has billed, and code estimates the steady ones.
  if (/accrual/i.test(item.name)) {
    const parked = app.overview.awaiting_you.parked_entries.filter((x) => x.kind === "accrual").length;
    return parked ? h("button", { class: "btn lime sm", on: { click: () => app.go("queue") } }, `Review ${parked} accrual${parked === 1 ? "" : "s"}`) : h("button", { class: "btn ink sm", on: { click: () => findAccruals(app) } }, "Find unbilled expenses");
  }
  return h("span", { class: "muted small" }, "not built yet");
}

async function findAccruals(app) {
  try {
    const r = await act("accruals", { period: app.modules?.close?.period ?? app.period });
    toast(r.unbilled.length === 0 ? "Every recurring vendor expense has something booked for the month." :
      `${r.prepared} accrual(s) prepared by code from the ledger's history and waiting for you; ${r.left_for_a_model} move too much to average and need their amount found in the vendor's own words.`);
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

async function runCode(app) {
  try {
    const r = await act("run", {});
    toast(r.worked.length ? `Code worked ${r.worked.length} case(s) with no model call.` : "Nothing new for code to settle: what is left needs a person or a model.");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}
