import { DECIDED_INSTEAD_OF_HELD } from "../contract/approvalNotes.js";
import { Proposal, type ProposalKind } from "../contract/types.js";
import { dedupeKey, openEscalation } from "../memory/escalations.js";
import { approveDecision } from "../runtime/approve.js";
import { systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { HumanAnswer, recordHumanAnswer, type AnswerOutcome } from "./humanLoop.js";

const usd = (cents: number): string => `USD ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What a person can decide instead of holding. Holding is not here: that is an ordinary approval of the hold. */
const DECISIONS: { id: "credit_memo" | "write_off" | "tax_withholding" | "chase"; label: string }[] = [
  { id: "credit_memo", label: "Grant it as a credit" }, { id: "write_off", label: "We will not collect it" },
  { id: "tax_withholding", label: "It is tax deducted at source" }, { id: "chase", label: "Collect the balance" },
];

/**
 * An agent found an amount contested and parked a hold: nothing posts, and the decision is a person's. They can leave
 * it held, which is an ordinary approval, or decide it there and then. Deciding is recorded as what it is: the question
 * the evidence raises, put to them on that case, and their answer. From there it is the same path as any other answer:
 * their words kept as evidence, a fact no wider than what they said, the entry prepared in code and parked for approval.
 */
export function decideHeldAmount(db: Db, decisionId: string, answerer: string, input: unknown, deps: { clock?: Clock; config?: RuntimeConfig } = {}): AnswerOutcome {
  const parsed = HumanAnswer.safeParse(input);
  if (!parsed.success) return { status: "invalid", detail: parsed.error.issues.map((i) => i.message).join("; ") };
  if (parsed.data.treatment === "dispute_hold") return { status: "invalid", detail: "to keep it held, approve the hold" };
  const held = parkedHold(db, decisionId);
  if (!held) return { status: "not_found", detail: `${decisionId} is not a dispute hold waiting for a person` };
  const clock = deps.clock ?? systemClock;
  const decisionKind: ProposalKind = parsed.data.treatment === "chase" ? "dispute_hold" : parsed.data.treatment;
  return db.transaction((): AnswerOutcome => {
    const opened = openEscalation(db, clock, {
      decision_id: decisionId, intent_id: held.intent_id, asked_user: answerer, entry_date: held.proposal.entry_date, amount_cents: held.cents,
      dedupe_key: dedupeKey(held.proposal.party_id, "shortfall_reason", decisionKind), question: questionOf(held, answerer, decisionKind),
    });
    if (opened.status === "already_answered") return { status: "invalid", detail: "a standing answer already covers this; run the code tier instead" };
    const declined = approveDecision(db, decisionId, { approver_id: answerer, approver_kind: "human", outcome: "rejected", note: `${DECIDED_INSTEAD_OF_HELD} ${parsed.data.treatment}` }, deps);
    if (declined.status !== "declined") throw new Error(`the hold could not be set aside (${declined.status}); nothing was changed`);
    const outcome = recordHumanAnswer(db, opened.escalation_id, answerer, parsed.data, deps);
    // Anything short of an answer on record rolls the whole decision back: no half-decided case.
    if (outcome.status !== "answered") throw new Error(`the answer was not recorded (${outcome.status}: ${outcome.detail}); nothing was changed`);
    return outcome;
  }).immediate();
}

interface Held { intent_id: string; proposal: Proposal; cents: number; actor: string }

function parkedHold(db: Db, decisionId: string): Held | null {
  const row = db.prepare(
    `SELECT d.intent_id, d.proposal_json, d.actor FROM decision d WHERE d.id = ? AND d.mode = 'live' AND d.kind = 'dispute_hold' AND d.route = 'PROPOSE'
       AND d.posted_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)`,
  ).get(decisionId) as { intent_id: string; proposal_json: string | null; actor: string } | undefined;
  const proposal = row ? Proposal.safeParse(safeJson(row.proposal_json ?? "null")) : null;
  if (!row || !proposal?.success) return null;
  return { intent_id: row.intent_id, proposal: proposal.data, actor: row.actor, cents: proposal.data.applications.reduce((n, a) => n + a.amount_cents, 0) };
}

/** The question, written by code from what the agent put on record: what is held, why, and what it rested on. */
function questionOf(held: Held, answerer: string, decisionKind: ProposalKind): Record<string, unknown> {
  const p = held.proposal;
  const docs = p.applications.map((a) => a.doc_id).join(", ");
  const why = p.judgment.map((j) => j.note).filter(Boolean).join(" ");
  return {
    asked_user: answerer, party_id: p.party_id, predicate: "shortfall_reason", decision_kind: decisionKind,
    what_happened: `${usd(held.cents)} on ${docs} is held as disputed (prepared by ${held.actor}).${why ? ` ${why}` : ""}`,
    what_was_checked: p.evidence.map((e) => ({ source: e.trace_id, query: e.claim, hits: 1 })),
    what_is_unknown: "How to settle the held amount. The documents leave that to a person.",
    treatments: DECISIONS,
  };
}
