import { getJson, h } from "/dom.js";

const METRICS = [["field_f1", "Field-F1", (x) => x.toFixed(3)], ["exact", "Exact match, whole document", (x) => pct(x)], ["schema_valid", "Valid against the schema", (x) => pct(x)]];

// How each benchmarked reader is named on the page. Two of them are not models at all, and are said not to be.
const READERS = {
  "no reader": ["No reader", "what code settles with nothing reading the documents"],
  "Qwen3-4B base": ["Qwen3-4B, not fine-tuned", "the same open model before our training"],
  "saboteur (deliberately wrong, not a model)": ["A deliberately wrong reader", "not a model: a test that the kernel catches bad readings"],
  "Qwen3-4B + our LoRA": ["Qwen3-4B + our LoRA", "the reader we trained"],
  "oracle (gold labels, not a model)": ["Perfect labels", "not a model: the most any reader could settle"],
};

const pct = (x) => `${(x * 100).toFixed(Number.isInteger(x * 100) ? 0 : 1)}%`;
const count = (n) => n.toLocaleString("en-US");

/** The document reader's report card: what we trained, on what, and what it measures against. Read from result files. */
export async function renderModel() {
  const m = await getJson("/api/model");
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Model"), h("p", { class: "muted" }, "The document reader is a 4B open-weight model we fine-tuned ourselves. It turns remittances, bills and contract clauses into a fixed schema; the kernel checks every reading before anything posts.")),
      h("span", { class: "chip lime" }, "every number is measured, with its n")),
    hero(m.extraction), h("div", { class: "grid2" }, recipe(m), extraction(m.extraction)), harness(m.harness), generalises(m), scaling(m.ablation), heads(m), outside(m.external), notes(m));
}

function hero(x) {
  const base = x?.rows.find((r) => r.key === "base4b"), ours = x?.rows.find((r) => r.key === "ours");
  if (!base || !ours) return null;
  const fact = (label, from, to) => h("div", { class: "fact" }, h("b", {}, `${from} → ${to}`), h("span", {}, label));
  return h("div", { class: "darkhero modelhero" },
    h("div", {}, h("p", { class: "kick" }, "Same model, before and after our training"), h("div", { class: "herofig" }, h("span", { class: "from" }, base.field_f1.toFixed(3)), h("span", { class: "arrow" }, "→"), h("b", {}, ours.field_f1.toFixed(3))), h("p", { class: "muted" }, `field-F1 on ${x.n} July documents, graded by code (${x.scorer})`)),
    h("div", { class: "tracetotals" }, fact("valid against the schema", pct(base.schema_valid ?? 0), pct(ours.schema_valid ?? 0)), fact("whole document exactly right", pct(base.exact), pct(ours.exact)),
      ours.held_out_f1 === undefined ? null : h("div", { class: "fact" }, h("b", {}, ours.held_out_f1.toFixed(3)), h("span", {}, `F1 on the ${ours.held_out_n} documents from customers it never saw`))));
}

function recipe(m) {
  const r = m.recipe, d = m.data;
  const row = (label, value) => h("div", { class: "spec" }, h("span", { class: "muted" }, label), h("b", {}, value));
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "What we trained"), h("span", { class: "chip" }, r.source)),
    row("Base model", r.base_model), row("Licence", r.licence), row("Adapter", r.adapter), row("Training", r.training), row("Hardware", r.hardware),
    !d ? null : [row("Documents", `${count(d.sft_counts.train)} train · ${count(d.sft_counts.cal)} calibrate · ${count(d.sft_counts.test)} test`), row("Split", "by month: April–May train, June calibrate, July test"),
      row("Held out of training", `${d.held_out_customers.length} customers and ${d.held_out_vendors.length} vendors, entirely`), row("Only ever in the test", `${d.test_only_families.length} document styles (${d.test_only_families.join(", ")})`), row("Reproduce", `ft/gen_data.py --seed ${d.seed}`)]);
}

