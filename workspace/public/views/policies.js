import { h, words } from "/dom.js";
import { openDrawer } from "/app.js";

let query = "";
let status = "live";

/**
 * What the system has learned. Policies are a list, not a wall of cards: one row per rule with its live version,
 * searchable and filterable, older versions folded under it, the full card one click away. It reads the same with
 * three policies or three hundred.
 */
export function renderPolicies(app, o) {
  const families = familiesOf(o.rules);
  const shown = families.filter((f) => matches(f, query) && (status === "all" || (status === "live" ? f.live : f.versions.some((v) => v.status === status))));
  const search = h("input", { type: "search", placeholder: "Search by code, account, customer…", value: query, "aria-label": "Search policies", on: { input: (e) => { query = e.target.value; redraw(app); } } });
  const filter = h("div", { class: "seg2" }, [["live", "Live"], ["proposed", "Proposed"], ["retired", "Retired"], ["all", "All"]].map(([k, label]) => h("button", { class: status === k ? "on" : "", on: { click: () => { status = k; redraw(app); } } }, label)));
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Policies & memory"), h("p", { class: "muted" }, "Nothing here was typed in as a rule. Policies are derived from what your team booked; facts are what people answered, with a scope and an end date."))),
    h("div", { class: "panel" },
      h("div", { class: "panelhead" }, h("h2", {}, `Policies derived · ${families.length}`), h("div", { class: "toolbar" }, search, filter)),
      shown.length ? policyTable(shown) : h("p", { class: "muted" }, families.length ? "No policy matches." : "None yet. Use “Learn from last quarter” on the overview.")),
    h("div", { class: "grid2 even" },
      h("div", { class: "panel" }, h("h2", {}, "Earned autonomy"), h("p", { class: "muted small" }, "Per kind of entry: how often the agent's entry matched what people booked or approved. Posting alone takes 95% on at least five covered decisions."), ladder(o.ladder)),
      h("div", { class: "panel" }, h("h2", {}, `Memory · ${o.memory.active.length}`), o.memory.active.length ? factTable(o.memory.active) : h("p", { class: "muted" }, "No active facts yet."))));
}

function redraw(app) {
  const focused = document.activeElement?.getAttribute("aria-label") === "Search policies";
  app.go("policies");
  if (focused) queueMicrotask(() => { const el = document.querySelector('input[aria-label="Search policies"]'); el?.focus(); el?.setSelectionRange(query.length, query.length); });
}

