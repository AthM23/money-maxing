import { clock, cost, duration, h, money, words } from "/dom.js";
import { openDrawer } from "/app.js";
import { icon } from "/icons.js";
import { evidencePanel } from "/views/evidence.js";

const ENTRY = { apply_payment: "cash applied", write_off: "bank charges written off", fx_realized: "realized FX", credit_memo: "credit to the customer", tax_withholding: "tax withheld at source", unapplied_cash: "held as unapplied cash", dispute_hold: "held as disputed" };

// An entry that did not post is named as an attempt, never as the thing it failed to do.
const TRIED = { apply_payment: "tried to apply the cash", write_off: "tried a write-off", fx_realized: "tried realized FX", credit_memo: "tried a credit", tax_withholding: "tried withholding" };

const LANE = {
  code: { icon: "code", label: "Code tier", tone: "green" }, model: { icon: "spark", label: "Model", tone: "violet" }, reader: { icon: "doc", label: "Document reader", tone: "blue" },
  controller: { icon: "shield", label: "Controller agent", tone: "amber" }, person: { icon: "user", label: "Person", tone: "coral" },
};

/**
 * The case as a flow on a grid: the bank line comes in at the top, every turn is a node, tool calls are bubbles under
 * the node's heading, what ran and what it cost sits at the node's bottom right, and what the kernel refused hangs off
 * to the side. Click a bubble for what the tool was given and what it gave back.
 */
export function flowView(v) {
  const nodes = [entrance(v), ...turnNodes(v.trace.spans), ending(v)];
  const column = [];
  nodes.forEach((n, i) => {
    if (i > 0) column.push(edge(n.via));
    column.push(n.side ? h("div", { class: "noderow" }, n.el, h("div", { class: "sidelink" }, h("span", {}, n.side.via)), n.side.el) : n.el);
  });
  return h("div", { class: "flow" }, h("div", { class: "flowcol" }, column));
}

function edge(label) {
  return h("div", { class: "edge" }, label ? h("span", { class: "edgelabel" }, label) : null);
}

function node({ tone, iconName, type, title, sub, chips = [], foot = [] }) {
  return h("div", { class: `node ${tone}` },
    h("div", { class: "nodehead" }, h("span", { class: `nodeicon ${tone}` }, icon(iconName)), h("span", { class: "nodetype" }, type)),
    h("p", { class: "nodetitle" }, title), sub ? h("p", { class: "nodesub" }, sub) : null,
    chips.length ? h("div", { class: "bubbles" }, chips) : null,
    foot.length ? h("div", { class: "nodefoot mono" }, foot.filter(Boolean).join(" · ")) : null);
}

function entrance(v) {
  const r = v.receipt;
  const b = r.bank_line;
  const chips = [bubble(`invoiced ${money(r.expected_cents)}`), r.shortfall_cents > 0 ? bubble(`short ${money(r.shortfall_cents)}`, "coral") : bubble("paid in full", "green")];
  return { via: null, el: node({ tone: "ink", iconName: "bank", type: "Bank feed", title: `${b?.id ?? "Bank line"} · +${money(r.received_cents)}`, sub: b?.descriptor ?? "", chips, foot: ["drift monitor opened the case", b?.posted_date] }) };
}

/** Consecutive code turns are one node: code does not deliberate, it posts. Every other turn is a node of its own. */
function turnNodes(spans) {
  const out = [];
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.lane === "code") {
      const run = [s];
      while (spans[i + 1]?.lane === "code" && spans[i + 1].actor === s.actor) run.push(spans[++i]);
      out.push(codeNode(run, out.at(-1)));
    } else if (s.lane === "person") out.push(personNode(s));
    else out.push(agentNode(s, out.at(-1)));
  }
  return out;
}

function codeNode(run, previous) {
  const posted = run.filter((s) => s.outcome.startsWith("posted")).length;
  const resumed = run[0].actor === "router:resume";
  const chips = run.filter((s) => s.kind && s.kind !== "no_action").map((s) => bubble(s.outcome.startsWith("posted") ? `${ENTRY[s.kind] ?? words(s.kind)} · posted` : `${TRIED[s.kind] ?? words(s.kind)} · ${s.outcome}`, s.outcome.startsWith("posted") ? "green" : "coral", () => showEntry(s.decision_id)));
  for (const s of run) for (const st of s.steps.filter((x) => x.kind === "approval")) chips.push(bubble(st.title, st.status === "ok" ? "green" : "coral"));
  const refused = run.some((s) => s.outcome.startsWith("refused"));
  const approved = run.some((s) => s.outcome === "posted after approval");
  const parked = run.some((s) => s.outcome === "parked for a person");
  const title = resumed ? "Prepared the entry the person's answer calls for" : posted ? `Posted ${posted} entr${posted === 1 ? "y" : "ies"}${approved ? "; approval recorded" : " with no person involved"}` : refused ? "Proposed an entry; the kernel refused it, so nothing posted" : parked ? "Prepared an entry; waiting for approval" : "Nothing more it can settle from code";
  return { via: previous ? viaOf(previous.span) : "case opened", span: run.at(-1),
    el: node({ tone: "green", iconName: "code", type: resumed ? "Code · from the answer" : "Code tier", title, chips, foot: ["code", duration(run.reduce((n, s) => n + s.duration_ms, 0)), "$0"] }) };
}

