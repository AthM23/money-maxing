import { h } from "/dom.js";
import { flowView } from "/views/flow.js";
import { traceView } from "/views/traceview.js";

let traceMode = "flow";

/**
 * One case's trace, two ways: a flow on a grid for reading the story, a timeline for reading every call in order with
 * its time. `v` is what /api/case returns. Used on the case's own page and on the Agents page.
 */
export function tracePanel(v, heading = "Agent trace") {
  const body = h("div", {});
  const draw = () => body.replaceChildren(traceMode === "flow" ? flowView(v) : h("div", { class: "console" }, traceView(v.trace)));
  const toggle = h("div", { class: "seg2" }, ["flow", "timeline"].map((m) => h("button", { class: traceMode === m ? "on" : "", on: { click: (e) => { traceMode = m; for (const b of e.target.parentElement.children) b.classList.toggle("on", b === e.target); draw(); } } }, m === "flow" ? "Flow" : "Timeline")));
  draw();
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, heading), h("p", { class: "muted" }, "Every turn anyone took on this case, with its tools, its time and its cost. Click a bubble for what a tool was given and what it gave back.")), toggle), body);
}
