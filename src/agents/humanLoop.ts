import { createHash } from "node:crypto";
import { z } from "zod";
import { ACCOUNTS } from "../contract/accounts.js";
import { CaseFile, IsoDate, type Proposal } from "../contract/types.js";
import { answerEscalation } from "../memory/escalations.js";
import { approveFact, recordFactCandidate } from "../memory/facts.js";
import { DEFAULT_CONFIG, systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { newId } from "../runtime/ids.js";
import { safeJson } from "../runtime/lookups.js";
import { proposeEntry, type ProposeResult } from "../runtime/proposeEntry.js";

/** What a person's answer boils down to. Buttons fill `treatment`; the free text is kept verbatim as evidence. */
export const HumanAnswer = z.object({
  treatment: z.enum(["credit_memo", "write_off", "dispute_hold", "chase"]),
  text: z.string().min(1),
  uses: z.enum(["standing", "one_time"]).default("one_time"),
  pct_off: z.number().min(0).max(100).optional(),
  valid_to: IsoDate.optional(),
});
export type HumanAnswer = z.infer<typeof HumanAnswer>;

export type AnswerOutcome =
  | { status: "invalid" | "not_found" | "already_answered" | "unauthorised"; detail: string }
  | { status: "answered"; trace_id: string; fact_id: string | null; fact_status: "active" | "candidate" | "none"; proposal: ProposeResult | null };

const ADJUSTMENT_ACCOUNT: Record<"credit_memo" | "write_off", string> = {
  credit_memo: ACCOUNTS.deferred_revenue,
  write_off: ACCOUNTS.bank_charges,
};

/**
 * A person answered. Keep their words as a trace, record the answer, remember it as a fact scoped to exactly what
 * was said, and resume the case with an entry that cites the answer. Asked once: the next case reads the fact.
 */
export function recordHumanAnswer(
  db: Db, escalationId: string, answerer: string, input: unknown, deps: { clock?: Clock; config?: RuntimeConfig } = {},
): AnswerOutcome {
  const clock = deps.clock ?? systemClock;
  const parsed = HumanAnswer.safeParse(input);
  if (!parsed.success) return { status: "invalid", detail: parsed.error.issues.map((i) => i.message).join("; ") };
  const answer = parsed.data;
  const ctx = loadEscalation(db, escalationId);
  if (!ctx) return { status: "not_found", detail: escalationId };

  const traceId = writeAnswerTrace(db, clock, escalationId, answerer, answer.text, ctx.case_file.party_id);
  const recorded = answerEscalation(db, clock, escalationId, answerer, { ...answer, trace_id: traceId });
  if (recorded.status !== "answered") return { status: recorded.status, detail: "reason" in recorded ? recorded.reason : escalationId };

  const fact = rememberAnswer(db, clock, ctx.case_file, answer, answerer, traceId);
  const proposal = resume(db, ctx.case_file, answer, traceId, fact.fact_id, { clock, config: deps.config ?? DEFAULT_CONFIG });
  return { status: "answered", trace_id: traceId, fact_id: fact.fact_id, fact_status: fact.status, proposal };
}

function loadEscalation(db: Db, escalationId: string): { case_file: CaseFile } | null {
  const row = db
    .prepare("SELECT i.case_json FROM escalation e JOIN decision d ON d.id = e.decision_id JOIN intent i ON i.id = d.intent_id WHERE e.id = ?")
    .get(escalationId) as { case_json: string | null } | undefined;
  const parsed = row?.case_json ? CaseFile.safeParse(safeJson(row.case_json)) : null;
  return parsed?.success ? { case_file: parsed.data } : null;
}

function writeAnswerTrace(db: Db, clock: Clock, escalationId: string, answerer: string, text: string, partyId: string): string {
  const id = newId("tr");
  const payload = JSON.stringify({ answerer, text });
  db.prepare(
    `INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json)
     VALUES (?, 'slack', 'human_answer', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `escalation:${escalationId}`, clock.now(), clock.now(), clock.now(), partyId, createHash("sha256").update(payload).digest("hex"), payload);
  return id;
}

/** The fact is never wider than the answer: this party, this treatment, one-time unless they said standing, and it ends. */
function rememberAnswer(
  db: Db, clock: Clock, c: CaseFile, answer: HumanAnswer, answerer: string, traceId: string,
): { fact_id: string | null; status: "active" | "candidate" | "none" } {
  if (answer.treatment === "chase" || answer.treatment === "dispute_hold") return { fact_id: null, status: "none" };
  const monthEnd = `${c.entry_date.slice(0, 7)}-31`;
  const rec = recordFactCandidate(db, clock, {
    party_id: c.party_id, predicate: answer.uses === "one_time" ? "one_time_credit" : "concession_pct",
    value: answer.pct_off !== undefined ? { pct_off: answer.pct_off } : { amount_cents: c.shortfall_cents },
    kinds: [answer.treatment], uses: answer.uses, valid_from: c.entry_date.slice(0, 8) + "01",
    valid_to: answer.valid_to ?? monthEnd, explained_amount_cents: c.shortfall_cents,
    source_trace_ids: [traceId], stated_by: answerer,
  });
  if (rec.status !== "candidate") return { fact_id: null, status: "none" };
  const approved = approveFact(db, clock, rec.fact_id, answerer);
  return { fact_id: rec.fact_id, status: approved.status === "active" ? "active" : "candidate" };
}

function resume(
  db: Db, c: CaseFile, answer: HumanAnswer, traceId: string, factId: string | null, deps: { clock: Clock; config: RuntimeConfig },
): ProposeResult | null {
  if (answer.treatment === "chase") return null;
  const docId = c.doc_ids[c.doc_ids.length - 1];
  if (!docId) return null;
  const proposal: Proposal = {
    intent_id: c.intent_id, function: c.function, kind: answer.treatment, party_id: c.party_id, entry_date: c.entry_date,
    applications: [{ doc_id: docId, amount_cents: c.shortfall_cents }],
    entries: answer.treatment === "dispute_hold" ? [] : [
      { account: ADJUSTMENT_ACCOUNT[answer.treatment], debit_cents: c.shortfall_cents, credit_cents: 0, memo: `Per answer to escalation (${traceId})` },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo: `Per answer to escalation (${traceId})` },
    ],
    evidence: [{ claim: "the account owner's answer", trace_id: traceId, quote: answer.text }],
    policy_refs: [], fact_refs: factId ? [factId] : [], judgment: [],
  };
  return proposeEntry(db, proposal, { actor: "router:resume", mode: "live", autonomy_level: "review", tier: 0 }, deps);
}
