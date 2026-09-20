import { createHash } from "node:crypto";
import { z } from "zod";
import { ACCOUNTS } from "../contract/accounts.js";
import { CaseFile, IsoDate, type Proposal } from "../contract/types.js";
import { answerEscalation } from "../memory/escalations.js";
import { ANSWER_TREATMENTS } from "./tools/write.js";
import { approveFact, recordFactCandidate } from "../memory/facts.js";
import { APP_CONFIG } from "../packs/index.js";
import { systemClock, type Clock, type RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { newId } from "../runtime/ids.js";
import { settleIntent } from "../runtime/intentStatus.js";
import { safeJson } from "../runtime/lookups.js";
import { proposeEntry, type ProposeResult } from "../runtime/proposeEntry.js";

/** What a person's answer boils down to. Buttons fill `treatment`; the free text is kept verbatim as evidence. */
export const HumanAnswer = z.object({
  treatment: z.enum(ANSWER_TREATMENTS),
  text: z.string().min(1),
  uses: z.enum(["standing", "one_time"]).default("one_time"),
  pct_off: z.number().min(0).max(100).optional(),
  /** For tax withheld at source: the rate the customer is required to deduct. */
  pct_withheld: z.number().min(0).max(100).optional(),
  valid_to: IsoDate.optional(),
}).refine((a) => a.uses !== "standing" || a.valid_to !== undefined, {
  message: "standing answers require an explicit end date", path: ["valid_to"],
});
export type HumanAnswer = z.infer<typeof HumanAnswer>;

export type AnswerOutcome =
  | { status: "invalid" | "not_found" | "already_answered" | "unauthorised"; detail: string }
  | { status: "answered"; trace_id: string; fact_id: string | null; fact_status: "active" | "candidate" | "none"; proposal: ProposeResult | null };

const ADJUSTMENT_ACCOUNT: Record<"credit_memo" | "write_off" | "tax_withholding", string> = {
  credit_memo: ACCOUNTS.deferred_revenue,
  write_off: ACCOUNTS.bank_charges,
  tax_withholding: ACCOUNTS.wht_receivable,
};

/**
 * A person answered. Keep their words as a trace, record the answer, remember it as a fact scoped to exactly what
 * was said, and resume the case with an entry that cites the answer. Asked once: the next case reads the fact.
 */
export function recordHumanAnswer(
  db: Db, escalationId: string, answerer: string, input: unknown, deps: { clock?: Clock; config?: RuntimeConfig } = {},
): AnswerOutcome {
  return db.transaction(() => recordAnswer(db, escalationId, answerer, input, deps)).immediate();
}

function recordAnswer(
  db: Db, escalationId: string, answerer: string, input: unknown, deps: { clock?: Clock; config?: RuntimeConfig },
): AnswerOutcome {
  const clock = deps.clock ?? systemClock;
  const parsed = HumanAnswer.safeParse(input);
  if (!parsed.success) return { status: "invalid", detail: parsed.error.issues.map((i) => i.message).join("; ") };
  const answer = parsed.data;
  const ctx = loadEscalation(db, escalationId);
  if (!ctx) return { status: "not_found", detail: escalationId };

  const traceId = newId("tr");
  const recorded = answerEscalation(db, clock, escalationId, answerer, { ...answer, trace_id: traceId });
  if (recorded.status !== "answered") return { status: recorded.status, detail: "reason" in recorded ? recorded.reason : escalationId };
  writeAnswerTrace(db, clock, escalationId, answerer, answer.text, ctx.case_file.party_id, traceId);

  const fact = rememberAnswer(db, clock, ctx.case_file, answer, answerer, traceId);
  const proposal = resume(db, ctx.case_file, answer, traceId, fact.status === "active" ? fact.fact_id : null, { clock, config: deps.config ?? APP_CONFIG });
  // "Chase the customer" books nothing: the case stays with a person instead of going back to the agents.
  settleIntent(db, clock, ctx.case_file.intent_id);
  return { status: "answered", trace_id: traceId, fact_id: fact.fact_id, fact_status: fact.status, proposal };
}

function loadEscalation(db: Db, escalationId: string): { case_file: CaseFile } | null {
  const row = db
    .prepare("SELECT i.case_json FROM escalation e JOIN decision d ON d.id = e.decision_id JOIN intent i ON i.id = d.intent_id WHERE e.id = ?")
    .get(escalationId) as { case_json: string | null } | undefined;
  const parsed = row?.case_json ? CaseFile.safeParse(safeJson(row.case_json)) : null;
  return parsed?.success ? { case_file: parsed.data } : null;
}

function writeAnswerTrace(db: Db, clock: Clock, escalationId: string, answerer: string, text: string, partyId: string, id: string): string {
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
  const date = new Date(`${c.entry_date}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const monthEnd = date.toISOString().slice(0, 10);
  const rec = recordFactCandidate(db, clock, {
    party_id: c.party_id, predicate: predicateFor(answer),
    value: valueFor(answer, c),
    kinds: [answer.treatment], uses: answer.uses, valid_from: c.entry_date.slice(0, 8) + "01",
    valid_to: answer.valid_to ?? monthEnd, explained_amount_cents: c.shortfall_cents,
    source_trace_ids: [traceId], stated_by: answerer,
  });
  if (rec.status !== "candidate") return { fact_id: null, status: "none" };
  const approved = approveFact(db, clock, rec.fact_id, answerer);
  return { fact_id: rec.fact_id, status: approved.status === "active" ? "active" : "candidate" };
}

function predicateFor(answer: HumanAnswer): string {
  if (answer.treatment === "tax_withholding") return "withholding_tax_pct";
  return answer.uses === "one_time" ? "one_time_credit" : "concession_pct";
}

/** A rate is remembered as a rate, so it explains next month's different amount; otherwise only this amount is. */
function valueFor(answer: HumanAnswer, c: CaseFile): Record<string, number> {
  if (answer.treatment === "tax_withholding" && answer.pct_withheld !== undefined) return { pct_withheld: answer.pct_withheld };
  if (answer.pct_off !== undefined) return { pct_off: answer.pct_off };
  return { amount_cents: c.shortfall_cents };
}

function resume(
  db: Db, c: CaseFile, answer: HumanAnswer, traceId: string, factId: string | null, deps: { clock: Clock; config: RuntimeConfig },
): ProposeResult | null {
  if (answer.treatment === "chase") return null;
  const docId = c.doc_ids[c.doc_ids.length - 1];
  if (!docId) return null;
  // The answer covers what is still open, which can be less than the case's shortfall: a bank fee and a rate
  // difference on the same receipt are booked from code before anyone is asked about the rest.
  const amount = stillOpenOn(db, docId, c.shortfall_cents);
  const proposal: Proposal = {
    intent_id: c.intent_id, function: c.function, kind: answer.treatment, party_id: c.party_id, entry_date: c.entry_date,
    applications: [{ doc_id: docId, amount_cents: amount }],
    entries: answer.treatment === "dispute_hold" ? [] : [
      { account: ADJUSTMENT_ACCOUNT[answer.treatment], debit_cents: amount, credit_cents: 0, memo: `Per answer to escalation (${traceId})` },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: amount, memo: `Per answer to escalation (${traceId})` },
    ],
    evidence: [{ claim: "the account owner's answer", trace_id: traceId, quote: answer.text }],
    policy_refs: [], fact_refs: factId ? [factId] : [], judgment: [],
  };
  return proposeEntry(db, proposal, { actor: "router:resume", mode: "live", autonomy_level: "review", tier: 0 }, deps);
}

function stillOpenOn(db: Db, docId: string, shortfallCents: number): number {
  const row = db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(docId) as { open_cents: number } | undefined;
  return row && row.open_cents > 0 ? Math.min(shortfallCents, row.open_cents) : shortfallCents;
}
