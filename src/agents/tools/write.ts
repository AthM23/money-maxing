import { z } from "zod";
import { Proposal, ProposalKind } from "../../contract/types.js";
import { dedupeKey, openEscalation } from "../../memory/escalations.js";
import { FactCandidate, recordFactCandidate } from "../../memory/facts.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import type { ToolEnv } from "../env.js";
import type { ToolSpec } from "./read.js";

/**
 * What can be unknown, as a closed list. Together with the party and the kind of entry it is the key that makes a
 * question "the same question": free text here would let a rephrased question through as a new one, and a person
 * would be asked twice. The sentence itself belongs in `what_is_unknown`.
 */
export const UNKNOWNS = [
  "shortfall_reason", "overpayment_treatment", "payer_identity", "remittance_allocation", "bill_validity", "vendor_bank_change", "other",
] as const;

/** Same list as HumanAnswer.treatment in humanLoop.ts: what a person's click can turn into. */
export const ANSWER_TREATMENTS = ["credit_memo", "write_off", "tax_withholding", "dispute_hold", "chase"] as const;

export const EscalateInput = z.object({
  asked_user: z.string().min(1),
  party_id: z.string().min(1),
  predicate: z.enum(UNKNOWNS),
  /** The kind of entry the answer would unlock. */
  decision_kind: ProposalKind,
  what_happened: z.string().min(1),
  what_was_checked: z.array(z.object({ source: z.string(), query: z.string(), hits: z.number().int().nonnegative() })).min(1),
  what_is_unknown: z.string().min(1),
  /**
   * The answers a person can give. The ids are the treatments the runtime knows how to book or hold; an invented
   * id would be a button that does nothing. The label is a button, so it is short; the nuance goes in the question.
   */
  treatments: z.array(z.object({ id: z.enum(ANSWER_TREATMENTS), label: z.string().min(1).max(60) })).min(2).max(4),
});

const MIN_ESCALATION_TIER = 2;
/**
 * Everywhere an approval or an explanation could be on record. A person's time is only worth asking for once all of
 * these have been looked in, and that is checked against the steps this turn actually recorded, not against what the
 * model says it searched.
 */
const SEARCH_PLAN = ["memory_facts", "policy_memo_lookup", "mail_search", "chat_search", "contracts_find_clause"] as const;

export const FinishInput = z.object({
  summary: z.string().min(1),
  /** REFUSE must say everywhere it looked; ESCALATE must name what is not known. */
  outcome: z.enum(["proposed", "escalated", "refused", "handed_off"]),
  places_looked: z.array(z.string()).default([]),
});

/**
 * What the model may say a fact's value is. Typed on purpose: a free-form record in a tool schema makes the Agent SDK
 * drop the whole tool list without an error, and the model then invents tool calls in plain text.
 */
/**
 * What kind of thing was learned, as a closed list. A newer fact supersedes an older one for the same party and
 * predicate, and the kernel reads two of these by name, so a sentence here would quietly break both.
 */
export const FACT_PREDICATES = ["concession_pct", "one_time_credit", "withholding_tax_pct", "payer_alias", "parent_pays", "other"] as const;

export const FactCandidateToolInput = FactCandidate.extend({
  predicate: z.enum(FACT_PREDICATES),
  value: z.object({
    pct_off: z.number().min(0).max(100).optional(),
    pct_withheld: z.number().min(0).max(100).optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    payer_party_id: z.string().min(1).optional(),
    note: z.string().optional(),
  }),
});

/** The lookups in the search plan that this turn has not made, read from its own recorded steps. */
function placesNotLooked(env: ToolEnv): string[] {
  const rows = env.db.prepare("SELECT DISTINCT tool FROM decision_step WHERE decision_id = ? AND kind = 'tool_call' AND tier = ?").all(env.decision_id, env.tier) as { tool: string | null }[];
  const made = new Set(rows.map((r) => r.tool));
  return SEARCH_PLAN.filter((tool) => !made.has(tool));
}

