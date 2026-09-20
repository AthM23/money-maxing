import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../contract/accounts.js";
import type { ToolEnv } from "../../agents/env.js";
import { callTool } from "../../agents/toolset.js";
import { approveFact, recordFactCandidate } from "../../memory/facts.js";
import { approveDecision } from "../approve.js";
import { DEFAULT_CONFIG } from "../config.js";
import { getFact } from "../lookups.js";
import { openDecision } from "../persist.js";
import { proposeEntry } from "../proposeEntry.js";
import { applyPayment, creditMemo, fixedClock, seedInitech } from "./seed.js";

const deps = { clock: fixedClock };
const agent = { actor: "agent:ar", mode: "live" as const, autonomy_level: "auto" as const };
const human = { approver_id: "U_CTRL", approver_kind: "human" as const, outcome: "approved" as const };
const glEntries = (db: ReturnType<typeof seedInitech>): number => (db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n;

/** One regression test per finding of the independent review on 19 Sep. Each of these posted wrongly before the fix. */
describe("review findings: no path to the ledger around the kernel", () => {
  it("1 · a write-off booked against cash cannot read as a zero adjustment and post AUTO", () => {
    const db = seedInitech();
    const gamed = {
      ...creditMemo(), kind: "write_off" as const, terms_change: undefined, evidence: [],
      applications: [{ doc_id: "INV-1042", amount_cents: 500000 }],
      entries: [
        { account: ACCOUNTS.cash, debit_cents: 500000, credit_cents: 0, memo: "x" },
        { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 500000, memo: "x" },
      ],
    };
    const r = proposeEntry(db, gamed, agent, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("F8");
    expect(glEntries(db)).toBe(1);
  });

  it("1b · cash cannot be applied without a bank line, and a bank line cannot be spent twice", () => {
    const db = seedInitech();
    expect(proposeEntry(db, { ...applyPayment(), bank_txn_id: undefined }, agent, deps).status).toBe("rejected");
    expect(proposeEntry(db, applyPayment(), agent, deps).status).toBe("posted");
    db.exec("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_b','ar','again','ar','open','2026-07-13T00:00:00Z')");
    const again = proposeEntry(db, { ...applyPayment(), intent_id: "int_b", applications: [{ doc_id: "INV-1042", amount_cents: 120000 }],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "x" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "x" },
        { account: ACCOUNTS.customer_credits, debit_cents: 0, credit_cents: 960000, memo: "x" }] }, agent, deps);
    expect(again.status).toBe("rejected");
    expect(glEntries(db)).toBe(2);
  });

  it("2 · the same credit memo proposed twice is one parked decision, and it posts once", () => {
    const db = seedInitech();
    const a = proposeEntry(db, creditMemo(), agent, deps);
    const b = proposeEntry(db, creditMemo(), agent, deps);
    expect(a.status).toBe("pending_approval");
    expect(b).toMatchObject({ status: "pending_approval", decision_id: a.status === "pending_approval" ? a.decision_id : "" });
    const id = a.status === "pending_approval" ? a.decision_id : "";
    expect(approveDecision(db, id, human, deps).status).toBe("posted");
    expect(approveDecision(db, id, human, deps).status).toBe("not_pending");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 1080000 });
  });

  it("3 · an alias fact for Initech does not let Initech's cash pay Wayne's invoice", () => {
    const db = seedInitech();
    const rec = recordFactCandidate(db, fixedClock, {
      party_id: "initech", predicate: "payer_alias", value: { payer_party_id: "initech_holdings" }, kinds: ["apply_payment"], uses: "standing",
      valid_from: "2026-01-01", valid_to: "2026-12-31", source_trace_ids: ["tr_email_1"], stated_by: "U_DANA",
    });
    approveFact(db, fixedClock, rec.status === "candidate" ? rec.fact_id : "", "U_CTRL");
    const wrong = { ...applyPayment(), fact_refs: [rec.status === "candidate" ? rec.fact_id : ""], applications: [{ doc_id: "INV-1050", amount_cents: 1080000 }] };
    const r = proposeEntry(db, wrong, agent, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("E3");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1050'").get()).toEqual({ open_cents: 3300000 });
  });

  it("3b · a payer fact is capped on the cash it lets through: a $100 approver's word does not apply a $10,800 receipt", () => {
    const db = seedInitech();
    db.exec(`INSERT INTO party (id, kind, name, owner_user) VALUES ('initech_holdings','customer','Initech Holdings BV','U_DANA');
             UPDATE bank_txn SET party_id = 'initech_holdings' WHERE id = 'BTX-1';`);
    const rec = recordFactCandidate(db, fixedClock, {
      party_id: "initech", predicate: "payer_alias", value: { payer_party_id: "initech_holdings" }, kinds: ["apply_payment"], uses: "standing",
      valid_from: "2026-01-01", valid_to: "2026-12-31", source_trace_ids: ["tr_email_1"], stated_by: "U_DANA",
    });
    const factId = rec.status === "candidate" ? rec.fact_id : "";
    expect(approveFact(db, fixedClock, factId, "U_AP")).toMatchObject({ status: "active", max_amount_cents: 10000 });
    const r = proposeEntry(db, { ...applyPayment(), fact_refs: [factId] }, { ...agent, tier: 0 }, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => `${m.check}: ${m.detail}`).join(" ")).toContain("caps at 10000, the cash applied is 1080000");
    expect(db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ open_cents: 1200000 });
  });

  it("4 · re-proposing a human-approved entry reports PROPOSE, not AUTO", () => {
    const db = seedInitech();
    const parked = proposeEntry(db, creditMemo(), agent, deps);
    approveDecision(db, parked.status === "pending_approval" ? parked.decision_id : "", human, deps);
    expect(proposeEntry(db, creditMemo(), agent, deps)).toMatchObject({ status: "posted", route: "PROPOSE" });
  });

  it("5 · a dispute hold, which writes no ledger entry, still takes effect once and uses a one-time fact once", () => {
    const db = seedInitech();
    const hold = { ...creditMemo(), kind: "dispute_hold" as const, entries: [], terms_change: undefined };
    const parked = proposeEntry(db, hold, { ...agent, autonomy_level: "review" }, deps);
    const id = parked.status === "pending_approval" ? parked.decision_id : "";
    expect(approveDecision(db, id, human, deps).status).toBe("posted");
    expect(approveDecision(db, id, human, deps).status).toBe("not_pending");
    expect(db.prepare("SELECT COUNT(*) AS n FROM event WHERE topic = 'ar.dispute.opened'").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM approval").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT posted_at IS NOT NULL AS done FROM decision WHERE id = ?").get(id)).toEqual({ done: 1 });
  });

  it("6 · in replay, ledger and bank tools cannot see past the as-of date", () => {
    const db = seedInitech();
    db.exec("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-FUTURE','2026-07-25',5000,'later','ach','initech')");
    const decisionId = openDecision(db, fixedClock, { intent_id: "int_1", function: "ar", mode: "replay", actor: "agent:ar", autonomy_level: "shadow" });
    const env: ToolEnv = {
      db, clock: fixedClock, config: DEFAULT_CONFIG, mode: "replay", as_of: "2026-07-13T00:00:00Z", actor: "agent:ar", tier: 1,
      autonomy_level: "shadow", intent_id: "int_1", decision_id: decisionId,
      replay_docs: [{ id: "INV-1042", kind: "invoice", party_id: "initech", total_cents: 1200000, open_cents: 1200000, date: "2026-07-01" }],
    };
    expect(callTool(env, "bank_get_transaction", { bank_txn_id: "BTX-FUTURE" }).output).toMatchObject({ error: expect.stringContaining("not yet posted") });
    expect(callTool(env, "bank_get_transaction", { bank_txn_id: "BTX-1" }).output).toMatchObject({ id: "BTX-1" });
    db.prepare("UPDATE invoice SET open_cents = 0, status = 'paid' WHERE id = 'INV-1042'").run();
    expect(callTool(env, "ledger_open_invoices", { party_id: "initech" }).output).toEqual([expect.objectContaining({ id: "INV-1042", open_cents: 1200000 })]);
  });

  it("7 · two applications to one document are added up, so the kernel rejects instead of the post throwing", () => {
    const db = seedInitech();
    const split = { ...applyPayment(), applications: [{ doc_id: "INV-1042", amount_cents: 700000 }, { doc_id: "INV-1042", amount_cents: 700000 }],
      entries: [{ account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "x" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1400000, memo: "x" }] };
    const r = proposeEntry(db, split, agent, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("F2");
  });

  it("9 · a fact whose scope cannot be read covers no kind at all", () => {
    const db = seedInitech();
    const rec = recordFactCandidate(db, fixedClock, {
      party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
      valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: ["tr_email_1"], stated_by: "ceo",
    });
    const id = rec.status === "candidate" ? rec.fact_id : "";
    db.prepare("UPDATE fact SET scope_json = '{not json' WHERE id = ?").run(id);
    expect(getFact(db, id)?.kinds).toEqual([]);
  });
});

