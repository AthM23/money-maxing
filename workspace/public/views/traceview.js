import { clock, cost, duration, h } from "/dom.js";

const LANE_NAMES = { code: "Code", reader: "Document reader", model: "Model", controller: "Controller agent", person: "Person" };

/**
 * A case's trace, the way an engineer reads one in a tracing tool, written for someone who runs a finance team: a time
 * axis on top with one bar per turn, then each turn opened out into what it looked at, what the kernel refused, what
 * it asked and who answered. Time and cost are on every turn.
 */
export function traceView(trace) {
  if (!trace || trace.spans.length === 0) return h("p", { class: "muted" }, "Nothing has worked this case yet.");
  const t = trace.totals;
  trace = { ...trace, spans: collapseRepeats(trace.spans) };
  return h("div", { class: "trace" },
    h("div", { class: "tracetotals" },
      fact(t.turns, "turns"), fact(t.tool_calls, "lookups"), fact(t.model_calls, "model calls"), fact(`${cost(t.cost_micros)}${t.uncosted_turns ? "+" : ""}`, t.uncosted_turns ? `model cost · ${t.uncosted_turns} aborted turn not costed` : "model cost"),
      fact(t.kernel_refusals, "drafts the kernel refused", t.kernel_refusals > 0 ? "bad" : ""), fact(t.questions, "questions to a person"), fact(t.posted, "entries posted")),
    waterfall(trace),
    h("div", { class: "spans" }, trace.spans.map((s, i) => spanCard(s, i))));
}

/**
 * Every pass over an open case records that code could settle nothing more. Read in a row they say one thing, so they
 * are shown once, with how many passes said it. Nothing is dropped from the record, only from this view.
 */
function collapseRepeats(spans) {
  const out = [];
  for (const s of spans) {
    const last = out.at(-1);
    const idle = (x) => x.lane === "code" && x.kind === "no_action" && x.steps.every((st) => st.kind !== "proposal");
    if (last && idle(last) && idle(s) && last.label === s.label) out[out.length - 1] = { ...last, repeats: (last.repeats ?? 1) + 1 };
    else out.push(s);
  }
  return out;
}

function fact(value, label, tone = "") {
  return h("div", { class: `fact ${tone}` }, h("b", {}, value), h("span", {}, label));
}

/** Bars on one time axis. Working time is squeezed so that a nine-minute model turn does not hide a 15 ms code turn. */
function waterfall(trace) {
  const work = trace.spans.map((s) => Math.max(s.duration_ms, 1));
  const weights = work.map((ms) => Math.log10(ms + 10));
  const total = weights.reduce((n, w) => n + w, 0);
  let offset = 0;
  const rows = trace.spans.map((s, i) => {
    const width = (weights[i] / total) * 100;
    const bar = h("div", { class: "wfrow" },
      h("span", { class: "wflabel" }, s.label, s.lane === "code" && s.kind ? h("span", { class: "muted" }, ` · ${s.kind.replaceAll("_", " ")}`) : null),
      h("div", { class: "wftrack" }, h("a", { class: `wfbar ${s.lane}`, href: `#span-${i}`, style: { marginLeft: `${offset}%`, width: `${Math.max(width, 1.5)}%` }, title: `${s.label}: ${duration(s.duration_ms)}` })),
      h("span", { class: "wfmeta mono" }, duration(s.duration_ms), s.cost_micros > 0 ? ` · ${cost(s.cost_micros)}` : ""));
    offset += width;
    return bar;
  });
  return h("div", { class: "waterfall" }, rows, h("p", { class: "muted small" }, "Bar widths are on a log scale of working time; waiting for a person is not drawn."));
}

function spanCard(s, index) {
  const open = s.lane !== "code" || s.steps.some((st) => st.status === "refused");
  const head = h("summary", {},
    h("span", { class: `dot ${s.lane}` }), h("b", {}, s.label), h("span", { class: "muted" }, ` · ${s.kind && s.kind !== "no_action" ? s.kind.replaceAll("_", " ") : LANE_NAMES[s.lane]}${s.repeats ? `, on ${s.repeats} passes` : ""}`),
    h("span", { class: `outcome ${toneOf(s.outcome)}` }, s.outcome),
    h("span", { class: "spanmeta mono" }, clock(s.started_at), " · ", duration(s.duration_ms), s.model_calls ? ` · ${s.model_calls} model calls` : "", !s.cost_recorded ? " · cost not recorded" : s.cost_micros ? ` · ${cost(s.cost_micros)}` : ""));
  return h("details", { class: "span", id: `span-${index}`, open }, head, h("ol", { class: "steps" }, s.steps.map(stepRow)));
}

function stepRow(step) {
  return h("li", { class: `step ${step.status} ${step.kind}` },
    h("span", { class: "when mono" }, clock(step.at)),
    h("div", {}, h("b", {}, step.title), step.detail ? h("span", { class: "detail" }, ` — ${step.detail}`) : null,
      step.refused_on.length ? h("ul", { class: "refused" }, step.refused_on.map((m) => h("li", {}, h("span", { class: "mono" }, m.check), ` ${m.detail}`))) : null),
    step.latency_ms ? h("span", { class: "lat mono" }, duration(step.latency_ms)) : null);
}

function toneOf(outcome) {
  if (outcome.startsWith("posted") || outcome === "answered") return "ok";
  if (outcome.includes("person")) return "wait";
  if (outcome.includes("declined") || outcome.includes("refus") || outcome.includes("ran out")) return "bad";
  return "";
}