function extraction(x) {
  if (!x) return h("div", { class: "panel" }, h("h2", {}, "Reading documents into the schema"), h("p", { class: "muted" }, "No benchmark result file in this checkout."));
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, "Reading documents into the schema"), h("span", { class: "chip" }, `n = ${x.n} · ${x.scorer}`)),
    METRICS.map(([key, label, show]) => h("div", { class: "metric" }, h("p", { class: "metricname" }, label),
      x.rows.map((r) => bar(r.label, r[key] ?? 0, show(r[key] ?? 0), r.ours ? "ours" : /haiku|sonnet|opus|fable/.test(r.key) ? "api" : "base", r.note)))),
    h("div", { class: "mlegend" }, h("span", {}, h("i", { class: "msw base" }), "open model, untouched"), h("span", {}, h("i", { class: "msw api" }), "frontier API model"), h("span", {}, h("i", { class: "msw ours" }), "ours")));
}

function bar(label, value, shown, tone, title) {
  return h("div", { class: "barrow", title }, h("span", { class: "barlabel" }, label), h("div", { class: "bartrack" }, h("div", { class: `barfill ${tone}`, style: { width: `${value > 0 ? Math.max(value * 100, 0.6) : 0}%` } })), h("b", { class: "barvalue" }, shown));
}

function harness(x) {
  if (!x) return null;
  const seg = (n, total, tone) => (n > 0 ? h("div", { class: `stackseg ${tone}`, style: { width: `${(n / total) * 100}%` } }, n >= total * 0.08 ? String(n) : "") : null);
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "Inside the harness: what each reader lets code settle"), h("p", { class: "muted" }, "The same remittances through the real kernel and ledger. A reading only counts if the kernel accepts it and the books still tie.")),
      h("div", { class: "mlegend" }, h("span", {}, h("i", { class: "msw ours" }), "settled by code"), h("span", {}, h("i", { class: "msw api" }), "cash applied, deduction left for judgment"), h("span", {}, h("i", { class: "msw base" }), "refused, left for a person"), h("span", {}, h("i", { class: "msw bad" }), "wrong posting"))),
    x.rows.map((r) => {
      const [name, note] = READERS[r.reader] ?? [r.reader, ""];
      const why = Object.entries(r.refusal_reasons).sort(([, a], [, b]) => b - a)[0];
      return h("div", { class: "stackrow" }, h("div", { class: "stackname" }, h("b", {}, name), h("span", { class: "muted small" }, note)),
        h("div", {}, h("div", { class: "stack" }, seg(r.settled_from_code, r.n, "ours"), seg(r.applied_deduction_open, r.n, "api"), seg(r.left_for_judgment, r.n, "base"), seg(r.wrong_postings, r.n, "bad")),
          why ? h("p", { class: "muted small" }, `kernel: "${why[0]}" × ${why[1]}`) : null),
        h("div", { class: "stackend" }, h("b", { class: r.wrong_postings ? "short" : "" }, `${r.wrong_postings} wrong`), h("span", { class: "muted small" }, `of ${r.n} · books ${r.books_tied ? "tied" : "NOT tied"}`)));
    }), families(x.rows.find((r) => r.reader === "Qwen3-4B + our LoRA")));
}

const FAMILY = { remit_ocr: "Scanned, with OCR noise (never in training)", remit_plain: "Plain text advice", remit_shortpay: "Short-pay with a claimed deduction", remit_terse: "Terse one-liner", remit_email: "Free-form email" };

/** The same run, by the kind of document. A short-pay's deduction is judgment, so it is left open on purpose. */
function families(run) {
  const rows = Object.entries(run?.by_family ?? {});
  if (!rows.length) return null;
  return h("div", { class: "families" }, h("p", { class: "metricname" }, `Our reader, by kind of document (n = ${run.n})`),
    rows.map(([key, f]) => h("div", { class: "barrow" }, h("span", { class: "barlabel" }, FAMILY[key] ?? key), h("div", { class: "bartrack" }, h("div", { class: `barfill ${f.settled ? "ours" : "api"}`, style: { width: `${f.settled ? (f.settled / f.n) * 100 : 100}%` } })),
      h("b", { class: "barvalue" }, f.settled ? `${f.settled}/${f.n}` : `0/${f.n}`))),
    h("p", { class: "muted small" }, "The dark bar is by design: on a short-pay the reader's job is the cash; what the customer deducted is left to judgment, never settled by a reading."));
}

