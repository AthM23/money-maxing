import { clock, cost, duration, getJson, h, money, statusPill } from "/dom.js";
import { icon } from "/icons.js";
import { tracePanel } from "/views/tracepanel.js";

const KIND = { code: ["shield", "Harness"], model: ["spark", "LLM agent"], person: ["user", "Person"] };
const WORKER = { code: ["code", "Rules"], reader: ["reader", "Reader"], haiku: ["model", "Haiku"], sonnet: ["model", "Sonnet"], opus: ["model", "Opus"], controller: ["controller", "Controller"], person: ["person", "Person"] };

// Which run's trace is open. Kept across redraws so the page does not jump back while you are reading one.
let selected = null;

/**
 * The agents' own page: who works here and what each did this month, then every run with its trace (which tools, at
 * what time, what the kernel refused, what it cost), then the month as it happened. Nothing here needs a case opened.
 */
export async function renderFleet(app) {
  const f = await getJson("/api/fleet");
  const traceSlot = h("div", { id: "runtrace" });
  const pick = async (intentId, scroll) => {
    selected = intentId;
    for (const row of document.querySelectorAll("tr[data-run]")) row.classList.toggle("on", row.dataset.run === intentId);
    traceSlot.replaceChildren(h("p", { class: "muted" }, "Loading the trace…"));
    try {
      const v = await getJson(`/api/case?intent=${encodeURIComponent(intentId)}`);
      traceSlot.replaceChildren(tracePanel(v, `Trace · ${v.receipt.party_name ?? v.receipt.party_id}`),
        h("p", { class: "fineprint" }, h("button", { class: "link", on: { click: () => app.go("case", intentId) } }, "Open this receipt in Cash: the invoice explained to the cent, and anything waiting for you")));
      if (scroll) setTimeout(() => traceSlot.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (err) { traceSlot.replaceChildren(h("p", { class: "error" }, err.message)); }
  };
  const first = f.runs.find((r) => r.intent_id === selected) ?? [...f.runs].sort((a, b) => b.model_calls - a.model_calls || b.tool_calls - a.tool_calls || b.turns - a.turns)[0];
  if (first) pick(first.intent_id, false);
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Agents"), h("p", { class: "muted" }, "Who works here, what each of them did, and every run's trace. Each turn is a row in the ledger's own database, so this is a record, not a log someone chose to keep.")),
      h("a", { class: "btn white", href: "/flow", target: "_blank", rel: "noopener" }, icon("spark", 16), "The month as one picture")),
    h("div", { class: "stats" }, stat(f.runs.length, "runs this month"), stat(f.totals.tool_calls, "lookups"), stat(f.totals.model_calls, "model calls"),
      stat(`${cost(f.totals.cost_micros)}${f.totals.uncosted_turns ? "+" : ""}`, f.totals.uncosted_turns ? `model cost · ${f.totals.uncosted_turns} aborted turn(s) not costed` : "model cost"), stat(f.totals.kernel_refusals, "drafts the kernel refused", f.totals.kernel_refusals ? "bad" : "")),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "The agents"), h("p", { class: "muted" }, "They read documents, reason over them and propose. Cheapest first, and one that was not needed says so."))), roster(f.roster.filter((e) => e.group === "agents"))),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "The harness around them"), h("p", { class: "muted" }, "What lets an agent be trusted with the books, and what makes it cheaper every month: a checker that can only refuse, the rules the team has already approved, and the monitors and engines that keep every book in step."))), roster(f.roster.filter((e) => e.group !== "agents"))),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "Runs"), h("p", { class: "muted" }, "One row per case. Pick one to read its trace below."))), runs(f.runs, first?.intent_id, pick)),
    traceSlot,
    h("div", { class: "panel" }, h("h2", {}, "As it happened"), h("ol", { class: "feed" }, f.feed.map((item) => feedRow(pick, item)))));
}

function stat(value, label, tone = "") {
  return h("div", { class: `stat ${tone}` }, h("b", {}, value), h("span", {}, label));
}

function roster(entries) {
  return h("div", { class: "roster" }, entries.map((e) => {
    const [iconName, kindLabel] = KIND[e.kind];
    return h("div", { class: `agentcard ${e.kind} ${e.idle ? "idle" : ""}` },
      h("div", { class: "agenthead" }, h("span", { class: `agenticon ${e.kind}` }, icon(iconName, 16)), h("b", {}, e.name), h("span", { class: `chip ${e.kind === "person" ? "wait" : e.kind}` }, kindLabel)),
      h("p", { class: "muted small" }, e.role),
      h("p", { class: "did" }, e.did, e.cost_micros ? h("span", { class: "mono muted" }, ` · ${cost(e.cost_micros)}`) : null));
  }));
}

function runs(rows, openId, pick) {
  const head = ["Customer", "Worked by", "Lookups", "Model calls", "Refused", "Cost", "Working time", "Stands"];
  return h("table", { class: "tbl runs" }, h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { class: i >= 2 && i <= 6 ? "num" : "" }, t)))),
    h("tbody", {}, rows.map((r) => h("tr", { class: `click ${r.intent_id === openId ? "on" : ""}`, "data-run": r.intent_id, on: { click: () => pick(r.intent_id, true) } },
      h("td", {}, h("b", {}, r.party ?? "—"), h("span", { class: "muted small block" }, `${r.docs.join(", ") || "no invoice named"}${r.shortfall_cents > 0 ? ` · ${money(r.shortfall_cents)} short` : ""}`)),
      h("td", {}, h("div", { class: "workers" }, r.workers.map((w) => h("span", { class: `wk ${WORKER[w]?.[0] ?? "code"}` }, WORKER[w]?.[1] ?? w)))),
      h("td", { class: "num" }, r.tool_calls || "—"), h("td", { class: "num" }, r.model_calls || "—"), h("td", { class: `num ${r.kernel_refusals ? "short" : ""}` }, r.kernel_refusals || "—"),
      h("td", { class: "num mono" }, cost(r.cost_micros)), h("td", { class: "num mono" }, r.busy_ms ? duration(r.busy_ms) : "—"), h("td", {}, statusPill(r.status))))));
}

function feedRow(pick, item) {
  return h("li", { class: `feeditem ${item.tone}`, on: { click: () => pick(item.intent_id, true) } },
    h("span", { class: "when mono" }, clock(item.at)), h("span", {}, h("b", {}, item.worker), ` ${item.what}`, item.party ? ` · ${item.party}` : "", item.amount_cents ? ` · ${money(item.amount_cents)}` : ""));
}
