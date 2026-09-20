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
    history.length ? h("div", { class: "answers" }, history.map((a) => answerCard(app, a))) : h("p", { class: "fineprint" }, "Every tool is read-only. Approvals and answers are given under Input needed, as the person signed in."));
}

async function run(app, question) {
  if (busy || !question.trim()) return;
  busy = true;
  // A card goes up at once, so there is never a moment when nothing seems to be happening.
  const pendingCard = { question, pending: true, model };
  history.unshift(pendingCard);
  app.go("ask");
  reveal();
  try {
    // What was said before goes along, newest last, so a follow-up ("yes, that customer") means something. Text only.
    const said = history.filter((x) => !x.pending && !x.failed && x.text).slice(0, 6).reverse().map((x) => ({ question: x.question.slice(0, 300), answer: x.text.slice(0, 2000) }));
    const a = await act("ask", { question, period: app.period, model, history: said });
    history[history.indexOf(pendingCard)] = { question, ...a };
  } catch (err) {
    history[history.indexOf(pendingCard)] = { question, failed: err.message, model, used: [] };
  }
  busy = false;
  app.go("ask");
  reveal();
}

async function runTile(app, tool) {
  const pendingCard = { question: tool.example, pending: true, model: "code" };
  history.unshift(pendingCard);
  app.go("ask");
  reveal();
  try {
    const started = performance.now();
    const result = await act("tool", { name: tool.name, input: {}, period: app.period });
    history[history.indexOf(pendingCard)] = { question: tool.example, model: "code", text: result.summary, usage: null, elapsed_ms: Math.round(performance.now() - started),
      used: [{ tool: tool.name, title: tool.title, input: {}, result, ms: null, rows: result.table?.rows.length ?? 0 }] };
  } catch (err) {
    history[history.indexOf(pendingCard)] = { question: tool.example, failed: err.message, model: "code", used: [] };
  }
  app.go("ask");
  reveal();
}

/** Bring the newest answer into view: it lands below the composer, where it is easy to miss. */
function reveal() {
  // A timer, not an animation frame: browsers pause animation frames in a tab that is not in front.
  setTimeout(() => document.querySelector(".answers .answer")?.scrollIntoView({ behavior: document.hidden ? "auto" : "smooth", block: "start" }), 60);
}

function answerCard(app, a) {
  if (a.pending) return h("div", { class: "panel answer working" }, h("p", { class: "asked" }, a.question),
    h("p", { class: "lead" }, h("span", { class: "pulse" }), a.model === "code" ? "Running the report…" : `Asking ${a.model}: it reads the question, picks tools, and code runs them…`));
  if (a.failed) return h("div", { class: "panel answer failed" }, h("p", { class: "asked" }, a.question), h("p", { class: "lead error" }, a.failed));
  const meta = [a.model === "code" ? "code only" : a.model, a.elapsed_ms !== null && a.elapsed_ms !== undefined ? `${(a.elapsed_ms / 1000).toFixed(1)} s` : null, a.usage ? `${a.usage.input_tokens + a.usage.output_tokens} tokens · ${a.usage.turns} turns` : "no model call"].filter(Boolean).join(" · ");
  return h("div", { class: "panel answer" },
    h("p", { class: "asked" }, a.question),
    h("p", { class: "lead" }, a.text),
    a.handoffs?.length ? h("div", { class: "handoffs" }, a.handoffs.map((x) => handoff(app, x))) : null,
    a.used.length ? h("div", { class: "receipts" }, h("span", { class: "kick" }, a.used.length === 1 ? "Tool that ran" : `${a.used.length} tools ran`), a.used.map(receipt)) : a.handoffs?.length ? null : h("p", { class: "muted small" }, "No tool ran for this one."),
    a.used.map((u) => u.result.table ? h("div", { class: "subpanel" }, h("h3", {}, u.result.title), dataTable(u.result.table, { totalFirst: u.tool === "ar_ageing", totalLast: u.tool === "trial_balance" }), h("p", { class: "muted small" }, `Computed by code from: ${u.result.source}`)) : null),
    h("p", { class: "nodefoot mono" }, meta));
}

/** One line per tool that actually ran: proof that the answer came from the books and not from the model's head. */
function receipt(u) {
  const input = u.input && Object.keys(u.input).length ? Object.entries(u.input).map(([k, v]) => `${k}: ${v}`).join(", ") : null;
  return h("div", { class: "receipt" }, h("span", { class: "ok" }, icon("check", 14)), h("b", { class: "mono" }, u.tool), input ? h("span", { class: "muted" }, `(${input})`) : null,
    h("span", { class: "muted" }, `${u.rows} row${u.rows === 1 ? "" : "s"}${u.ms !== null && u.ms !== undefined ? ` · ${u.ms} ms` : ""} · read-only`));
}

const PLACES = { input_needed: ["queue", "Open Input needed", "inbox"], cash: ["run", "Open Cash", "cash"], close: ["close", "Open Close", "list"], policies: ["policies", "Open Policies", "book"], agents: ["fleet", "Open Agents", "flow"] };

/**
 * The agent cannot change the books. What it can do is put the place where a person does that one click away, or
 * offer the one action that is free and safe to offer: a pass of the code tier, which the person still has to click.
 */
function handoff(app, x) {
  if (x.to === "run_code_tier") {
    return h("div", { class: "handoff" }, h("button", { class: "btn ink", on: { click: async (e) => {
      e.target.disabled = true;
      try {
        const r = await act("run", {});
        toast(`Code tier ran over ${r.worked.length} open case(s): no model, no cost. ${r.worked.filter((w) => w.status === "resolved").length} settled.`);
        await app.refresh();
      } catch (err) { toast(err.message, "bad"); e.target.disabled = false; }
    } } }, icon("play", 14), "Run the code tier"), h("span", { class: "muted" }, x.why));
  }
  const [view, label, iconName] = PLACES[x.to] ?? PLACES.input_needed;
  return h("div", { class: "handoff" }, h("button", { class: "btn white", on: { click: () => app.go(view) } }, icon(iconName, 14), label), h("span", { class: "muted" }, x.why));
}
