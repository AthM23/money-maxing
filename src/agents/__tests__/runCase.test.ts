import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import { approveDecision } from "../../runtime/approve.js";
import { CEO_EMAIL, fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import type { Investigator } from "../investigator.js";
import { runCase } from "../runCase.js";

const initechCase = {
  intent_id: "int_1", function: "ar", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1",
  doc_ids: ["INV-1042"], expected_cents: 1200000, received_cents: 1080000, shortfall_cents: 120000, method: "ach", trace_ids: [],
};
const QUOTE = "Initech gets 10% off the platform fee through renewal on 2027-06-30";

/** A stand-in for the model: it searches, reads, quotes, proposes and records a fact, only through the tools. */
const findsTheEmail: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const hits = call("mail_search", { query: "Initech off renewal", party_id: task.case_file.party_id }).output as { trace_id: string }[];
    const doc = call("read_trace", { trace_id: hits[0]!.trace_id }).output as { text: string };
    if (!doc.text.includes(QUOTE)) throw new Error("fixture changed");
    call("propose_entry", {
      intent_id: task.case_file.intent_id, function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
      applications: [{ doc_id: "INV-1042", amount_cents: 120000 }],
      entries: [
        { account: ACCOUNTS.deferred_revenue, debit_cents: 120000, credit_cents: 0, memo: "Concession per CEO email" },
        { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "Concession per CEO email" },
      ],
      terms_change: { pct_off: 10, until: "2027-06-30" },
      evidence: [{ claim: "CEO granted 10% off through renewal", trace_id: hits[0]!.trace_id, quote: QUOTE }],
      policy_refs: [], fact_refs: [], judgment: [],
    });
    call("record_fact_candidate", {
      party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
      valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: [hits[0]!.trace_id], stated_by: "ceo@northwind.test",
    });
    return { outcome: "proposed", summary: "CEO email explains the shortfall", places_looked: ["mail"] };
  },
};

const findsNothing: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const looked = ["mail_search", "chat_search", "contracts_find_clause", "crm_notes"].map((tool) => {
      const hits = call(tool, { query: "Wayne credit discount", party_id: task.case_file.party_id }).output as unknown[];
      return { source: tool, query: "Wayne credit discount", hits: hits.length };
    });
    const owner = call("crm_owner", { party_id: task.case_file.party_id }).output as { owner_user: string };
    call("escalate", {
      asked_user: owner.owner_user, party_id: task.case_file.party_id, predicate: "shortfall_reason", decision_kind: "credit_memo",
      what_happened: `Paid ${task.case_file.received_cents} of ${task.case_file.expected_cents} cents`, what_was_checked: looked,
      what_is_unknown: "Whether anyone agreed a credit with Wayne",
      treatments: [{ id: "credit_memo", label: "Agreed credit" }, { id: "dispute_hold", label: "Dispute" }, { id: "chase", label: "Error, chase it" }],
    });
    return { outcome: "escalated", summary: "Nothing explains it; asked the owner", places_looked: looked.map((l) => l.source) };
  },
};

const opts = { mode: "live" as const, autonomy_level: "auto" as const, clock: fixedClock };

describe("runCase: code first, then an investigator, and the route comes from what happened", () => {
  it("Initech: cash applies AUTO, the agent finds the CEO email, the credit memo parks as PROPOSE, a human approves, books tie", async () => {
    const db = seedInitech();
    const r = await runCase(db, initechCase, { ...opts, investigators: [findsTheEmail] });
    expect(r).toMatchObject({ routes: ["AUTO", "PROPOSE"], final_route: "PROPOSE", tier_used: 1 });
    expect(approveDecision(db, r.decision_id!, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 0, status: "paid" });
    expect(db.prepare("SELECT status, predicate FROM fact").get()).toEqual({ status: "candidate", predicate: "concession_pct" });
    const steps = db.prepare("SELECT tool FROM decision_step WHERE decision_id = ? AND kind = 'tool_call' ORDER BY step_no").all(r.decision_id) as { tool: string }[];
    expect(steps.map((s) => s.tool)).toEqual(["mail_search", "read_trace", "propose_entry", "record_fact_candidate"]);
    expect(CEO_EMAIL).toContain(QUOTE);
  });

  it("Wayne: nothing explains it, so the owner is asked once and the route is ESCALATE; nothing is written off", async () => {
    const db = seedInitech();
    db.exec(`INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-9','2026-07-16',2970000,'ACH WAYNE ENT','ach','wayne');
             INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_9','ar','Resolve the $3,300 Wayne shortfall','ar','open','2026-07-16T09:00:00Z');`);
    const wayne = { ...initechCase, intent_id: "int_9", party_id: "wayne", bank_txn_id: "BTX-9", doc_ids: ["INV-1050"], expected_cents: 3300000, received_cents: 2970000, shortfall_cents: 330000, entry_date: "2026-07-16" };
    const r = await runCase(db, wayne, { ...opts, investigators: [findsNothing] });
    expect(r).toMatchObject({ routes: ["AUTO", "ESCALATE"], final_route: "ESCALATE" });
    expect(db.prepare("SELECT asked_user FROM escalation").get()).toEqual({ asked_user: "U_SAM" });
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1050'").get()).toEqual({ open_cents: 330000 });

    const again = await runCase(db, { ...wayne, received_cents: 0, shortfall_cents: 330000, bank_txn_id: undefined }, { ...opts, investigators: [findsNothing] });
    expect(again.final_route).toBe("ESCALATE");
    expect(db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 1 });
  });

  it("a tool error comes back to the agent as data and the run still settles", async () => {
    const db = seedInitech();
    const clumsy: Investigator = {
      name: "scripted",
      async investigate(_task, call) {
        expect(call("no_such_tool", {}).ok).toBe(false);
        expect(call("mail_search", { query: "" }).ok).toBe(false);
        return { outcome: "refused", summary: "could not form a question", places_looked: ["mail_search"] };
      },
    };
    const r = await runCase(db, initechCase, { ...opts, investigators: [clumsy] });
    expect(r.final_route).toBe("REFUSE");
  });
});