describe("found by the controller agent on the first real model run", () => {
  it("a concession booked as a write-off straight to revenue is rejected on J4; the same amount as a credit memo to deferred revenue parks", () => {
    const db = seedInitech();
    const wrong = { ...creditMemo(), kind: "write_off" as const, terms_change: undefined,
      entries: [{ account: ACCOUNTS.subscription_revenue, debit_cents: 120000, credit_cents: 0, memo: "x" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 120000, memo: "x" }] };
    const r = proposeEntry(db, wrong, agent, deps);
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.failed.map((m) => m.check)).toContain("J4");
    expect(proposeEntry(db, creditMemo(), agent, deps).status).toBe("pending_approval");
  });
});

describe("review follow-ups (plausible findings, second pass)", () => {
  it("evidence has to be on point: an unquoted trace, or a quote from another customer's mail, does not carry a judgment amount", () => {
    const db = seedInitech();
    const unquoted = { ...creditMemo(), evidence: [{ claim: "see email", trace_id: "tr_email_1" }] };
    const r1 = proposeEntry(db, unquoted, agent, deps);
    expect(r1.status).toBe("rejected");
    if (r1.status === "rejected") expect(r1.failed.map((m) => m.check)).toContain("E5");

    db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES ('tr_other','gmail','email','m2','2026-06-01T00:00:00Z','2026-06-01T00:00:00Z','2026-09-19T00:00:00Z','wayne','h','{\"body\":\"Wayne gets 10% off\"}')").run();
    const offPoint = { ...creditMemo(), evidence: [{ claim: "discount", trace_id: "tr_other", quote: "Wayne gets 10% off" }] };
    const r2 = proposeEntry(db, offPoint, agent, deps);
    expect(r2.status).toBe("rejected");
    if (r2.status === "rejected") expect(r2.failed.map((m) => m.check)).toContain("E5");
  });

  it("a bank line has to point the right way: money out cannot back a cash application, and a credit memo cites no bank line", () => {
    const db = seedInitech();
    db.exec("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-OUT','2026-07-12',-1080000,'ACH OUT','ach','initech')");
    const r = proposeEntry(db, { ...applyPayment(), bank_txn_id: "BTX-OUT", entries: [
      { account: ACCOUNTS.cash, debit_cents: 1080000, credit_cents: 0, memo: "x" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: 1080000, memo: "x" }] }, agent, deps);
    expect(r.status).toBe("rejected");
    expect(proposeEntry(db, { ...creditMemo(), bank_txn_id: "BTX-1" }, agent, deps).status).toBe("rejected");
  });

  it("a dispute hold reduces nothing, so it needs no approver with authority over the disputed amount", () => {
    const db = seedInitech();
    const hold = { ...creditMemo(), kind: "dispute_hold" as const, entries: [], terms_change: undefined, applications: [{ doc_id: "INV-1042", amount_cents: 1200000 }] };
    const r = proposeEntry(db, hold, agent, deps);
    expect(r.status).toBe("posted");
    expect(db.prepare("SELECT status, open_cents FROM invoice WHERE id = 'INV-1042'").get()).toEqual({ status: "disputed", open_cents: 1200000 });
  });
});
