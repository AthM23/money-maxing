import { describe, expect, it } from "vitest";
import { callTool } from "../../agents/toolset.js";
import type { ToolEnv } from "../../agents/env.js";
import { insertPostedApplication, postApplyPayment, seedAudit } from "../../audit/__tests__/helpers.js";
import { rerunDecision } from "../../audit/rerun.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import { APP_CONFIG } from "../../packs/index.js";
import { approveDecision } from "../approve.js";
import type { Db } from "../db.js";
import { bankTxnAppliedCents } from "../kernelContext.js";
import { openDecision } from "../persist.js";
import { proposeEntry } from "../proposeEntry.js";
import { applyPayment, creditMemo, fixedClock, seedInitech } from "./seed.js";

/** Findings of an outside review on 20 Sep 2026, each reproduced at HEAD before it was closed. */
const deps = { clock: fixedClock, config: APP_CONFIG };
const live = { actor: "agent:ar", mode: "live" as const, autonomy_level: "auto" as const, tier: 0 };
const cashInGl = (db: Db): number => (db.prepare("SELECT COALESCE(SUM(debit_cents - credit_cents), 0) AS n FROM gl_line WHERE account = ?").get(ACCOUNTS.cash) as { n: number }).n;

function toolEnv(db: Db): ToolEnv {
  const decisionId = openDecision(db, fixedClock, { intent_id: "int_1", function: "ar", mode: "live", actor: "agent:ar:haiku", autonomy_level: "auto", tier: 1 });
  return { db, clock: fixedClock, config: APP_CONFIG, mode: "live", actor: "agent:ar:haiku", tier: 1, max_tier: 3, autonomy_level: "auto", intent_id: "int_1", decision_id: decisionId, entry_date: "2026-07-12" };
}

describe("a live entry never takes over a replay decision", () => {
  it("the posting is recorded as live, so the bank line reads as spent and cannot be spent again", () => {
    const db = seedInitech();
    db.exec(`INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-1043','initech','2026-07-01','2026-07-31',1080000,1080000,'open');
             UPDATE gl_line SET debit_cents = debit_cents + 1080000 WHERE entry_id='je_open' AND line_no=1;
             UPDATE gl_line SET credit_cents = credit_cents + 1080000 WHERE entry_id='je_open' AND line_no=2;`);
    const replayDecision = openDecision(db, fixedClock, { intent_id: "int_1", function: "ar", mode: "replay", actor: "agent:ar:x", autonomy_level: "shadow", tier: 1 });
    const first = proposeEntry(db, applyPayment(), { ...live, decision_id: replayDecision }, deps);
    expect(first.status).toBe("posted");
    expect(first.status === "posted" ? first.decision_id : "").not.toBe(replayDecision);
    expect(bankTxnAppliedCents(db, "BTX-1")).toBe(1080000);
    const second = proposeEntry(db, { ...applyPayment(), applications: [{ doc_id: "INV-1043", amount_cents: 1080000 }], entries: applyPayment().entries.map((l) => ({ ...l, memo: "second spend" })) }, live, deps);
    expect(second.status).toBe("rejected");
    expect(cashInGl(db)).toBe(1080000);
  });
});

describe("cash is tied net to the bank line", () => {
  it("a receipt debited in full with a credit to cash beside it is refused, and so is cash from a line already spent", () => {
    const db = seedInitech();
    const split = { ...applyPayment(), evidence: creditMemo().evidence, entries: [...applyPayment().entries,
      { account: ACCOUNTS.customer_credits, debit_cents: 40000, credit_cents: 0, memo: "adjust" }, { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: 40000, memo: "adjust" }] };
    const r = callTool(toolEnv(db), "propose_entry", split).output as { status: string; failed: { check: string; detail: string }[] };
    expect(r.status).toBe("rejected");
    expect(r.failed.find((m) => m.check === "F2")?.detail).toContain("cannot also credit the cash account (40000)");
    expect(cashInGl(db)).toBe(0);

    expect(proposeEntry(db, applyPayment(), { actor: "router:tier0", mode: "live", autonomy_level: "auto", tier: 0 }, deps).status).toBe("posted");
    const phantom = { intent_id: "int_1", function: "ar", kind: "customer_credit", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1", applications: [],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 49900, credit_cents: 0, memo: "unapplied cash" }, { account: ACCOUNTS.customer_credits, debit_cents: 0, credit_cents: 49900, memo: "unapplied cash" }],
      evidence: creditMemo().evidence, policy_refs: [], fact_refs: [], judgment: [] };
    const p = callTool(toolEnv(db), "propose_entry", phantom).output as { status: string; failed: { check: string; detail: string }[] };
    expect(p.status).toBe("rejected");
    expect(p.failed.find((m) => m.check === "F2")?.detail).toContain("more than what is left of bank line BTX-1: 0");
    expect(cashInGl(db)).toBe(1080000);
  });
});

