import { describe, expect, it } from "vitest";
import { approveDecision } from "../../runtime/approve.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { creditMemo, fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import { applicableFacts } from "../applicability.js";
import { answerEscalation, dedupeKey, openEscalation } from "../escalations.js";
import { approveFact, expireFacts, recordFactCandidate } from "../facts.js";

const concession = {
  party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
  valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: ["tr_email_1"], stated_by: "ceo@northwind.test",
};
const query = { party_id: "initech", kind: "credit_memo" as const, entry_date: "2026-08-12", amount_cents: 120000 };

function activeFact(db: ReturnType<typeof seedInitech>, candidate: Record<string, unknown> = concession): string {
  const rec = recordFactCandidate(db, fixedClock, candidate);
  if (rec.status !== "candidate") throw new Error(JSON.stringify(rec));
  approveFact(db, fixedClock, rec.fact_id, "U_CTRL");
  return rec.fact_id;
}

describe("facts: scoped, dated, approved, and refused by name when they do not fit", () => {
  it("a candidate changes nothing until someone in the approval matrix approves it", () => {
    const db = seedInitech();
    const rec = recordFactCandidate(db, fixedClock, concession);
    expect(rec.status).toBe("candidate");
    expect(applicableFacts(db, query).applicable).toHaveLength(0);
    expect(approveFact(db, fixedClock, rec.status === "candidate" ? rec.fact_id : "", "nobody").status).toBe("unauthorised");
    expect(approveFact(db, fixedClock, rec.status === "candidate" ? rec.fact_id : "", "U_CTRL")).toMatchObject({ status: "active", max_amount_cents: 1000000 });
    expect(applicableFacts(db, query).applicable).toHaveLength(1);
  });

  it("rejects an open-ended or unsourced or unpinned candidate", () => {
    const db = seedInitech();
    expect(recordFactCandidate(db, fixedClock, { ...concession, valid_to: undefined }).status).toBe("invalid");
    expect(recordFactCandidate(db, fixedClock, { ...concession, source_trace_ids: ["nope"] }).status).toBe("invalid");
    expect(recordFactCandidate(db, fixedClock, { ...concession, party_id: "ACH INITECH INC" }).status).toBe("invalid");
  });

  it("refuses to generalise, naming the dimension: other customer, after the end date, wrong kind, over the ceiling", () => {
    const db = seedInitech();
    activeFact(db);
    expect(applicableFacts(db, { ...query, party_id: "wayne" }).applicable).toHaveLength(0);
    expect(applicableFacts(db, { ...query, entry_date: "2027-07-12" }).refused[0]?.failed_dimension).toBe("date");
    expect(applicableFacts(db, { ...query, kind: "write_off" }).refused[0]?.failed_dimension).toBe("kind");
    expect(applicableFacts(db, { ...query, amount_cents: 1000001 }).refused[0]?.failed_dimension).toBe("amount_ceiling");
  });

  it("a one-time fact applies once: after a posted decision cites it, it is refused", () => {
    const db = seedInitech();
    const factId = activeFact(db, { ...concession, predicate: "one_time_credit", uses: "one_time", valid_from: "2026-07-01", valid_to: "2026-07-31" });
    const q = { ...query, entry_date: "2026-07-14", predicate: "one_time_credit" };
    expect(applicableFacts(db, q).applicable).toHaveLength(1);
    const parked = proposeEntry(db, { ...creditMemo(), terms_change: undefined, fact_refs: [factId] },
      { actor: "agent:ar", mode: "live", autonomy_level: "auto" }, { clock: fixedClock });
    expect(parked.status).toBe("pending_approval");
    approveDecision(db, parked.status === "pending_approval" ? parked.decision_id : "", { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock });
    expect(applicableFacts(db, q).refused[0]?.failed_dimension).toBe("one_time_used");
  });

  it("a newer fact supersedes the old one, which stays on record; expiry stops a fact applying", () => {
    const db = seedInitech();
    const first = activeFact(db);
    const second = activeFact(db, { ...concession, value: { pct_off: 5 } });
    const rows = db.prepare("SELECT id, status FROM fact ORDER BY rowid").all();
    expect(rows).toEqual([{ id: first, status: "superseded" }, { id: second, status: "active" }]);
    expect(expireFacts(db, "2027-07-01")).toBe(1);
    expect(applicableFacts(db, query).applicable).toHaveLength(0);
  });

  it("in replay, a fact learned after the as-of instant is invisible", () => {
    const db = seedInitech();
    activeFact(db);
    const r = applicableFacts(db, { ...query, as_of: "2026-07-01T00:00:00.000Z" });
    expect(r.applicable).toHaveLength(0);
    expect(r.refused[0]?.failed_dimension).toBe("learned_after_as_of");
  });
});

describe("escalations: asked once", () => {
  function parkedDecision(db: ReturnType<typeof seedInitech>): string {
    const r = proposeEntry(db, creditMemo(), { actor: "agent:ar", mode: "live", autonomy_level: "auto" }, { clock: fixedClock });
    if (r.status !== "pending_approval") throw new Error(r.status);
    return r.decision_id;
  }
  const key = dedupeKey("wayne", "shortfall_reason", "credit_memo");

  it("opens once, attaches a repeat to the open question, and reuses the answer afterwards", () => {
    const db = seedInitech();
    const decisionId = parkedDecision(db);
    const base = { decision_id: decisionId, intent_id: "int_1", asked_user: "U_SAM", dedupe_key: key, question: { unknown: "why $3,300 short" } };
    const first = openEscalation(db, fixedClock, base);
    expect(first.status).toBe("opened");
    expect(openEscalation(db, fixedClock, base).status).toBe("already_open");
    expect((db.prepare("SELECT status FROM intent WHERE id = 'int_1'").get() as { status: string }).status).toBe("waiting_on_human");

    const id = first.escalation_id;
    expect(answerEscalation(db, fixedClock, id, "U_RANDOM", { treatment: "write_off" }).status).toBe("unauthorised");
    expect(answerEscalation(db, fixedClock, id, "U_SAM", { treatment: "credit_memo", uses: "standing", valid_to: "2027-06-30", reason: "failed SSO rollout" }).status).toBe("answered");
    expect(answerEscalation(db, fixedClock, id, "U_SAM", { treatment: "write_off" }).status).toBe("already_answered");

    const again = openEscalation(db, fixedClock, base);
    expect(again).toMatchObject({ status: "already_answered", answer: { treatment: "credit_memo", answered_by: "U_SAM" } });
    expect(db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 1 });
    // A standing answer stops covering cases dated after it lapses: that is a new question, carrying the old answer.
    const lapsed = openEscalation(db, fixedClock, { ...base, entry_date: "2027-08-01" });
    expect(lapsed.status).toBe("opened");
    const topics = (db.prepare("SELECT topic FROM event WHERE topic LIKE 'human.%' ORDER BY id").all() as { topic: string }[]).map((e) => e.topic);
    expect(topics).toEqual(["human.escalation.opened", "human.escalation.answered", "human.escalation.opened"]);
  });

  it("the kernel refuses to post while an escalation on the intent is unanswered (P4)", () => {
    const db = seedInitech();
    const decisionId = parkedDecision(db);
    openEscalation(db, fixedClock, { decision_id: decisionId, intent_id: "int_1", asked_user: "U_SAM", dedupe_key: key, question: {} });
    const r = approveDecision(db, decisionId, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock });
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("P4");
  });
});