function agentNode(s, previous) {
  const lane = LANE[s.lane];
  const tools = new Map();
  for (const st of s.steps.filter((x) => x.kind === "tool")) tools.set(st.title, [...(tools.get(st.title) ?? []), st]);
  const chips = [...tools.entries()].map(([name, calls]) => bubble(calls.length > 1 ? `${name} ×${calls.length}` : name, "", () => showCalls(s, name, calls)));
  for (const st of s.steps.filter((x) => x.kind === "question")) chips.push(bubble(st.title, st.status === "waiting" ? "coral" : "amber", () => showCalls(s, st.title, [st])));
  const refusals = s.steps.filter((x) => x.kind === "proposal" && x.status === "refused");
  const side = refusals.length ? { via: "drafts", el: node({ tone: "coral", iconName: "shield", type: "Kernel", title: `Refused ${refusals.length} draft entr${refusals.length === 1 ? "y" : "ies"}`,
    chips: refusals.flatMap((r) => r.refused_on.map((m) => bubble(m.check, "coral", () => showCalls(s, "propose_entry (refused)", [r])))), foot: ["plain code", "nothing posted"] }) } : null;
  return { via: previous ? viaOf(previous.span) : null, span: s, side,
    el: node({ tone: lane.tone, iconName: lane.icon, type: s.label, title: sentence(s), chips, foot: [s.model, duration(s.duration_ms), s.model_calls ? `${s.model_calls} calls` : null, !s.cost_recorded ? "cost not recorded (turn aborted)" : s.cost_micros ? cost(s.cost_micros) : null] }) };
}

function personNode(s) {
  const step = s.steps[0];
  return { via: "answered", span: s, el: node({ tone: "coral", iconName: "user", type: "Person", title: step?.title ?? "Answered", sub: step?.detail ?? "", chips: [bubble("kept as evidence", "", () => showCalls(s, "The answer, as stored", s.steps))], foot: ["a person", clock(s.started_at)] }) };
}

function ending(v) {
  const r = v.receipt;
  const done = r.status === "resolved";
  const title = done ? `Settled: ${r.doc_ids.join(", ")} paid, books tied` : r.open_questions.length ? "Waiting for a person's answer" : r.parked.length ? "Waiting for an approval" : `Open: ${money(r.open_cents_now)} still to explain`;
  return { via: viaOf(v.trace.spans.at(-1)), el: node({ tone: done ? "lime" : "coral", iconName: done ? "check" : "clock", type: "Ledger", title, foot: [done ? "end condition holds in the ledger" : "end condition not met yet"] }) };
}

function sentence(s) {
  if (s.outcome === "asked a person") return "Looked everywhere, booked nothing, asked one question";
  if (s.outcome.startsWith("handed up")) return "Investigated, then handed up: a cheap tier may not ask a person";
  if (s.outcome.startsWith("ran out")) return "Ran out of its time limit before deciding";
  if (s.outcome.startsWith("posted")) return `Prepared ${words(s.kind)}: ${s.outcome}`;
  if (s.outcome.startsWith("parked")) return `Prepared ${words(s.kind)} and parked it for a person`;
  return s.outcome;
}

function viaOf(span) {
  if (!span) return null;
  if (span.lane === "code") return span.outcome.startsWith("posted") ? "rest goes on" : "next";
  if (span.outcome.startsWith("handed up")) return "handed up";
  if (span.outcome.startsWith("ran out")) return "timed out";
  if (span.outcome === "asked a person") return "asked";
  if (span.lane === "person") return "answer";
  return "next";
}

function bubble(text, tone = "", onClick = null) {
  return h(onClick ? "button" : "span", { class: `bubble ${tone}`, on: onClick ? { click: onClick } : {} }, text);
}

/** The detail panel: what the tool was given and what it gave back, as stored in the database. */
function showCalls(span, name, calls) {
  openDrawer(h("div", { class: "calls" },
    h("p", { class: "kick" }, `${span.label} · ${span.model}`), h("h2", {}, name),
    calls.map((c, i) => h("div", { class: "call" },
      h("div", { class: "callhead" }, h("b", {}, calls.length > 1 ? `Call ${i + 1}` : "Call"), h("span", { class: "muted mono" }, `${clock(c.at)}${c.latency_ms ? ` · ${duration(c.latency_ms)}` : ""}`)),
      c.refused_on.length ? h("ul", { class: "refusedlist" }, c.refused_on.map((m) => h("li", {}, h("b", { class: "mono" }, m.check), ` ${m.detail}`))) : null,
      c.input ? h("details", { open: true }, h("summary", {}, "Input"), h("pre", {}, c.input)) : null,
      c.output ? h("details", { open: true }, h("summary", {}, "Output"), h("pre", {}, c.output)) : null))));
}

async function showEntry(decisionId) {
  try { openDrawer(await evidencePanel(decisionId)); } catch (err) { openDrawer(h("p", { class: "error" }, err.message)); }
}
