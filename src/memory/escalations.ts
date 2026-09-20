import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { emit } from "../runtime/events.js";
import { newId } from "../runtime/ids.js";
import { safeJson } from "../runtime/lookups.js";

/** Asked once: one question per party, predicate and decision kind. No period in the key, on purpose. */
export function dedupeKey(partyId: string, predicate: string, kind: string): string {
  return `${partyId}|${predicate}|${kind}`;
}

export interface OpenEscalationInput {
  decision_id: string;
  intent_id: string;
  asked_user: string;
  dedupe_key: string;
  question: Record<string, unknown>;
  deadline?: string;
  /** Date of the case being asked about. Lets a dated or one-time answer stop covering later cases. */
  entry_date?: string;
}

export type OpenEscalationResult =
  | { status: "already_answered"; escalation_id: string; answer: Record<string, unknown> }
  | { status: "already_open"; escalation_id: string }
  | { status: "opened"; escalation_id: string };

/** Open a question, unless the same one was already asked. A repeat question is a memory failure, so it never sends. */
export function openEscalation(db: Db, clock: Clock, input: OpenEscalationInput): OpenEscalationResult {
  const prior = db
    .prepare("SELECT id, answer_json FROM escalation WHERE dedupe_key = ? ORDER BY asked_at DESC LIMIT 1")
    .get(input.dedupe_key) as { id: string; answer_json: string | null } | undefined;
  const priorAnswer = prior?.answer_json ? ((safeJson(prior.answer_json) as Record<string, unknown> | null) ?? {}) : null;
  if (prior && priorAnswer && covers(priorAnswer, input.entry_date)) {
    return { status: "already_answered", escalation_id: prior.id, answer: priorAnswer };
  }
  if (prior && !priorAnswer) return { status: "already_open", escalation_id: prior.id };

  const id = newId("esc");
  // A one-time or lapsed answer does not cover this case: that is a new question, and it carries the old answer with it.
  if (prior && priorAnswer) input = { ...input, question: { ...input.question, prior_escalation_id: prior.id, prior_answer: priorAnswer } };
  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO escalation (id, decision_id, asked_user, dedupe_key, question_json, deadline, asked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.decision_id, input.asked_user, input.dedupe_key, JSON.stringify(input.question), input.deadline ?? null, clock.now());
    db.prepare("UPDATE intent SET status = 'waiting_on_human' WHERE id = ?").run(input.intent_id);
    emit(db, clock, { topic: "human.escalation.opened", from_function: "memory", intent_id: input.intent_id,
      payload: { escalation_id: id, asked_user: input.asked_user, dedupe_key: input.dedupe_key } });
  });
  run();
  return { status: "opened", escalation_id: id };
}

/** A stored answer covers a later case only if it was given as standing and has not lapsed by that case's date. */
function covers(answer: Record<string, unknown>, entryDate?: string): boolean {
  if (answer.uses !== "standing") return false;
  const validTo = typeof answer.valid_to === "string" ? answer.valid_to : null;
  return !(validTo && entryDate && entryDate > validTo);
}

export type AnswerResult =
  | { status: "not_found" | "already_answered"; escalation_id: string }
  | { status: "unauthorised"; escalation_id: string; reason: string }
  | { status: "answered"; escalation_id: string; intent_id: string };

/** Record the answer. Only the person asked, or someone in the approval matrix, may answer. */
export function answerEscalation(
  db: Db, clock: Clock, escalationId: string, answerer: string, answer: Record<string, unknown>, slackTs?: string,
): AnswerResult {
  const row = db
    .prepare("SELECT e.id, e.asked_user, e.answer_json, d.intent_id FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE e.id = ?")
    .get(escalationId) as { id: string; asked_user: string; answer_json: string | null; intent_id: string } | undefined;
  if (!row) return { status: "not_found", escalation_id: escalationId };
  if (row.answer_json) return { status: "already_answered", escalation_id: escalationId };
  const inMatrix = db.prepare("SELECT 1 FROM approver WHERE id = ?").get(answerer) !== undefined;
  if (answerer !== row.asked_user && !inMatrix) {
    return { status: "unauthorised", escalation_id: escalationId, reason: `${answerer} was not asked and is not in the approval matrix` };
  }
  const run = db.transaction(() => {
    db.prepare("UPDATE escalation SET answer_json = ?, answered_at = ?, slack_ts = COALESCE(?, slack_ts) WHERE id = ?")
      .run(JSON.stringify({ ...answer, answered_by: answerer }), clock.now(), slackTs ?? null, escalationId);
    db.prepare("UPDATE intent SET status = 'open' WHERE id = ? AND status = 'waiting_on_human'").run(row.intent_id);
    emit(db, clock, { topic: "human.escalation.answered", from_function: "memory", intent_id: row.intent_id,
      payload: { escalation_id: escalationId, answered_by: answerer } });
  });
  run();
  return { status: "answered", escalation_id: escalationId, intent_id: row.intent_id };
}
