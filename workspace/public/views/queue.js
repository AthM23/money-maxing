import { act, h, money, toast, words } from "/dom.js";

const TREATMENTS = { credit_memo: "An agreed credit", write_off: "We will not collect it", tax_withholding: "Tax deducted at source", dispute_hold: "Hold it as disputed", chase: "Collect the balance" };

/** Everything that is waiting for a person, in one place. Each button goes through the same functions Slack uses. */
export function renderQueue(app, o) {
  const a = o.awaiting_you;
  const empty = Object.values(a).every((list) => list.length === 0);
  return h("section", {},
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Input needed"), h("p", { class: "muted" }, "The agents stop here. What you decide is recorded with your name, and what you say once is not asked again."))),
    empty ? h("div", { class: "panel" }, h("p", { class: "muted" }, "Nothing is waiting for a person.")) : null,
    a.open_questions.map((q) => h("div", { class: "panel" }, questionCard(app, q))),
    a.parked_entries.map((p) => h("div", { class: "panel" }, parkedCard(app, p))),
    a.rule_drafts.map((r) => h("div", { class: "panel" }, ruleCard(app, r))),
    a.proposed_facts.map((f) => h("div", { class: "panel" }, factCard(app, f))),
    (a.uploaded_bills ?? []).map((b) => h("div", { class: "panel" }, billCard(app, b))),
    a.certificate_followups.map((c) => h("div", { class: "panel" }, h("span", { class: "tag" }, "Follow-up"), h("p", {}, c.question), h("p", { class: "muted" }, `Owner ${c.owner}`))));
}

function billCard(app, b) {
  return h("div", { class: "question" },
    h("span", { class: "tag wait" }, "Uploaded bill"),
    h("p", { class: "lead" }, `${b.vendor} sent bill ${b.ref} for ${money(b.total_cents)}, dated ${b.bill_date}, period ${b.service_period}. It arrived through the pipeline and is on file with the document as evidence.`),
    h("p", { class: "muted" }, b.prior_bills
      ? `${b.prior_bills} prior bill(s) from this vendor averaging ${money(b.avg_cents)}: ${Math.abs(b.total_cents - b.avg_cents) <= b.avg_cents * 0.1 ? "this one is in the usual range." : "this one is out of their usual range, look twice."}`
      : "First bill from this vendor: no history to lean on, so a person decides."),
    h("p", { class: "muted" }, "Accepting queues it for the payment run. Nothing posts to the ledger until then."),
    h("div", { class: "row" },
      h("button", { class: "primary", on: { click: () => review(app, b, "approved") } }, "Accept the bill"),
      h("button", { on: { click: () => review(app, b, "rejected") } }, "Reject")));
}

async function review(app, b, outcome) {
  const r = await act("bill_review", { bill_id: b.bill_id, as: app.viewer?.id ?? "U_CFO", outcome });
  toast(r.status === "reviewed" ? (outcome === "approved" ? `${b.ref} accepted for the payment run.` : `${b.ref} rejected and voided.`) : r.said ?? "Already decided.");
  app.refresh();
}

export function questionCard(app, item) {
  const q = item.question ?? {};
  const form = h("form", { class: "answer", on: { submit: (e) => submitAnswer(e, app, item.escalation_id) } },
    h("label", {}, "Treatment", h("select", { name: "treatment" }, (q.treatments ?? []).map((t) => h("option", { value: t.id }, `${TREATMENTS[t.id] ?? words(t.id)} — ${t.label}`)))),
    h("label", {}, "This answer is", h("select", { name: "uses" }, h("option", { value: "one_time" }, "for this case only"), h("option", { value: "standing" }, "standing, until the date below"))),
    h("label", {}, "Until", h("input", { type: "date", name: "valid_to" })),
    h("label", {}, "Rate %, if it is a rate", h("input", { type: "number", name: "pct", min: "0", max: "100", step: "0.01", placeholder: "e.g. 2" })),
    h("label", { class: "wide" }, "In your words (kept as evidence)", h("textarea", { name: "text", rows: "2", required: true, minlength: "3" })),
    h("button", { class: "primary", type: "submit" }, "Answer"));
  return h("div", { class: "question" },
    h("span", { class: "tag wait" }, `Question for ${nameOf(app, q.asked_user ?? item.asked_user)}`),
    h("p", { class: "lead" }, q.what_happened ?? ""),
    q.what_was_checked?.length ? h("details", {}, h("summary", {}, `What was checked (${q.what_was_checked.length} places)`), h("ul", {}, q.what_was_checked.map((c) => h("li", {}, `${c.source}${c.query ? `: “${c.query}”` : ""} → ${c.hits ?? 0} hit(s)`)))) : null,
    h("p", {}, h("b", {}, "What is not known: "), q.what_is_unknown ?? ""),
    form);
}

