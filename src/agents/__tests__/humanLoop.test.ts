import { describe, expect, it } from "vitest";
import { approveDecision } from "../../runtime/approve.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import type { Db } from "../../runtime/db.js";
import { recordHumanAnswer } from "../humanLoop.js";
import type { Investigator } from "../investigator.js";
import { runCase } from "../runCase.js";

const opts = { mode: "live" as const, autonomy_level: "auto" as const, clock: fixedClock };
const wayne = {
  intent_id: "int_9", function: "ar", party_id: "wayne", entry_date: "2026-07-16", bank_txn_id: "BTX-9",
  doc_ids: ["INV-1050"], expected_cents: 3300000, received_cents: 2970000, shortfall_cents: 330000, method: "ach", trace_ids: [],
};

const asksTheOwner: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const hits = call("mail_search", { query: "Wayne credit", party_id: "wayne" }).output as unknown[];
    call("escalate", {
      asked_user: "U_SAM", party_id: "wayne", predicate: "shortfall_reason", decision_kind: "credit_memo",
      what_happened: `Short by ${task.case_file.shortfall_cents} cents`, what_was_checked: [{ source: "mail", query: "Wayne credit", hits: hits.length }],
      what_is_unknown: "Whether a credit was agreed", treatments: [{ id: "credit_memo", label: "Agreed credit" }, { id: "chase", label: "Chase it" }],
    });
    return { outcome: "escalated", summary: "asked the owner", places_looked: ["mail"] };
  },
};

function seedWayne(db: Db): void {
  db.exec(`INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-9','2026-07-16',2970000,'ACH WAYNE ENT','ach','wayne');
           INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_9','ar','Resolve the $3,300 Wayne shortfall','ar','open','2026-07-16T09:00:00Z');
           INSERT INTO approver (id, name, role, slack_user, limit_cents) VALUES ('U_SAM','Sam','account_owner','U_SAM',500000);`);
}

describe("asked once: the answer becomes evidence, a scoped fact, and the entry", () => {
  it("Wayne: escalate, the owner answers, a one-time fact is stored, the credit memo parks, the controller approves, books tie", async () => {
    const db = seedInitech();
    seedWayne(db);
    const first = await runCase(db, wayne, { ...opts, investigators: [asksTheOwner] });
    expect(first.final_route).toBe("ESCALATE");
    const esc = db.prepare("SELECT id FROM escalation").get() as { id: string };

    const text = "One-time credit of $3,300 for the failed SSO rollout in June. I approved it with their CIO.";
    const out = recordHumanAnswer(db, esc.id, "U_SAM", { treatment: "credit_memo", text, uses: "one_time" }, { clock: fixedClock });
    expect(out).toMatchObject({ status: "answered", fact_status: "active", proposal: { status: "pending_approval", route: "PROPOSE" } });
    expect(db.prepare("SELECT predicate, uses, status, max_amount_cents, stated_by FROM fact").get())
      .toEqual({ predicate: "one_time_credit", uses: "one_time", status: "active", max_amount_cents: 500000, stated_by: "U_SAM" });

    const decisionId = out.status === "answered" && out.proposal?.status === "pending_approval" ? out.proposal.decision_id : "";
    expect(approveDecision(db, decisionId, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1050'").get()).toEqual({ open_cents: 0, status: "paid" });
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("the one-time credit is not reused next month: the fact is refused by name, and the new question carries the old answer", async () => {
    const db = seedInitech();
    seedWayne(db);
    await runCase(db, wayne, { ...opts, investigators: [asksTheOwner] });
    const esc = db.prepare("SELECT id FROM escalation").get() as { id: string };
    const out = recordHumanAnswer(db, esc.id, "U_SAM", { treatment: "credit_memo", text: "One-time credit for the SSO outage.", uses: "one_time" }, { clock: fixedClock });
    const decisionId = out.status === "answered" && out.proposal?.status === "pending_approval" ? out.proposal.decision_id : "";
    approveDecision(db, decisionId, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock });

    db.exec(`INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-1090','wayne','2026-08-01','2026-08-31',3300000,3300000,'open');
             INSERT INTO period (id, status) VALUES ('2026-08','open');
             INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_10','ar','Wayne short again','ar','open','2026-08-16T09:00:00Z');
             UPDATE gl_line SET debit_cents = debit_cents + 3300000 WHERE entry_id = 'je_open' AND line_no = 1;
             UPDATE gl_line SET credit_cents = credit_cents + 3300000 WHERE entry_id = 'je_open' AND line_no = 2;`);
    const august = { ...wayne, intent_id: "int_10", entry_date: "2026-08-16", bank_txn_id: undefined, doc_ids: ["INV-1090"], received_cents: 0 };
    const again = await runCase(db, august, { ...opts, investigators: [asksTheOwner] });
    expect(again.notes.join(" ")).toMatch(/not used: (date|one_time_used)/);
    expect(again.final_route).toBe("ESCALATE");
    const questions = db.prepare("SELECT question_json FROM escalation ORDER BY asked_at, rowid").all() as { question_json: string }[];
    expect(questions).toHaveLength(2);
    expect(questions[1]!.question_json).toContain("prior_answer");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1090'").get()).toEqual({ open_cents: 3300000 });
  });

  it("an answer from someone who was not asked and has no authority is refused, and nothing is remembered", async () => {
    const db = seedInitech();
    seedWayne(db);
    await runCase(db, wayne, { ...opts, investigators: [asksTheOwner] });
    const esc = db.prepare("SELECT id FROM escalation").get() as { id: string };
    const out = recordHumanAnswer(db, esc.id, "U_RANDOM", { treatment: "write_off", text: "just write it off" }, { clock: fixedClock });
    expect(out.status).toBe("unauthorised");
    expect(db.prepare("SELECT COUNT(*) AS n FROM fact").get()).toEqual({ n: 0 });
  });
});
