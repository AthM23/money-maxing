import { flow, getJson, h, money, pill, plain, rate, statusPill, words } from "/dom.js";
import { openDrawer } from "/app.js";
import { evidencePanel } from "/views/evidence.js";
import { parkedCard, questionCard } from "/views/queue.js";
import { tracePanel } from "/views/tracepanel.js";

/** One receipt: the bank line on the left, the book lines that explain it on the right, then how the agents got there. */
export async function renderCase(app) {
  const v = await getJson(`/api/case?intent=${encodeURIComponent(app.route.id ?? "")}`);
  const r = v.receipt;
  // "Paid in full" is a statement about the invoice, so it needs the invoice to be settled, not just the amounts to match.
  const short = r.shortfall_cents > 0 ? `${money(r.shortfall_cents)} short` : r.open_cents_now === 0 ? "paid in full" : "received in full, not applied yet";
  return h("section", {},
    h("div", { class: "pagehead" },
      h("div", {},
        h("button", { class: "back", on: { click: () => app.go("run") } }, "← Cash application"),
        h("h1", {}, r.party_name ?? r.party_id, " ", statusPill(r.status)),
        h("p", { class: "muted" }, `${r.doc_ids.join(", ") || "no invoice named"} · ${short}`))),
    h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "The invoice, explained to the cent"), h("span", { class: "muted" }, "Click a book line for its evidence")), cashApplication(v), footing(v)),
    v.fx ? h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "Why it is short"), h("span", { class: "muted" }, `A matcher that sees one number calls the whole ${money(r.shortfall_cents)} a short-pay`)), split(v)) : null,
    ...r.open_questions.map((q) => h("div", { class: "panel ask" }, questionCard(app, q))),
    ...waitingHere(app, r).map((p) => h("div", { class: "panel ask" }, parkedCard(app, p, true))),
    otherBooks(v.ripple), tracePanel(v));
}

/** What is parked on this case, with the preparer's reasoning, so it can be approved or decided without leaving the page. */
function waitingHere(app, r) {
  return (app.overview?.awaiting_you.parked_entries ?? []).filter((p) => p.intent_id === r.intent_id);
}

const BOOKS = { ar: "Receivables", revenue: "Revenue", forecast: "Forecast", close: "Close", mirror: "QuickBooks", drift: "CRM against the schedule" };

/** One transaction, every book: what each of the other functions did when this case's entries posted, or that it looked and left things alone. */
function otherBooks(rows) {
  if (!rows?.length) return null;
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "What it touched in the other books"), h("p", { class: "muted" }, "Each function reacts to the posted entry on its own, in code. One that looked and changed nothing says so."))),
    h("div", { class: "ripple" }, rows.map((x) => h("div", { class: "ripplerow" }, h("span", { class: `chip ${x.function === "ar" ? "code" : ""}` }, BOOKS[x.function] ?? words(x.function)),
      h("span", {}, x.summary), h("b", { class: "num" }, x.delta_cents ? flow(Math.abs(x.delta_cents), x.delta_cents > 0 ? "in" : "out") : "")))));
}