/** The only tools that change anything. `propose_entry` goes through the kernel; an agent cannot post any other way. */
export const WRITE_TOOL_SPECS: ToolSpec[] = [
  {
    name: "propose_entry", registry_name: "propose_entry", input: Proposal,
    description: "Propose an accounting entry with evidence. A deterministic kernel re-checks it. `applications` lists, for each document this entry settles, the amount THIS entry takes off its open balance: for an entry that moves no cash it equals the debit outside the control accounts, not the cash that arrived. `evidence[].trace_id` is a trace id from a search or read_trace result, never a bank or invoice id. `bank_txn_id` belongs only on an entry that applies cash. `policy_refs` and `fact_refs` take ids of compiled rules and stored facts (from memory_facts); a written policy memo or a contract is a document, so cite it in `evidence` with a quote. On reject you get the failed marks; fix the cause, never the symptom.",
    run: (input, env) => compactResult(proposeEntry(env.db, input, {
      actor: env.actor, mode: env.mode, autonomy_level: env.autonomy_level, tier: env.tier, as_of: env.as_of,
      decision_id: env.decision_id, features: env.features, replay_docs: env.replay_docs,
    }, { clock: env.clock, config: env.config })),
  },
  {
    name: "escalate", registry_name: "escalate", input: EscalateInput,
    description: "Ask the one person who knows. Only after the search plan is exhausted. `predicate` is what you do not know, picked from the list; `decision_kind` is the kind of entry the answer would unlock; the sentence goes in `what_is_unknown`. `treatments` are two to four buttons: each id is one of the fixed treatments (credit_memo = an agreed concession, write_off = we will not collect it, tax_withholding = tax deducted at source, dispute_hold = hold it open as disputed, chase = collect the balance) and each label is at most 60 characters. If this was already asked, the stored answer comes back instead.",
    run: (input, env) => {
      const q = EscalateInput.parse(input);
      // The cheapest tier may ask a person only once it has verifiably looked everywhere an answer could be. On the
      // first real run it reached the right question in fifty seconds and six cents, was refused on tier alone, and the
      // stronger tiers took ten minutes and a dollar to ask the same thing. What earns the question is the search, not
      // the size of the model; a stronger tier is still there for the case the cheap one cannot even frame.
      if (env.tier < MIN_ESCALATION_TIER && (env.max_tier ?? env.tier) > env.tier) {
        const missing = placesNotLooked(env);
        if (missing.length > 0) {
          return { status: "handed_up", reason: `tier ${env.tier} may ask a person only after looking everywhere an answer could be on record. Not looked in yet: ${missing.join(", ")}. Look there first, or call finish with outcome handed_off` };
        }
      }
      return openEscalation(env.db, env.clock, {
        decision_id: env.decision_id, intent_id: env.intent_id, asked_user: q.asked_user,
        dedupe_key: dedupeKey(q.party_id, q.predicate, q.decision_kind), question: q, entry_date: env.entry_date,
        amount_cents: typeof env.features?.shortfall_cents === "number" ? env.features.shortfall_cents : undefined,
      });
    },
  },
  {
    name: "record_fact_candidate", registry_name: "record_fact_candidate", input: FactCandidateToolInput,
    description: "Store what you learned as a candidate fact: party, scope, end date, source traces. It applies to nothing until approved.",
    run: (input, env) => recordFactCandidate(env.db, env.clock, input),
  },
  {
    name: "finish", registry_name: "finish", input: FinishInput,
    description: "End the run. Say what you did and everywhere you looked.",
    run: (input) => ({ ok: true, ...FinishInput.parse(input) }),
  },
];

/** Keep what the model needs to act on, drop the rest of the workpaper. */
function compactResult(r: ReturnType<typeof proposeEntry>): unknown {
  if (r.status === "rejected") return { status: r.status, decision_id: r.decision_id, failed: r.failed.map((m) => ({ check: m.check, detail: m.detail })) };
  if (r.status === "pending_approval") return { status: r.status, decision_id: r.decision_id, route: r.route };
  return r;
}