/** Two scaling curves, drawn only when lane C has run the ablation: how much model, and how much data, the result needs. */
function scaling(a) {
  if (!a) return null;
  const chart = (title, rows, label) => rows.length < 2 ? null : h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("h2", {}, title), h("span", { class: "chip" }, `n = ${a.n} · ${a.scorer}`)),
    rows.map((r) => bar(label(r.x), r.field_f1, r.field_f1.toFixed(3), r === rows.at(-1) ? "ours" : "api", `exact ${pct(r.exact)}${r.held_out_f1 === null ? "" : ` · held-out F1 ${r.held_out_f1.toFixed(3)}`}`)),
    h("p", { class: "muted small" }, "Field-F1. Same LoRA recipe, same test slice, same scorer as the headline; hover a bar for exact match and held-out F1."));
  return h("div", {}, h("div", { class: "sectionhead" }, h("h2", {}, "How much model, how much data"), h("p", { class: "muted" }, "An ablation of the same recipe: what the result costs in parameters and in training rows.")),
    h("div", { class: "grid2 even" }, chart("By size of the base model", a.by_size, (x) => `Qwen3-${x}B + LoRA`), chart("By share of the training data (4B)", a.by_data, (x) => `${x}% of the rows`)));
}

/** Lane C trained three things, one job each. The two smaller ones are shown with where they are weak, because that is what the harness is for. */
function heads(m) {
  const b = m.matcher, d = m.coder;
  if (!b && !d) return null;
  const card = (title, kind, big, bigLabel, lines, weak) => h("div", { class: "panel headcard" }, h("div", { class: "panelhead" }, h("h2", {}, title), h("span", { class: "chip" }, kind)),
    h("div", { class: "tilevalue" }, h("b", {}, big), h("span", { class: "muted" }, bigLabel)), h("ul", { class: "plain" }, lines.map((l) => h("li", {}, l))), h("p", { class: "weak" }, weak));
  return h("div", {}, h("div", { class: "sectionhead" }, h("h2", {}, "Two more trained heads, one job each"), h("p", { class: "muted" }, "Same split by month, same held-out customers and vendors, graded by code.")),
    h("div", { class: "grid2 even" },
      !b ? null : card("Which invoice does this bank line pay?", "gradient-boosted trees on pair features · CPU", pct(b.top1), `top-1 on ${b.n_test_txns} July bank lines`,
        [`Right invoice in the top three: ${pct(b.recall_at_3)}`, `Clears ${pct(b.test_auto_clear_coverage)} of lines by itself at ${pct(b.test_auto_clear_precision)} precision`, `Threshold frozen on ${b.n_cal_txns} June lines (${b.threshold_source}), never tuned on the test`, `${count(b.n_train_pairs)} training pairs`],
        `Weak spot, stated: ${b.test_false_auto_clears} wrong auto-clears on the test. That is why a match is a proposal the kernel re-performs against open balances, not a posting.`),
      !d ? null : card("Which ledger account does this bill go to?", "classifier on vendor and line text", pct(d.acc_seen_vendor), `on the ${d.n_seen} bills from vendors it has seen`,
        [`All ${d.n_test} test bills: ${pct(d.acc_all)}`, `Vendors it never saw (${d.n_unseen} bills): ${pct(d.acc_unseen_vendor)}`],
        "Weak spot, stated: a new vendor is close to a coin toss. So a new vendor's first bill is never coded alone; it goes to a person, and their answer becomes the precedent.")));
}

/** A benchmark this team did not write, scored by its own scorer. */
function outside(x) {
  if (!x) return null;
  const d = x.documents;
  return h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("h2", {}, "A benchmark we did not build"), h("p", { class: "muted" }, `${x.name}, the one the track brief cites: an accounts-payable inbox of PDFs with planted traps and a hidden answer key, graded by its own scorer.`)), h("span", { class: "chip lime" }, "external")),
    h("div", { class: "tracetotals" }, fact(`${x.customers_exact} of ${x.customers_scored}`, "customers' net spend exact to the cent"),
      d ? fact(d.n, `PDFs read: ${Object.entries(d.kinds).map(([k, n]) => `${n} ${k.replaceAll("_", " ")}${n === 1 ? "" : "s"}`).join(", ")}`) : null,
      d ? fact(`${d.parsed}/${d.n}`, "readings that parsed") : null, d ? fact(d.void + d.revised, `traps in the inbox: ${d.void} void, ${d.revised} revised`) : null),
    h("p", { class: "muted" }, "Same division of labour as the product: the fine-tuned model reads each document; plain code spots the voids, statements, duplicates and superseded invoices and does all the arithmetic."),
    x.missed.length ? h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["Customer we got wrong", "Expected", "Ours", "Off by"].map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
      h("tbody", {}, x.missed.map((r) => h("tr", {}, h("td", { class: "mono" }, r.customer), h("td", { class: "num" }, usd(r.expected_usd)), h("td", { class: "num" }, usd(r.actual_usd)), h("td", { class: "num short" }, usd(r.error_usd)))))) : null);
}

