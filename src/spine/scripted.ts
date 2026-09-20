import { ACCOUNTS } from "../contract/accounts.js";
import type { Investigator } from "../agents/investigator.js";

const QUOTE = "Initech gets 10% off the platform fee through renewal on 2027-06-30";

/**
 * A stand-in for the model tier, used only when no ANTHROPIC_API_KEY is set, so the spine can be run and tested
 * for free. It is NOT part of the product: it knows the Initech answer. What it cannot do is skip the system:
 * it acts only through the same tools as a model, so the search, the kernel's quote check, materiality and the
 * approval gate all apply unchanged. Any other case it hands back, exactly as if no tier were configured.
 */
export const scriptedInitech: Investigator = {
  name: "scripted:initech-stand-in",
  async investigate(task, call) {
    const c = task.case_file;
    // 10% of the invoice, to the cent, or it is not the concession the email describes.
    const isTenPct = c.shortfall_cents > 0 && c.shortfall_cents * 10 === c.expected_cents;
    if (c.party_id !== "initech" || !isTenPct || c.doc_ids.length !== 1) {
      return { outcome: "handed_off", summary: "stand-in only knows the Initech case", places_looked: [] };
    }
    const hits = call("mail_search", { query: "Initech off platform fee renewal", party_id: c.party_id }).output as { trace_id: string }[];
    for (const hit of hits) {
      const doc = call("read_trace", { trace_id: hit.trace_id }).output as { text?: string };
      if (!doc.text?.includes(QUOTE)) continue;
      const memo = "Concession per CEO email of 28 Jun: 10% off through renewal";
      call("propose_entry", {
        intent_id: c.intent_id, function: "ar", kind: "credit_memo", party_id: c.party_id, entry_date: c.entry_date,
        applications: [{ doc_id: c.doc_ids[0], amount_cents: c.shortfall_cents }],
        entries: [
          { account: ACCOUNTS.deferred_revenue, debit_cents: c.shortfall_cents, credit_cents: 0, memo },
          { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo },
        ],
        terms_change: { pct_off: 10, until: "2027-06-30" },
        evidence: [{ claim: "CEO granted 10% off the platform fee through renewal", trace_id: hit.trace_id, quote: QUOTE }],
        policy_refs: [], fact_refs: [], judgment: [],
      });
      call("record_fact_candidate", {
        party_id: c.party_id, predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
        valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: [hit.trace_id], stated_by: "morgan.hale@northwind.test",
      });
      return { outcome: "proposed", summary: "CEO email explains the shortfall", places_looked: ["mail"] };
    }
    return { outcome: "handed_off", summary: "the CEO email was not found", places_looked: ["mail"] };
  },
};