describe("a corrected approval has no corrected entry to post", () => {
  it("it is refused, nothing posts, and the entry can still be approved or declined as it stands", () => {
    const db = seedInitech();
    const r = proposeEntry(db, creditMemo(), { actor: "agent:ar", mode: "live", autonomy_level: "auto", tier: 1 }, deps);
    if (r.status !== "pending_approval") throw new Error(r.status);
    const corrected = approveDecision(db, r.decision_id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "corrected", note: "should be 60000 not 120000" }, deps);
    expect(corrected).toMatchObject({ status: "rejected" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM approval WHERE decision_id = ?").get(r.decision_id) as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT posted_at FROM decision WHERE id = ?").get(r.decision_id) as { posted_at: string | null }).posted_at).toBeNull();
    expect(approveDecision(db, r.decision_id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps).status).toBe("posted");
  });
});

describe("the auditor orders entries posted in the same millisecond", () => {
  it("one invoice paid twice in one instant is still found: 2,160,000 applied against 1,200,000 owed", () => {
    const db = seedAudit();
    const first = postApplyPayment(db);
    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-2','2026-07-14',1080000,'ACH INITECH INC INV 1042','ach','initech')").run();
    const second = insertPostedApplication(db, { id: "dec_second", kind: "apply_payment", party_id: "initech", doc_id: "INV-1042", amount_cents: 1_080_000, posted_at: fixedClock.now(), entry_date: "2026-07-14", bank_txn_id: "BTX-2" });
    db.prepare("UPDATE invoice SET open_cents = ? WHERE id = 'INV-1042'").run(120_000 - 1_080_000);
    const findings = [...rerunDecision(db, first).findings, ...rerunDecision(db, second).findings];
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.detail).join(" ")).toMatch(/exceed|open balance/);
  });
});

describe("a vendor payment cannot call itself accounts receivable", () => {
  it("labelled ar it would skip the three-way match and the vendor checks; the kernel refuses the label, and the bill and the books are untouched", async () => {
    const { apClock, BILL_ID, INTENT_ID, seedAp, VENDOR } = await import("../../agents/ap/__tests__/seed.js");
    const { readControlTotals } = await import("../kernelContext.js");
    const db = seedAp({ receipt_qtys: [] });
    const before = [db.prepare("SELECT status, open_cents FROM bill WHERE id = ?").get(BILL_ID), readControlTotals(db)];
    const r = proposeEntry(db, {
      intent_id: INTENT_ID, function: "ar", kind: "schedule_payment", party_id: VENDOR, entry_date: "2026-07-12", applications: [{ doc_id: BILL_ID, amount_cents: 40000 }],
      entries: [{ account: ACCOUNTS.ap, debit_cents: 40000, credit_cents: 0, memo: "Pay Acme" }, { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: 40000, memo: "Pay Acme" }],
      evidence: [], policy_refs: [], fact_refs: [], judgment: [],
    }, { actor: "agent:ar:x", mode: "live", autonomy_level: "auto", tier: 1 }, { clock: apClock, config: APP_CONFIG });
    expect(r.status).toBe("rejected");
    expect(r.status === "rejected" ? r.failed.find((m) => m.check === "F8")?.detail : "").toContain("kind schedule_payment is an ap entry; it cannot be proposed as ar");
    expect([db.prepare("SELECT status, open_cents FROM bill WHERE id = ?").get(BILL_ID), readControlTotals(db)]).toEqual(before);
  });
});

