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
    hero(m.extraction), h("div", { class: "grid2" }, recipe(m), extraction(m.extraction)), harness(m.harness), generalises(m), notes(m));
}

function hero(x) {
  const base = x?.rows.find((r) => r.key === "base4b"), ours = x?.rows.find((r) => r.ours);
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
      x.rows.map((r) => bar(r.label, r[key] ?? 0, show(r[key] ?? 0), r.ours ? "ours" : r.key.startsWith("haiku") ? "api" : "base", r.note)))),
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
    }));
}

function generalises(m) {
  const f = m.fresh?.result, ours = m.extraction?.rows.find((r) => r.ours);
  const tile = (label, value, note) => h("div", { class: "tile" }, h("span", { class: "tilelabel" }, label), h("div", { class: "tilevalue" }, h("b", {}, value)), h("span", { class: "muted small" }, note));
  return h("div", { class: "tiles four" },
    ours?.held_out_f1 === undefined ? null : tile("Customers it never saw", ours.held_out_f1.toFixed(3), `field-F1 on ${ours.held_out_n} held-out documents, against ${ours.field_f1.toFixed(3)} overall: no sign it memorised names`),
    !f ? null : [tile("Fresh exam, new seed", f.field_f1.toFixed(3), `${count(f.n)} documents generated after training, ${m.fresh.protocol.data}; ${pct(f.exact)} exact, ${f.errors} errors`),
      tile("Throughput on one box", `${f.docs_per_min} docs/min`, `${f.effective_s_per_doc} s a document at batch ${f.avg_batch_size} · ${Math.round(f.tokens_per_s_aggregate)} tokens/s`)],
    tile("Cost per document", "$0", "served on our own GX10: no API bill, and no document leaves the building"));
}

function notes(m) {
  const x = m.extraction, ours = x?.rows.find((r) => r.ours), hinted = x?.rows.find((r) => r.key === "haiku-hinted");
  const lines = [m.data?.honesty_note ? `The data is ${m.data.honesty_note}.` : null, x?.api_note ? `Haiku rows: ${x.api_note}. No latency or cost was recorded for them.` : null,
    ours && hinted && hinted.exact > ours.exact ? `Given the whole schema in every prompt, Haiku edges exact match (${pct(hinted.exact)} against ${pct(ours.exact)}). Ours gets there with no schema in the prompt, on hardware we own.` : null,
    ours?.avg_latency_s ? `The ${ours.avg_latency_s} s a document in the benchmark is unbatched generation; the throughput above is the batched server.` : null, ...m.problems.map((p) => `Not shown: ${p}`)].filter(Boolean);
  return h("div", { class: "panel" }, h("h2", {}, "Read this honestly"), h("ul", { class: "plain" }, lines.map((l) => h("li", {}, l))));
}