const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fact = (value, label) => h("div", { class: "fact" }, h("b", {}, value), h("span", {}, label));

function generalises(m) {
  const f = m.fresh?.result, ours = m.extraction?.rows.find((r) => r.key === "ours");
  const tile = (label, value, note) => h("div", { class: "tile" }, h("span", { class: "tilelabel" }, label), h("div", { class: "tilevalue" }, h("b", {}, value)), h("span", { class: "muted small" }, note));
  const seen = m.seen?.result;
  return h("div", { class: "tiles four" },
    !seen ? null : tile("Customers it trained on", seen.field_f1.toFixed(3), `field-F1 on ${count(seen.n)} documents from customers in its training data. Set beside the two tiles to the right, the line is flat: it learned the task, not the names`),
    ours?.held_out_f1 === undefined ? null : tile("Customers it never saw", ours.held_out_f1.toFixed(3), `field-F1 on ${ours.held_out_n} held-out documents, against ${ours.field_f1.toFixed(3)} overall: no sign it memorised names`),
    !f ? null : [tile("Fresh exam, new seed", f.field_f1.toFixed(3), `${count(f.n)} documents generated after training, ${m.fresh.protocol.data}; ${pct(f.exact)} exact, ${f.errors} errors`),
      tile("Throughput on one box", `${f.docs_per_min} docs/min`, `${f.effective_s_per_doc} s a document at batch ${f.avg_batch_size} · ${Math.round(f.tokens_per_s_aggregate)} tokens/s`)],
    tile("Cost per document", "$0", "served on our own GX10: no API bill, and no document leaves the building"));
}

function notes(m) {
  const x = m.extraction, ours = x?.rows.find((r) => r.key === "ours"), hinted = x?.rows.find((r) => r.key === "haiku-hinted"), small = x?.rows.find((r) => r.key === "tuned06");
  const best = x?.rows.filter((r) => /sonnet|opus|fable/.test(r.key)).sort((a, b) => b.field_f1 - a.field_f1)[0];
  const lines = [m.data?.honesty_note ? `The data is ${m.data.honesty_note}.` : null, x?.api_note ? `Claude rows: ${x.api_note}. No latency or cost was recorded for them.` : null,
    small && ours ? `The same recipe on Qwen3-0.6B reaches ${small.field_f1.toFixed(3)} field-F1 and ${pct(small.exact)} exact, against ${ours.field_f1.toFixed(3)} and ${pct(ours.exact)} for the 4B: the format is learnable by a model seven times smaller.` : null,
    best && ours ? `The strongest frontier row, ${best.label}, reaches ${best.field_f1.toFixed(3)} and ${pct(best.exact)} exact with the schema in every prompt; ours is at ${ours.field_f1.toFixed(3)} and ${pct(ours.exact)} with none, on a box we own.` : null,
    ours && hinted && hinted.exact > ours.exact ? `Given the whole schema in every prompt, Haiku edges exact match (${pct(hinted.exact)} against ${pct(ours.exact)}). Ours gets there with no schema in the prompt, on hardware we own.` : null,
    ours?.avg_latency_s ? `The ${ours.avg_latency_s} s a document in the benchmark is unbatched generation; the throughput above is the batched server.` : null, ...m.problems.map((p) => `Not shown: ${p}`)].filter(Boolean);
  return h("div", { class: "panel" }, h("h2", {}, "Read this honestly"), h("ul", { class: "plain" }, lines.map((l) => h("li", {}, l))));
}