/** One family per rule code, newest version first; the live one is whichever is approved. */
function familiesOf(rules) {
  const byCode = new Map();
  for (const r of rules) byCode.set(r.code ?? r.policy_id, [...(byCode.get(r.code ?? r.policy_id) ?? []), r]);
  return [...byCode.entries()].map(([code, versions]) => {
    versions.sort((a, b) => b.version - a.version);
    return { code, versions, live: versions.find((v) => v.status === "approved") ?? null, head: versions.find((v) => v.status === "approved") ?? versions[0] };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

function matches(f, q) {
  if (!q.trim()) return true;
  const hay = f.versions.map((v) => `${v.code} ${v.name} ${v.action?.account ?? ""} ${v.action?.kind ?? ""} ${v.customer_scope.join(" ")}`).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function policyTable(families) {
  const head = ["Policy", "Does", "Customers", "Evidence", "Versions", "Status"];
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, head.map((t) => h("th", {}, t)))),
    h("tbody", {}, families.map((f) => {
      const p = f.head, b = p.backtest ?? {};
      return h("tr", { class: "click", on: { click: () => openDrawer(policyCard(f)) } },
        h("td", {}, h("b", { class: "mono" }, f.code), h("small", { class: "muted block" }, conditionWords(p))),
        h("td", {}, p.action ? `${words(p.action.kind)} → GL ${p.action.account}` : "—"),
        h("td", {}, p.customer_scope.length ? h("span", { class: "chip" }, `${p.customer_scope.length} customer${p.customer_scope.length === 1 ? "" : "s"}`) : h("span", { class: "chip" }, "any")),
        h("td", { class: "muted" }, `${b.agree ?? "?"} of ${b.n ?? "?"} exact`),
        h("td", {}, h("span", { class: "chip mono" }, f.versions.map((v) => `v${v.version}`).join(" ← "))),
        h("td", {}, statusPill(p.status)));
    })));
}

function conditionWords(p) {
  return p.name.replace(/^.*?·\s*v\d+\s*·\s*/, "");
}

function statusPill(s) {
  return h("span", { class: `pill ${s === "approved" ? "ok" : s === "retired" ? "open" : "wait"}` }, s === "approved" ? "live" : s);
}

/** The full card, with every version the family has had. */
function policyCard(f) {
  return h("div", {}, h("p", { class: "kick" }, "Policy derived"), h("h2", { class: "mono" }, f.code),
    f.versions.map((p) => {
      const b = p.backtest ?? {};
      return h("div", { class: `rule ${p.status}` },
        h("div", { class: "rulehead" }, h("b", {}, `Version ${p.version}`), statusPill(p.status)),
        h("dl", {},
          h("dt", {}, "Reads as"), h("dd", { class: "mono" }, p.name),
          h("dt", {}, "Does"), h("dd", {}, p.action ? `${words(p.action.kind)} → GL ${p.action.account}` : "—"),
          h("dt", {}, "Customers"), h("dd", {}, p.customer_scope.join(", ") || "any"),
          h("dt", {}, "Evidence left behind"), h("dd", {}, `${b.n ?? "?"} past entries matched, ${b.agree ?? "?"} booked exactly this${b.account_outliers?.length ? `, ${b.account_outliers.length} to another account` : ""}, ${b.regressions?.length ?? 0} it would have mis-cleared`),
          h("dt", {}, "Leave-one-out"), h("dd", {}, `${b.held_out_covered ?? "?"} of ${b.held_out_n ?? "?"} still covered when drafted without them`),
          h("dt", {}, "Approved by"), h("dd", {}, p.approved_by ? `${p.approved_by} · ${p.approved_at?.slice(0, 10) ?? ""}` : "not yet"),
          p.supersedes ? [h("dt", {}, "Retires"), h("dd", { class: "mono" }, p.supersedes)] : null));
    }));
}

function ladder(rows) {
  if (!rows.length) return h("p", { class: "muted" }, "No track record yet: every kind of entry starts in shadow.");
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["Kind of entry", "Agreed", "Level"].map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, `${r.function} · ${words(r.kind)}`), h("td", { class: "mono" }, `${r.agree} / ${r.n}`), h("td", {}, h("span", { class: `pill ${r.level === "auto" ? "ok" : r.level === "review" ? "prog" : "open"}` }, r.level === "auto" ? "posts on its own" : r.level === "review" ? "posts after review" : "shadow only"))))));
}

function factTable(facts) {
  return h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["Customer", "Remembers", "Until", "Approved by"].map((t) => h("th", {}, t)))),
    h("tbody", {}, facts.map((f) => h("tr", { class: "click", on: { click: () => openDrawer(factCard(f)) } }, h("td", {}, h("b", {}, f.party_id)), h("td", {}, `${words(f.predicate)} ${valueWords(f.value)}`), h("td", { class: "mono" }, f.valid_to), h("td", { class: "muted" }, f.approved_by ?? "—")))));
}

function valueWords(v) {
  if (typeof v.pct_off === "number") return `· ${v.pct_off}%`;
  if (typeof v.pct_withheld === "number") return `· ${v.pct_withheld}% withheld`;
  if (typeof v.payer_party_id === "string") return `· paid by ${v.payer_party_id}`;
  return "";
}

function factCard(f) {
  return h("div", {}, h("p", { class: "kick" }, "Remembered"), h("h2", {}, `${f.party_id} · ${words(f.predicate)}`),
    h("dl", {}, h("dt", {}, "Says"), h("dd", { class: "mono" }, JSON.stringify(f.value)), h("dt", {}, "Applies"), h("dd", {}, `${f.uses}, ${f.valid_from} to ${f.valid_to}`), h("dt", {}, "Approved by"), h("dd", {}, f.approved_by ?? "—")),
    f.source_traces.map((t) => h("div", { class: "quote" }, h("span", { class: "chip" }, t.trace_id), h("pre", {}, t.text.length > 700 ? `${t.text.slice(0, 700)}…` : t.text))));
}
