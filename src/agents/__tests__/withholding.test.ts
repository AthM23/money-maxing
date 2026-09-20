import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { Proposal } from "../../contract/types.js";
import { seedDemoWorld, DEMO_CASES } from "../../demo/seed.js";
import { approveDecision } from "../../runtime/approve.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { openDb, type Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { recordHumanAnswer } from "../humanLoop.js";
import type { Investigator } from "../investigator.js";

const QUOTE = "tax has been deducted at source at 10% (USD 1,800.00) and deposited with the Government of India";
const meridian = DEMO_CASES.find((c) => c.intent_id === "int_meridian")!;

function world(): Db {
  const db = openDb();
  seedDemoWorld(db);
  return db;
}

/** The $1,800 Meridian did not remit, settled against INV-1071. Kind and account are the two things under test. */
function settle(kind: Proposal["kind"], account: string): Proposal {
  return {
    intent_id: "int_meridian", function: "ar", kind, party_id: "meridian", entry_date: "2026-07-17",
    applications: [{ doc_id: "INV-1071", amount_cents: 180000 }],
    entries: [
      { account, debit_cents: 180000, credit_cents: 0, memo: "TDS u/s 195 per remittance advice" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 180000, memo: "TDS u/s 195 per remittance advice" },
    ],
    evidence: [{ claim: "customer deducted 10% tax at source and will send Form 16A", trace_id: "tr_mail_7", quote: QUOTE }],
    policy_refs: [], fact_refs: [], judgment: [],
  };
}

const agent = { actor: "agent:ar:sonnet", mode: "live" as const, autonomy_level: "auto" as const, tier: 2 };

describe("tax withheld at source is not a short-pay and not a discount", () => {
  it("settles to the withholding tax receivable, quoting the remittance advice, and waits for a person because it is over $500", () => {
    const db = world();
    const r = proposeEntry(db, settle("tax_withholding", ACCOUNTS.wht_receivable), agent, { clock: fixedClock });
    expect(r).toMatchObject({ status: "pending_approval", route: "PROPOSE" });
  });

  it("the kernel refuses every way of booking it as something else", () => {
    const db = world();
    const wrong: Array<[Proposal["kind"], string]> = [
      ["tax_withholding", ACCOUNTS.deferred_revenue],   // withheld tax hidden in revenue
      ["tax_withholding", ACCOUNTS.bank_charges],       // withheld tax expensed
      ["credit_memo", ACCOUNTS.wht_receivable],         // called a concession, parked in the tax asset
      ["write_off", ACCOUNTS.wht_receivable],
    ];
    for (const [kind, account] of wrong) {
      const r = proposeEntry(db, settle(kind, account), agent, { clock: fixedClock });
      expect(r.status).toBe("rejected");
      expect(r.status === "rejected" && r.failed.map((m) => m.check)).toContain("J4");
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get()).toEqual({ n: 1 });
  });
});

/** Stands in for the model tier: reads the remittance advice, names it for what it is, and asks the owner to confirm the rate stands. */
const asksAboutTheRate: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const hits = call("mail_search", { query: "remittance advice tax deducted at source", party_id: task.case_file.party_id }).output as { trace_id: string }[];
    const owner = call("crm_owner", { party_id: task.case_file.party_id }).output as { owner_user: string };
    call("escalate", {
      asked_user: owner.owner_user, party_id: task.case_file.party_id, predicate: "shortfall_reason", decision_kind: "tax_withholding",
      what_happened: `Meridian remitted ${task.case_file.received_cents} of ${task.case_file.expected_cents} cents and says 10% tax was deducted at source`,
      what_was_checked: [{ source: "mail_search", query: "remittance advice", hits: hits.length }],
      what_is_unknown: "Whether Meridian will withhold 10% on every invoice under this contract, so it can be booked without asking again",
      treatments: [{ id: "tax_withholding", label: "Yes, 10% TDS on every invoice" }, { id: "chase", label: "No, chase the balance" }],
    });
    return { outcome: "escalated", summary: "asked whether the withholding stands", places_looked: ["mail_search"] };
  },
};

describe("asked once: the rate is remembered with its scope, and next month books from code", () => {
  it("July takes a question; August, a different amount at the same rate, takes no model and no question", async () => {
    const db = world();
    await runOpenIntents(db, { investigators: [asksAboutTheRate, asksAboutTheRate], intent_id: "int_meridian", clock: fixedClock });
    const esc = db.prepare("SELECT id FROM escalation").get() as { id: string };
    const answered = recordHumanAnswer(db, esc.id, "U_SAM",
      { treatment: "tax_withholding", text: "Yes. India TDS at 10% under the treaty on every invoice; they send Form 16A quarterly.", uses: "standing", pct_withheld: 10, valid_to: "2027-06-30" },
      { clock: fixedClock });
    expect(answered).toMatchObject({ status: "answered", fact_status: "active" });
    const parked = answered.status === "answered" && answered.proposal?.status === "pending_approval" ? answered.proposal.decision_id : "";
    expect(approveDecision(db, parked, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1071'").get()).toEqual({ open_cents: 0 });
    expect(db.prepare("SELECT status FROM intent WHERE id = 'int_meridian'").get()).toEqual({ status: "resolved" });

    // August: a bigger invoice, the same 10%. A person approved this kind once; here the level is set to auto to show the code path.
    db.exec(`INSERT INTO period (id, status) VALUES ('2026-08','open');
      INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-1171','meridian','2026-08-01','2026-08-31',2400000,2400000,'open');
      UPDATE gl_line SET debit_cents = debit_cents + 2400000 WHERE entry_id = 'je_open' AND line_no = 1;
      UPDATE gl_line SET credit_cents = credit_cents + 2400000 WHERE entry_id = 'je_open' AND line_no = 2;
      INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-8A','2026-08-18',2160000,'WIRE IN /ORG/MERIDIAN INFOTECH PVT LTD /OBI/INV-1171 NET OF TDS','wire','meridian');`);
    const august = { ...meridian, intent_id: "int_meridian_aug", entry_date: "2026-08-18", bank_txn_id: "BTX-8A", doc_ids: ["INV-1171"],
      expected_cents: 2400000, received_cents: 2160000, shortfall_cents: 240000, trace_ids: [] };
    db.prepare("INSERT INTO intent (id, function, question, owner, status, case_json, created_at) VALUES (?, 'ar', 'Meridian short again', 'ar', 'open', ?, '2026-08-18T09:00:00Z')")
      .run(august.intent_id, JSON.stringify(august));
    const report = await runOpenIntents(db, { investigators: [asksAboutTheRate], intent_id: august.intent_id, clock: { now: () => "2026-08-18T16:00:00.000Z" } });
    expect(report.worked).toMatchObject([{ tier_used: 0, routes: ["AUTO", "PROPOSE"] }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 1 });
    const booked = db.prepare("SELECT proposal_json FROM decision WHERE intent_id = ? AND kind = 'tax_withholding'").get(august.intent_id) as { proposal_json: string };
    const p = JSON.parse(booked.proposal_json) as Proposal;
    expect(p.entries[0]).toMatchObject({ account: ACCOUNTS.wht_receivable, debit_cents: 240000 });
    expect(p.fact_refs).toHaveLength(1);
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });
});
