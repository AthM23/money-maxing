// Small DOM helpers. Everything on this page is built with textContent: mail bodies and model-written text are
// untrusted, so nothing from the database is ever parsed as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "on") for (const [event, fn] of Object.entries(value)) el.addEventListener(event, fn);
    else if (key === "style") Object.assign(el.style, value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const money = (cents) => (cents === null || cents === undefined ? "" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
export const plain = (cents) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rate = (ppm) => (ppm / 1_000_000).toFixed(4);
export const cost = (micros) => (micros === 0 ? "$0" : `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2)}`);
export const words = (kind) => (kind ?? "").replaceAll("_", " ");

export function duration(ms) {
  if (!ms || ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function clock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function pill(text, tone) {
  return h("span", { class: `pill ${tone}` }, text);
}

const STATUS = { resolved: ["Posted & closed", "ok"], waiting_on_human: ["Awaiting you", "wait"], open: ["Open", "open"] };
export function statusPill(status) {
  const [label, tone] = STATUS[status] ?? [status, "open"];
  return pill(label, tone);
}

export async function getJson(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

export async function act(action, payload) {
  const res = await fetch(`/api/do/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

export function toast(message, tone = "ok") {
  const el = h("div", { class: `toast ${tone}` }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 5200);
}

/** An SVG element, built the same careful way as `h`: attributes and children only, never markup from data. */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  for (const child of children.flat(Infinity)) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}

/** A table from the server's { columns, rows, money_columns } shape. The first row is set apart when it is a total. */
export function dataTable(table, { totalFirst = false, totalLast = false } = {}) {
  const isMoney = (i) => table.money_columns.includes(i);
  const cell = (value, i) => h("td", { class: isMoney(i) ? "num" : "" }, isMoney(i) ? (value ? money(value) : "—") : value ?? "");
  return h("table", { class: "tbl" },
    h("thead", {}, h("tr", {}, table.columns.map((c, i) => h("th", { class: isMoney(i) ? "num" : "" }, c)))),
    h("tbody", {}, table.rows.map((row, r) => h("tr", { class: (totalFirst && r === 0) || (totalLast && r === table.rows.length - 1) ? "total" : "" }, row.map(cell)))));
}
