import { act, flow, h, money, statusPill, toast, words } from "/dom.js";
import { icon } from "/icons.js";

/** The month as one run: what came in, what settled itself, what is waiting for a person. */
export function renderRun(app, o) {
  const s = o.scoreboard;
  const cases = o.receipts.filter((r) => r.bank_line);
  const period = cases.map((r) => r.bank_line.posted_date).sort().at(-1)?.slice(0, 7);
  const waiting = cases.filter((r) => r.status === "waiting_on_human").length;
  const open = cases.filter((r) => r.status === "open").length;
  return h("section", {},
    h("div", { class: "pagehead" },
      h("div", {}, h("h1", {}, "Cash application"), h("p", { class: "muted" }, `${monthName(period)} · ${cases.length} receipts · ${s.auto_posted} entries posted by code${waiting ? ` · ${waiting} waiting for you` : open ? ` · ${open} still open` : ""}`)),
      h("div", { class: "actions" }, h("button", { class: "btn ink", on: { click: () => run(app) } }, icon("play", 15), "Run the code tier"))),
    cashStrip(o.cash, period),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "Receipts"), h("span", { class: "muted" }, "Click one to see how it was explained")), receiptsTable(app, cases)));
}

function monthName(period) {
  if (!period) return "";
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Cash that landed in the month being closed, by entity and bank account. Earlier months are history, not this run. */
function cashStrip(cash, period) {
  const groups = cash.groups
    .map((g) => ({ ...g, receipts: g.receipts.filter((r) => !period || r.posted_date.startsWith(period)) }))
    .map((g) => ({ ...g, total_cents: g.receipts.reduce((n, r) => n + r.amount_cents, 0), converted_receipts: g.receipts.filter((r) => r.original_currency).length }))
    .filter((g) => g.receipts.length > 0);
  if (groups.length === 0) return null;
  return h("div", { class: "cash" }, groups.map((g) => {
    const converted = g.converted_receipts;
    return h("div", { class: "cashcard" },
      h("span", { class: "tilelabel" }, [g.entity ?? "Entity", g.country].filter(Boolean).join(" · ")), h("b", {}, money(g.total_cents)), h("span", {}, g.account ?? "Bank account"),
      h("div", { class: "chips" }, h("span", { class: "chip" }, `${g.receipts.length} receipt${g.receipts.length === 1 ? "" : "s"}`), converted ? h("span", { class: "chip lime" }, `${converted} converted by the bank`) : null));
  }));
}

function receiptsTable(app, cases) {
  const head = h("tr", {}, ["Customer", "Bank line", "Received", "Invoiced", "Short", "Status", "Settled by"].map((t) => h("th", {}, t)));
  const rows = cases.map((r) => h("tr", { class: "click", on: { click: () => app.go("case", r.intent_id) } },
    h("td", {}, h("b", {}, r.party_name ?? r.party_id), h("div", { class: "muted mono" }, r.doc_ids.join(", ") || "no invoice named")),
    h("td", { class: "mono" }, r.bank_line.id, h("div", { class: "muted" }, r.bank_line.posted_date)),
    h("td", { class: "num" }, flow(r.received_cents, "in")),
    h("td", { class: "num" }, r.expected_cents ? money(r.expected_cents) : "—"),
    h("td", { class: "num" }, flow(r.shortfall_cents > 0 ? r.shortfall_cents : 0, "out")),
    h("td", {}, statusPill(r.status)),
    h("td", {}, chips(r))));
  return h("table", { class: "tbl" }, h("thead", {}, head), h("tbody", {}, rows));
}

function chips(r) {
  const labels = [...new Set([...r.posted.map((p) => shortLabel(p.settled_by)), ...r.parked.map(() => "parked for a person"), ...r.open_questions.map(() => "question asked")])];
  return h("div", { class: "chips" }, labels.map((l) => h("span", { class: `chip ${l.startsWith("code") ? "code" : l.includes("person") || l.includes("question") ? "wait" : "model"}` }, l)));
}

function shortLabel(by) {
  if (by.rule) return `code · ${by.rule.code ?? "rule"} v${by.rule.version}`;
  if (by.fact) return `code · remembered ${words(by.fact.predicate)}`;
  if (by.reader) return `reader · ${by.reader}`;
  if (by.model) return `model · tier ${by.model.tier}`;
  return by.approvals.length > 0 ? "code · approved by a person" : "code";
}

async function run(app) {
  try {
    const r = await act("run", {});
    toast(r.worked.length === 0 ? "Nothing new for code to settle." : `Code worked ${r.worked.length} case(s) in ${r.worked.reduce((n, w) => n + w.elapsed_ms, 0)} ms, with no model call.`);
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