function partyName(app, id) {
  return app.overview?.receipts.find((r) => r.party_id === id)?.party_name ?? id;
}

function nameOf(app, id) {
  const person = app.overview?.people.find((p) => p.id === id);
  return person ? `${person.name.replace(/\s*\(.*\)$/, "")}, ${person.role.replaceAll("_", " ")}` : id;
}

async function submitAnswer(event, app, escalationId) {
  event.preventDefault();
  const f = new FormData(event.target);
  const treatment = f.get("treatment");
  const pct = f.get("pct") ? Number(f.get("pct")) : undefined;
  const payload = { escalation_id: escalationId, as: app.viewer?.id, treatment, uses: f.get("uses"), text: f.get("text"), valid_to: f.get("valid_to") || undefined,
    ...(pct === undefined ? {} : treatment === "tax_withholding" ? { pct_withheld: pct } : { pct_off: pct }) };
  try {
    const r = await act("answer", payload);
    if (r.status !== "answered") return toast(`Not saved: ${r.status}${r.detail ? ` (${r.detail})` : ""}`, "bad");
    toast(r.fact_status === "active" ? "Saved and remembered. It will not be asked again for cases this covers." : "Saved.");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

/** `here` is true on the case's own page, where a button back to the case would go nowhere. */
export function parkedCard(app, p, here = false) {
  if (p.kind === "dispute_hold") return heldCard(app, p, here);
  return h("div", {},
    h("span", { class: "tag wait" }, "Approval"), h("p", { class: "lead" }, `${words(p.kind)} of ${money(p.amount_cents)} for ${partyName(app, p.party_id)}`),
    h("p", { class: "muted" }, `Prepared by ${p.prepared_by.label}. ${p.controller_note ? `Controller agent: ${p.controller_note}` : ""}`),
    reasoning(p),
    h("div", { class: "actions" },
      here ? null : h("button", { class: "ghost", on: { click: () => app.go("case", p.intent_id) } }, "Open the case"),
      h("button", { class: "ghost", on: { click: () => decide(app, p.decision_id, "rejected") } }, "Decline"),
      h("button", { class: "primary", on: { click: () => decide(app, p.decision_id, "approved") } }, "Approve")));
}

/** Why the entry was prepared, in the preparer's words, and the quotes it rests on. The kernel matched every quote to its source. */
function reasoning(p) {
  if (!p.why?.length && !p.evidence?.length) return null;
  return h("div", { class: "why" }, p.why.map((w) => h("p", {}, w)),
    p.evidence.length ? h("details", {}, h("summary", {}, `What it rests on (${p.evidence.length} quote${p.evidence.length === 1 ? "" : "s"}, checked character by character against the source)`),
      h("ul", {}, p.evidence.map((e) => h("li", {}, h("b", {}, e.claim), h("blockquote", {}, `“${e.quote}”`), h("span", { class: "mono muted" }, e.trace_id))))) : null);
}

/**
 * An amount an agent held as disputed. Nothing was booked, and what happens to it is a person's decision: leave it
 * held, or decide it here, which is recorded as a question put to you and your answer.
 */
function heldCard(app, p, here) {
  const form = h("form", { class: "answer", on: { submit: (e) => submitDecision(e, app, p.decision_id) } },
    h("label", {}, "Decide it as", h("select", { name: "treatment" }, ["credit_memo", "write_off", "tax_withholding", "chase"].map((t) => h("option", { value: t }, TREATMENTS[t])))),
    h("label", {}, "This decision is", h("select", { name: "uses" }, h("option", { value: "one_time" }, "for this case only"), h("option", { value: "standing" }, "standing, until the date below"))),
    h("label", {}, "Until", h("input", { type: "date", name: "valid_to" })),
    h("label", {}, "Rate %, if it is a rate", h("input", { type: "number", name: "pct", min: "0", max: "100", step: "0.01", placeholder: "e.g. 2" })),
    h("label", { class: "wide" }, "In your words (kept as evidence)", h("textarea", { name: "text", rows: "2", required: true, minlength: "3" })),
    h("div", { class: "actions wide" },
      here ? null : h("button", { class: "ghost", type: "button", on: { click: () => app.go("case", p.intent_id) } }, "Open the case"),
      h("button", { class: "ghost", type: "button", on: { click: () => decide(app, p.decision_id, "approved") } }, "Keep it held"),
      h("button", { class: "primary", type: "submit" }, "Decide")));
  return h("div", { class: "question" },
    h("span", { class: "tag wait" }, "Held as disputed · your decision"),
    h("p", { class: "lead" }, `${money(p.amount_cents)} from ${partyName(app, p.party_id)} is held as disputed. Nothing has been booked.`),
    h("p", { class: "muted" }, `Prepared by ${p.prepared_by.label}.`), reasoning(p), form);
}

async function submitDecision(event, app, decisionId) {
  event.preventDefault();
  const f = new FormData(event.target);
  const treatment = f.get("treatment");
  const pct = f.get("pct") ? Number(f.get("pct")) : undefined;
  const payload = { decision_id: decisionId, as: app.viewer?.id, treatment, uses: f.get("uses"), text: f.get("text"), valid_to: f.get("valid_to") || undefined,
    ...(pct === undefined ? {} : treatment === "tax_withholding" ? { pct_withheld: pct } : { pct_off: pct }) };
  try {
    const r = await act("decide", payload);
    if (r.status !== "answered") return toast(`Not saved: ${r.status}${r.detail ? ` (${r.detail})` : ""}`, "bad");
    toast(r.fact_status === "active" ? "Decided and remembered. The entry it calls for is prepared and waiting for approval." : "Decided.");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

async function decide(app, decisionId, outcome) {
  try {
    const r = await act("approve", { decision_id: decisionId, as: app.viewer?.id, outcome });
    if (r.status === "posted") toast("Posted. The kernel re-checked the entry with your approval on it.");
    else if (r.status === "rejected") toast(`The kernel refused it: ${r.failed.map((m) => `${m.check} ${m.detail}`).join("; ")}`, "bad");
    else if (r.status === "blocked") toast(`Blocked by rule ${r.rule}. An approval cannot lift this.`, "bad");
    else toast(`Nothing posted (${r.status}).`, outcome === "rejected" ? "ok" : "bad");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

function ruleCard(app, r) {
  const b = r.backtest ?? {};
  return h("div", {},
    h("span", { class: "tag" }, "Policy derived"), h("p", { class: "lead mono" }, r.name),
    h("p", { class: "muted" }, `From what your team booked: matched ${b.n ?? "?"}, exactly this ${b.agree ?? "?"}, leave-one-out ${b.held_out_covered ?? "?"} of ${b.held_out_n ?? "?"}. Customers: ${r.customer_scope.join(", ") || "any"}.${r.supersedes ? ` Retires ${r.supersedes}.` : ""}`),
    h("div", { class: "actions" }, h("button", { class: "primary", on: { click: () => approveRule(app, r.policy_id) } }, "Approve like a pull request")));
}

async function approveRule(app, policyId) {
  try {
    const r = await act("policy", { policy_id: policyId, as: app.viewer?.id });
    toast(r.status === "approved" ? `Approved. Replay now agrees on ${r.agreed} of ${r.replayed} closed decisions.` : `Not approved: ${r.status}`, r.status === "approved" ? "ok" : "bad");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}

function factCard(app, f) {
  return h("div", {},
    h("span", { class: "tag" }, "Remember this?"), h("p", { class: "lead" }, `${f.party_id} · ${words(f.predicate)}`),
    h("pre", { class: "small" }, JSON.stringify(f.value, null, 1)),
    h("p", { class: "muted" }, `${f.uses} · for ${f.kinds.join(", ") || "any kind"} · ${f.valid_from} to ${f.valid_to} · proposed by ${f.stated_by}`),
    h("div", { class: "actions" },
      h("button", { class: "ghost", on: { click: () => decideFact(app, f.id, "rejected") } }, "Do not remember"),
      h("button", { class: "primary", on: { click: () => decideFact(app, f.id, "approved") } }, "Remember")));
}

async function decideFact(app, factId, outcome) {
  try {
    const r = await act("fact", { fact_id: factId, as: app.viewer?.id, outcome });
    toast(r.status === "active" ? "Remembered, within your limit and its end date." : r.status === "rejected" ? "Not remembered." : `Nothing changed (${r.status}).`, r.status === "unauthorised" ? "bad" : "ok");
    await app.refresh();
  } catch (err) { toast(err.message, "bad"); }
}
