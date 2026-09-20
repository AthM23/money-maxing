import { act, dataTable, h, toast } from "/dom.js";
import { icon } from "/icons.js";

const MODELS = [["claude-haiku-4-5", "Claude Haiku 4.5", "fast"], ["claude-opus-5", "Claude Opus 5", "most capable"], ["code", "Code only", "free, instant"]];
const history = [];
let model = localStorage.getItem("askModel") ?? "claude-haiku-4-5";
let busy = false;
let pending = null;

/** Another page hands a question over; the Ask page runs it as soon as it is shown. */
export function askFromElsewhere(app, question, useModel = "code") {
  pending = { question, useModel };
  app.go("ask");
}

/**
 * Ask: one question box over the books. The agent chooses among the same read-only tools an MCP client would get,
 * and every table under an answer is a tool's result, computed by code. The tray below the box is those tools.
 */
export function renderAsk(app, o) {
  const tools = o.tools ?? [];
  if (pending) { const p = pending; pending = null; if (p.useModel) model = p.useModel; queueMicrotask(() => run(app, p.question)); }
  const input = h("textarea", { rows: "2", placeholder: tools[0]?.example ?? "Ask about the books…", "aria-label": "Ask the books" });
  const submit = (question) => run(app, question);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
  const picker = h("select", { "aria-label": "Model", on: { change: (e) => { model = e.target.value; localStorage.setItem("askModel", model); } } }, MODELS.map(([id, name, note]) => h("option", { value: id, selected: id === model }, `${name} · ${note}`)));
  return h("section", { class: "askpage" },
    h("div", { class: "askhero" },
      h("h1", {}, "What do you want to know?"),
      h("p", {}, "Ask in plain words. An agent picks the report; code builds it from the ledger, to the cent."),
      h("div", { class: "askcomposer" }, input,
        h("div", { class: "askcontrols" },
          h("span", { class: "scope" }, icon("book", 15), h("span", {}, h("small", {}, "Books"), app.period)),
          h("label", { class: "modelpick" }, h("small", {}, "Model"), picker),
          h("button", { class: `send ${busy ? "busy" : ""}`, disabled: busy, "aria-label": "Ask", on: { click: () => submit(input.value) } }, icon("send", 18)))),
      h("div", { class: "tray" }, h("span", { class: "kick" }, "Or run a tool directly"),
        h("div", { class: "tiles6" }, tools.map((t) => h("button", { class: "tooltile", title: t.description, on: { click: () => (t.needs_input ? (input.value = t.example, input.focus()) : runTile(app, t)) } }, h("span", { class: "tileicon" }, icon(t.icon, 22)), h("b", {}, t.title), h("small", {}, t.example)))))),
    history.length ? h("div", { class: "answers" }, history.map(answerCard)) : h("p", { class: "fineprint" }, "Every tool is read-only. Approvals and answers are given under Input needed, as the person signed in."));
}

async function run(app, question) {
  if (busy || !question.trim()) return;
  busy = true; app.go("ask");
  try {
    const a = await act("ask", { question, period: app.period, model });
    history.unshift({ question, ...a });
  } catch (err) { toast(err.message, "bad"); }
  busy = false; app.go("ask");
}

async function runTile(app, tool) {
  try {
    const result = await act("tool", { name: tool.name, input: {}, period: app.period });
    history.unshift({ question: tool.example, model: "code", text: result.summary, used: [{ tool: tool.name, title: tool.title, input: {}, result }], usage: null, elapsed_ms: null });
    app.go("ask");
  } catch (err) { toast(err.message, "bad"); }
}

function answerCard(a) {
  const meta = [a.model === "code" ? "code only" : a.model, a.elapsed_ms !== null && a.elapsed_ms !== undefined ? `${(a.elapsed_ms / 1000).toFixed(1)} s` : null, a.usage ? `${a.usage.input_tokens + a.usage.output_tokens} tokens · ${a.usage.turns} turns` : "no model call"].filter(Boolean).join(" · ");
  return h("div", { class: "panel answer" },
    h("p", { class: "asked" }, a.question),
    h("p", { class: "lead" }, a.text),
    a.used.length ? h("div", { class: "bubbles" }, a.used.map((u) => h("span", { class: "bubble" }, u.tool))) : null,
    a.used.map((u) => u.result.table ? h("div", { class: "subpanel" }, h("h3", {}, u.result.title), dataTable(u.result.table, { totalFirst: u.tool === "ar_ageing", totalLast: u.tool === "trial_balance" }), h("p", { class: "muted small" }, `Computed by code from: ${u.result.source}`)) : null),
    h("p", { class: "nodefoot mono" }, meta));
}
