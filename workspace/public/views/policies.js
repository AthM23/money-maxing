import { h, words } from "/dom.js";

/** What the system has learned, and from whom: rules compiled from history, how far each kind of entry is trusted, and facts people told it. */
export function renderPolicies(app, o) {
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Policies & memory"), h("p", { class: "muted" }, "Nothing here was typed in as a rule. Policies are derived from what your team booked; facts are what people answered, with a scope and an end date."))),
    h("div", { class: "panel" }, h("h2", {}, "Policies derived"), o.rules.length ? h("div", { class: "cards" }, o.rules.map(ruleCard)) : h("p", { class: "muted" }, "None yet. Use “Learn from last quarter” on the close run.")),
    h("div", { class: "panel" }, h("h2", {}, "Earned autonomy"), h("p", { class: "muted" }, "Per kind of entry: how often the agent's entry matched what people booked or approved. Posting alone takes 95% on at least five decisions reached by code, a policy or a fact."), ladder(o.ladder)),
    h("div", { class: "panel" }, h("h2", {}, "Memory"), o.memory.active.length ? h("div", { class: "cards" }, o.memory.active.map(factCard)) : h("p", { class: "muted" }, "No active facts yet.")));
}

function ruleCard(r) {
  const b = r.backtest ?? {};
  return h("div", { class: `rule ${r.status}` },
    h("div", { class: "rulehead" }, h("span", { class: "tag lime" }, "Policy derived"), h("span", { class: `outcome ${r.status === "approved" ? "ok" : r.status === "retired" ? "" : "wait"}` }, r.status)),
    h("p", { class: "mono lead" }, `${r.code ?? r.policy_id} · v${r.version}`),
    h("dl", {},
      h("dt", {}, "Does"), h("dd", {}, r.action ? `${words(r.action.kind)} → GL ${r.action.account}` : "—"),
      h("dt", {}, "Reads as"), h("dd", { class: "mono" }, r.name),
      h("dt", {}, "Customers"), h("dd", {}, r.customer_scope.join(", ") || "any"),
      h("dt", {}, "Evidence left behind"), h("dd", {}, `${b.n ?? "?"} past entries matched, ${b.agree ?? "?"} booked exactly this${b.account_outliers?.length ? `, ${b.account_outliers.length} to another account` : ""}`),
      h("dt", {}, "Leave-one-out"), h("dd", {}, `${b.held_out_covered ?? "?"} of ${b.held_out_n ?? "?"} still covered when drafted without them`),
      h("dt", {}, "Approved by"), h("dd", {}, r.approved_by ? `${r.approved_by}${r.supersedes ? ` · retires ${r.supersedes}` : ""}` : "not yet")));
}

function ladder(rows) {
  if (!rows.length) return h("p", { class: "muted" }, "No track record yet: every kind of entry starts in shadow.");
  return h("table", { class: "grid tight" }, h("thead", {}, h("tr", {}, ["Kind of entry", "Agreed", "Level"].map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, `${r.function} · ${words(r.kind)}`), h("td", { class: "mono" }, `${r.agree} / ${r.n}`), h("td", {}, h("span", { class: `outcome ${r.level === "auto" ? "ok" : r.level === "review" ? "wait" : ""}` }, r.level === "auto" ? "posts on its own" : r.level === "review" ? "posts after review" : "shadow only")))))); 
}

function factCard(f) {
  const quote = f.source_traces[0]?.text ?? "";
  return h("div", { class: "rule approved" },
    h("div", { class: "rulehead" }, h("span", { class: "tag" }, "Remembered"), h("span", { class: "outcome ok" }, `until ${f.valid_to}`)),
    h("p", { class: "lead" }, `${f.party_id} · ${words(f.predicate)}`),
    h("dl", {}, h("dt", {}, "Says"), h("dd", { class: "mono" }, JSON.stringify(f.value)), h("dt", {}, "Applies"), h("dd", {}, `${f.uses}, from ${f.valid_from}`), h("dt", {}, "Approved by"), h("dd", {}, f.approved_by ?? "—")),
    quote ? h("blockquote", {}, quote.length > 260 ? `${quote.slice(0, 260)}…` : quote) : null);
}