function cashApplication(v) {
  const b = v.receipt.bank_line;
  const bank = h("div", { class: "bankblock" },
    h("span", { class: "kick" }, `Bank line · ${b?.id ?? ""}`), h("b", {}, b ? `+${money(b.amount_cents)}` : ""), h("span", {}, b?.posted_date ?? ""),
    h("p", { class: "mono" }, b?.descriptor ?? ""),
    v.fx ? h("p", { class: "fxline" }, `${v.fx.currency} ${plain(v.fx.foreign_amount_cents)} at ${rate(v.fx.rate_ppm)}, less ${money(v.fx.fee_cents)} bank charges`) : null,
    v.invoice_fx[0] ? h("p", { class: "fxline dim" }, `Invoiced ${v.invoice_fx[0].currency} ${plain(v.invoice_fx[0].foreign_total_cents)} at ${rate(v.invoice_fx[0].booked_rate_ppm)} = ${money(v.receipt.expected_cents)}`) : null);
  const rows = v.lines.map((l) => h("button", { class: `bookline ${l.state}`, disabled: !l.decision_id, on: l.decision_id ? { click: () => showEvidence(l.decision_id) } : {} },
    h("span", { class: `amt ${l.kind === "apply_payment" ? "in" : "out"}` }, l.kind === "apply_payment" ? `+${money(l.amount_cents)}` : `−${money(l.amount_cents)}`),
    h("span", { class: "what" }, h("b", {}, l.label), h("span", { class: "muted" }, l.settled_by)),
    h("span", { class: "chips" }, l.account ? h("span", { class: "chip mono" }, `GL ${l.account}`) : null, l.fx_note ? h("span", { class: "chip mono lime" }, l.fx_note) : null),
    l.state === "posted" ? pill("posted", "ok") : l.state === "parked" ? pill("awaiting approval", "wait") : pill("awaiting you", "wait")));
  return h("div", { class: "cashapp" }, bank, h("div", { class: "booklines" }, h("span", { class: "kick" }, "Book lines"), rows));
}

/**
 * The identity the page claims, checked here rather than asserted: what was invoiced, less everything that is not
 * cash, is the cash that arrived. If it does not foot, the page says so in red instead of pretending.
 */
function footing(v) {
  const r = v.receipt;
  if (!r.expected_cents) return null;
  const notCash = v.lines.filter((l) => l.kind !== "apply_payment").reduce((n, l) => n + l.amount_cents, 0);
  const cash = v.lines.filter((l) => l.kind === "apply_payment").reduce((n, l) => n + l.amount_cents, 0);
  const foots = r.expected_cents - notCash === cash && cash === r.received_cents;
  if (cash === 0) return h("p", { class: "footing muted" }, `Invoiced ${money(r.expected_cents)}; ${money(r.received_cents)} arrived and has not been applied yet.`);
  return h("p", { class: `footing ${foots ? "" : "bad"}` }, foots ? "✓ " : "✗ ", `Invoiced ${money(r.expected_cents)} − ${money(notCash)} in the lines below = ${money(r.expected_cents - notCash)}`, foots ? `, the ${money(r.received_cents)} that arrived.` : `, but ${money(r.received_cents)} arrived: this does not foot.`);
}

const SEGMENT = { write_off: ["fee", "code, from the bank's advice"], fx_realized: ["fx", "code, re-performed from two rates"] };

/** The shortfall as one bar, one segment per book line that is not cash, each called what the ledger calls it. */
function split(v) {
  const short = v.receipt.shortfall_cents;
  const segs = v.lines.filter((l) => l.kind !== "apply_payment" && l.amount_cents > 0).map((l) => {
    const [cls, who] = SEGMENT[l.kind] ?? ["held", l.state === "posted" ? l.settled_by : l.state === "parked" ? "prepared, awaiting approval" : v.receipt.open_questions.length ? "a person has been asked" : "still unexplained"];
    return [l.kind === "open" ? (v.receipt.open_questions.length ? "Not paid: a person has been asked" : "Still unexplained") : l.label, l.amount_cents, cls, who];
  });
  if (!segs.length || short <= 0) return h("p", { class: "muted" }, "Nothing is short on this receipt.");
  return h("div", {},
    h("div", { class: "splitbar" }, segs.map(([, cents, cls]) => h("div", { class: `seg ${cls}`, style: { flex: `${Math.max(cents / short, 0.06)}` } }, money(cents)))),
    h("div", { class: "splitlegend" }, segs.map(([label, cents, cls, who]) => h("div", {}, h("span", { class: `dot ${cls}` }), h("b", {}, label), ` ${money(cents)} · `, h("span", { class: "muted" }, who)))));
}

async function showEvidence(decisionId) {
  try { openDrawer(await evidencePanel(decisionId)); } catch (err) { openDrawer(h("p", { class: "error" }, err.message)); }
}
