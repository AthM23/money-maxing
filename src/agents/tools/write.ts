import { z } from "zod";
import { Proposal } from "../../contract/types.js";
import { dedupeKey, openEscalation } from "../../memory/escalations.js";
import { FactCandidate, recordFactCandidate } from "../../memory/facts.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import type { ToolEnv } from "../env.js";
import type { ToolSpec } from "./read.js";

export const EscalateInput = z.object({
  asked_user: z.string().min(1),
  party_id: z.string().min(1),
  predicate: z.string().min(1),
  decision_kind: z.string().min(1),
  what_happened: z.string().min(1),
  what_was_checked: z.array(z.object({ source: z.string(), query: z.string(), hits: z.number().int().nonnegative() })).min(1),
  what_is_unknown: z.string().min(1),
  treatments: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2).max(4),
});

const MIN_ESCALATION_TIER = 2;

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
export const FactCandidateToolInput = FactCandidate.extend({
  value: z.object({
    pct_off: z.number().min(0).max(100).optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    payer_party_id: z.string().min(1).optional(),
    note: z.string().optional(),
  }),
});

/** The only tools that change anything. `propose_entry` goes through the kernel; an agent cannot post any other way. */
export const WRITE_TOOL_SPECS: ToolSpec[] = [
  {
    name: "propose_entry", registry_name: "propose_entry", input: Proposal,
    description: "Propose an accounting entry with evidence. A deterministic kernel re-checks it. On reject you get the failed marks; fix the cause, never the symptom.",
    run: (input, env) => compactResult(proposeEntry(env.db, input, {
      actor: env.actor, mode: env.mode, autonomy_level: env.autonomy_level, tier: env.tier, as_of: env.as_of,
      decision_id: env.decision_id, features: env.features, replay_docs: env.replay_docs,
    }, { clock: env.clock, config: env.config })),
  },
  {
    name: "escalate", registry_name: "escalate", input: EscalateInput,
    description: "Ask the one person who knows. Only after the search plan is exhausted. If this was already asked, the stored answer comes back instead.",
    run: (input, env) => {
      const q = EscalateInput.parse(input);
      // A person's time costs more than a stronger model's. The cheapest tier hands up instead of asking.
      if (env.tier < MIN_ESCALATION_TIER && (env.max_tier ?? env.tier) > env.tier) {
        return { status: "handed_up", reason: `tier ${env.tier} may not ask a person while a stronger tier is available; call finish with outcome handed_off` };
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