describe("nothing an agent does in replay reaches a person or memory", () => {
  it("a question raised in replay opens no escalation, leaves the closed intent closed, and the desk has nothing to send", async () => {
    const { runCase } = await import("../../agents/runCase.js");
    const { deskPass } = await import("../../desk/deskPass.js");
    const db = seedInitech();
    db.exec("INSERT INTO intent (id, function, question, owner, status, created_at, closed_at) VALUES ('int_hist','ar','Replay of a May decision','replay','resolved','2026-05-16T00:00:00Z','2026-05-16T00:00:00Z');");
    let answers: unknown[] = [];
    const asks = { name: "scripted", async investigate(_t: unknown, call: (tool: string, input: unknown) => { output: unknown }) {
      for (const tool of ["policy_memo_lookup", "mail_search", "chat_search", "contracts_find_clause"]) call(tool, { query: "Wayne credit discount", party_id: "wayne" });
      call("memory_facts", { party_id: "wayne", kind: "credit_memo", entry_date: "2026-05-16", amount_cents: 330000 });
      answers = [call("escalate", { asked_user: "U_SAM", party_id: "wayne", predicate: "shortfall_reason", decision_kind: "credit_memo", what_happened: "historic short pay",
        what_was_checked: [{ source: "mail_search", query: "Wayne credit", hits: 0 }], what_is_unknown: "whether anyone agreed a credit", treatments: [{ id: "credit_memo", label: "Agreed credit" }, { id: "chase", label: "Chase it" }] }).output,
      call("record_fact_candidate", { party_id: "wayne", predicate: "one_time_credit", value: { cents: 330000 }, kinds: ["credit_memo"], uses: "one_time", valid_from: "2026-05-01", valid_to: "2026-05-31", source_trace_ids: ["tr_email_1"], stated_by: "agent" }).output];
      return { outcome: "escalated" as const, summary: "", places_looked: ["mail"] };
    } };
    const historic = { intent_id: "int_hist", function: "ar", party_id: "wayne", entry_date: "2026-05-16", doc_ids: ["INV-1050"], expected_cents: 3300000, received_cents: 2970000, shortfall_cents: 330000, method: "ach", trace_ids: [],
      docs_snapshot: [{ id: "INV-1050", kind: "invoice" as const, party_id: "wayne", total_cents: 3300000, open_cents: 3300000, date: "2026-05-01" }] };
    await runCase(db, historic, { mode: "replay", as_of: "2026-05-16T12:00:00Z", autonomy_level: "shadow", investigators: [asks as never], clock: fixedClock, config: APP_CONFIG });
    expect(answers).toEqual([expect.objectContaining({ status: "replay_recorded" }), expect.objectContaining({ status: "replay_recorded" })]);
    expect([(db.prepare("SELECT COUNT(*) AS n FROM escalation").get() as { n: number }).n, (db.prepare("SELECT COUNT(*) AS n FROM fact").get() as { n: number }).n]).toEqual([0, 0]);
    expect((db.prepare("SELECT status FROM intent WHERE id = 'int_hist'").get() as { status: string }).status).toBe("resolved");
    const report = await deskPass(db, { postEscalation: async () => "1.0", postApproval: async () => undefined }, fixedClock);
    expect(report.escalations_posted).toEqual([]);
  });
});

describe("a Slack click is signed by the person who was asked", () => {
  it("when one Slack user stands for several people, it is the one the desk asked, and otherwise never the most senior", async () => {
    const { approverFor, askedToApprove } = await import("../../agents/slack/transport.js");
    const db = seedInitech();
    db.exec(`UPDATE approver SET slack_user = 'U_REAL';
             INSERT OR IGNORE INTO approver (id, name, role, slack_user, limit_cents) VALUES ('U_CFO','Alex','cfo','U_REAL',100000000);`);
    const limits = db.prepare("SELECT id, limit_cents FROM approver WHERE slack_user = 'U_REAL' ORDER BY limit_cents, id").all() as { id: string; limit_cents: number }[];
    expect(limits.length).toBeGreaterThan(1);
    expect(approverFor(db, "U_REAL")).toBe(limits[0]!.id);
    expect(approverFor(db, "U_REAL", "U_CFO")).toBe("U_CFO");
    expect(approverFor(db, "U_REAL", "U_NOT_THEM")).toBe(limits[0]!.id);
    expect(approverFor(db, "U_STRANGER")).toBe("U_STRANGER");
    const r = proposeEntry(db, creditMemo(), { actor: "agent:ar", mode: "live", autonomy_level: "auto", tier: 1 }, deps);
    if (r.status !== "pending_approval") throw new Error(r.status);
    db.prepare("INSERT INTO decision_step (decision_id, step_no, ts, kind, tool, output_json) VALUES (?, 99, ?, 'human_request', 'desk:approval_request', ?)").run(r.decision_id, fixedClock.now(), JSON.stringify({ approver_id: "U_CTRL", slack_ts: "1.0" }));
    expect(approverFor(db, "U_REAL", askedToApprove(db, r.decision_id))).toBe("U_CTRL");
  });
});
