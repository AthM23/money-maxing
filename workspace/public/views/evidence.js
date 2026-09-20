import { getJson, h, money } from "/dom.js";

const CLASSES = [["F", "Formal", "it foots, it fits, it ties"], ["E", "Evidence", "every quote agreed to its source"], ["P", "Process", "who may post, in which period, approved by whom"], ["J", "Judgment", "the rule or fact it rests on, and its limits"]];

/** One entry, defended: the lines, what it rests on with the quote shown inside its source, and every check re-performed. */
export async function evidencePanel(decisionId) {
  const v = await getJson(`/api/workpaper?decision=${encodeURIComponent(decisionId)}`);
  const w = v.workpaper;
  return h("div", { class: "evidence" },
    h("h2", {}, w.kind.replaceAll("_", " ")), h("p", { class: "muted mono" }, `${w.decision_id} · prepared by ${v.actor}${w.posted_at ? " · posted" : " · not posted"}`),
    h("h3", {}, "The entry"), entryTable(v.entries),
    h("h3", {}, "What it rests on"), w.evidence.length ? w.evidence.map((e) => quoteBlock(e, v.sources[e.trace_id])) : h("p", { class: "muted" }, "No document is quoted: this entry is arithmetic on the ledger itself."),
    h("h3", {}, "Checks the kernel re-performed"), h("p", { class: "muted small" }, "Plain code, run again at every gate. None of this is a model's opinion."),
    CLASSES.map(([key, name, gloss]) => markGroup(name, gloss, w.marks_by_class[key] ?? [])));
}

function entryTable(entries) {
  if (!entries.length) return h("p", { class: "muted" }, "This decision writes no ledger lines.");
  return h("table", { class: "grid tight" }, h("thead", {}, h("tr", {}, ["Account", "Debit", "Credit", "Memo"].map((t) => h("th", {}, t)))),
    h("tbody", {}, entries.map((l) => h("tr", {}, h("td", { class: "mono" }, l.account), h("td", { class: "num" }, l.debit_cents ? money(l.debit_cents) : ""), h("td", { class: "num" }, l.credit_cents ? money(l.credit_cents) : ""), h("td", { class: "muted" }, l.memo ?? "")))));
}

/** The source text with the quoted span marked. The offsets come from the server, which found the quote in the stored text. */
function quoteBlock(e, source) {
  const text = source?.text ?? "";
  const body = e.offset
    ? [text.slice(Math.max(0, e.offset.start - 220), e.offset.start), h("mark", {}, text.slice(e.offset.start, e.offset.end)), text.slice(e.offset.end, e.offset.end + 220)]
    : [text.slice(0, 400)];
  return h("div", { class: "quote" },
    h("p", {}, h("b", {}, e.claim)),
    h("div", { class: "source" }, h("span", { class: "chip" }, `${source?.source ?? "source"} · ${e.trace_id}`), h("pre", {}, e.offset && e.offset.start > 220 ? "…" : "", body, "…")),
    e.quote && !e.offset ? h("p", { class: "error small" }, "The quoted words were not found in this source.") : null);
}

function markGroup(name, gloss, marks) {
  if (!marks.length) return null;
  const failed = marks.filter((m) => m.status === "fail").length;
  return h("details", { class: "marks", open: failed > 0 },
    h("summary", {}, h("b", {}, name), h("span", { class: "muted" }, ` · ${gloss}`), h("span", { class: `outcome ${failed ? "bad" : "ok"}` }, failed ? `${failed} failed` : `${marks.filter((m) => m.status === "pass").length} passed`)),
    h("ul", {}, marks.map((m) => h("li", { class: m.status }, h("span", { class: "tick" }, m.status === "pass" ? "✓" : m.status === "fail" ? "✗" : "·"), h("span", { class: "mono" }, m.check), " ", m.detail))));
}
