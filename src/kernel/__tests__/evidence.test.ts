import { describe, expect, it } from "vitest";
import type { Proposal } from "../../contract/types.js";
import { runKernel } from "../index.js";
import {
  AR,
  BAD_DEBT,
  CASH,
  CEO_EMAIL_QUOTE,
  CEO_EMAIL_TEXT,
  DEFERRED,
  bankTxn,
  fact,
  invoice,
  line,
  makeCtx,
  makeProposal,
  markOf,
  statusOf,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const OTHER = "cust:globex";

/** The demo entry: a credit memo for the shortfall, resting on one CEO email. */
function creditMemo(over: Partial<Proposal> = {}): Proposal {
  return makeProposal({
    intent_id: "int-cm-1",
    kind: "credit_memo",
    applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
    entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    evidence: [{ claim: "the CEO approved a credit memo", trace_id: "trace:ceo-email", quote: CEO_EMAIL_QUOTE }],
    ...over,
  });
}

const demoWorld = {
  docs: [invoice("INV-9001", INITECH, 120_000)],
  traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT)],
};

describe("E1 traces resolve", () => {
  it("passes when every cited trace resolves", () => {
    expect(statusOf(runKernel(creditMemo(), makeCtx(demoWorld), "proposal"), "E1")).toBe("pass");
  });

  it("is n/a when the proposal cites no evidence", () => {
    const result = runKernel(makeProposal(), makeCtx(demoWorld), "proposal");
    expect(markOf(result, "E1").detail).toMatch(/^n\/a:/);
  });

  it("fails when a cited trace does not resolve", () => {
    const proposal = creditMemo({
      evidence: [{ claim: "invented", trace_id: "trace:ghost", quote: "anything" }],
    });
    const mark = markOf(runKernel(proposal, makeCtx(demoWorld), "proposal"), "E1");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("trace trace:ghost does not resolve");
  });

  it("fails in replay when the trace was recorded after as_of", () => {
    const ctx = makeCtx(
      { ...demoWorld, traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT, { recorded_time: "2026-09-16T09:00:00Z" })] },
      { mode: "replay", as_of: "2026-09-15T00:00:00Z" },
    );
    const mark = markOf(runKernel(creditMemo(), ctx, "proposal"), "E1");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("recorded 2026-09-16T09:00:00Z is after as_of 2026-09-15T00:00:00Z");
  });

  it("passes the same trace in live mode, where as_of does not apply", () => {
    const ctx = makeCtx({
      ...demoWorld,
      traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT, { recorded_time: "2026-09-16T09:00:00Z" })],
    });
    expect(statusOf(runKernel(creditMemo(), ctx, "proposal"), "E1")).toBe("pass");
  });
});

describe("E2 quotes agree to source", () => {
  it("passes a quote that spans a line break in the source", () => {
    expect(CEO_EMAIL_TEXT).not.toContain(CEO_EMAIL_QUOTE); // only matches once whitespace is normalised
    expect(statusOf(runKernel(creditMemo(), makeCtx(demoWorld), "proposal"), "E2")).toBe("pass");
  });

  it("is n/a when no evidence carries a quote", () => {
    const proposal = creditMemo({ evidence: [{ claim: "no quote", trace_id: "trace:ceo-email" }] });
    expect(markOf(runKernel(proposal, makeCtx(demoWorld), "proposal"), "E2").detail).toMatch(/^n\/a:/);
  });

  it("is case sensitive", () => {
    const proposal = creditMemo({
      evidence: [{ claim: "shouted", trace_id: "trace:ceo-email", quote: CEO_EMAIL_QUOTE.toUpperCase() }],
    });
    expect(statusOf(runKernel(proposal, makeCtx(demoWorld), "proposal"), "E2")).toBe("fail");
  });

  it("a quoted number has to stand in the source as a number of its own: 40.00 is not stated by 105,840.00", () => {
    const advice = (text: string) => makeCtx({ ...demoWorld, traces: [...demoWorld.traces, trace("trace:advice", text)] });
    const citing = (quote: string) => creditMemo({ evidence: [...creditMemo().evidence, { claim: "the bank's fee", trace_id: "trace:advice", quote }] });
    const feeSentenceDeleted = "Amount received EUR 98,000.00. USD equivalent 105,840.00. Net credit USD 105,800.00.";
    const mark = markOf(runKernel(citing("40.00"), advice(feeSentenceDeleted), "proposal"), "E2");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("only inside a longer number");
    const withFee = `Bank charges deducted USD 40.00. ${feeSentenceDeleted}`;
    expect(statusOf(runKernel(citing("40.00"), advice(withFee), "proposal"), "E2")).toBe("pass");
    expect(statusOf(runKernel(citing("Bank charges deducted USD 40.00"), advice(withFee), "proposal"), "E2")).toBe("pass");
    expect(statusOf(runKernel(citing("98,000"), advice(withFee), "proposal"), "E2")).toBe("fail"); // 98,000 is not 98,000.00
  });

  it("fails a quote that is not in the payload at all", () => {
    const proposal = creditMemo({
      evidence: [{ claim: "invented", trace_id: "trace:ceo-email", quote: "Approved: write the whole thing off" }],
    });
    const mark = markOf(runKernel(proposal, makeCtx(demoWorld), "proposal"), "E2");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("is not in trace trace:ceo-email");
  });
});

describe("the demo mutation", () => {
  it("accepts the credit memo, then rejects it on E2 when one character of the source moves", () => {
    const accepted = runKernel(creditMemo(), makeCtx(demoWorld), "proposal");
    expect(accepted.verdict).toBe("accept");
    expect(statusOf(accepted, "E2")).toBe("pass");

    const mutated = CEO_EMAIL_TEXT.replace("credit", "crebit");
    expect(mutated).not.toBe(CEO_EMAIL_TEXT);
    const ctx = makeCtx({ ...demoWorld, traces: [trace("trace:ceo-email", mutated)] });
    const rejected = runKernel(creditMemo(), ctx, "proposal");

    expect(rejected.verdict).toBe("reject");
    expect(rejected.failed.map((m) => m.check)).toEqual(["E2"]);
  });

  it("rejects on E2 when one character of the quote moves instead", () => {
    const proposal = creditMemo({
      evidence: [
        { claim: "the CEO approved", trace_id: "trace:ceo-email", quote: CEO_EMAIL_QUOTE.replace("memo", "memos") },
      ],
    });
    const result = runKernel(proposal, makeCtx(demoWorld), "proposal");
    expect(result.verdict).toBe("reject");
    expect(result.failed.map((m) => m.check)).toEqual(["E2"]);
  });
});

describe("E3 ties to the party", () => {
  it("passes when the document belongs to the party on the proposal", () => {
    expect(statusOf(runKernel(creditMemo(), makeCtx(demoWorld), "proposal"), "E3")).toBe("pass");
  });

  it("fails when the document belongs to another party", () => {
    const ctx = makeCtx({ ...demoWorld, docs: [invoice("INV-9001", OTHER, 120_000)] });
    const mark = markOf(runKernel(creditMemo(), ctx, "proposal"), "E3");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain(`document INV-9001 party ${OTHER} != proposal party ${INITECH}`);
  });

  it("lets a named payer's bank line through when an active parent_pays fact names that payer", () => {
    const proposal = makeProposal({
      kind: "apply_payment", bank_txn_id: "BT-1", fact_refs: ["fact:parent"],
      applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
      entries: [line(CASH, 120_000, 0), line(AR, 0, 120_000)],
    });
    const ctx = makeCtx({
      ...demoWorld,
      bankTxns: [bankTxn("BT-1", 120_000, { party_id: OTHER })],
      facts: [fact("fact:parent", { predicate: "parent_pays", party_id: INITECH, value: { payer_party_id: OTHER } })],
    });
    expect(statusOf(runKernel(proposal, ctx, "proposal"), "E3")).toBe("pass");
  });

  it("an alias fact never covers a document that belongs to someone else (reviewer finding 3)", () => {
    const ctx = makeCtx({
      ...demoWorld,
      docs: [invoice("INV-9001", OTHER, 120_000)],
      facts: [fact("fact:parent", { predicate: "parent_pays", party_id: INITECH, value: { payer_party_id: OTHER } })],
    });
    const result = runKernel(creditMemo({ fact_refs: ["fact:parent"] }), ctx, "proposal");
    expect(statusOf(result, "E3")).toBe("fail");
    expect(markOf(result, "E3").detail).toContain(`document INV-9001 party ${OTHER}`);
  });

  it("an alias fact that names a different payer does not cover this bank line", () => {
    const proposal = makeProposal({
      kind: "apply_payment", bank_txn_id: "BT-1", fact_refs: ["fact:parent"],
      applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
      entries: [line(CASH, 120_000, 0), line(AR, 0, 120_000)],
    });
    const ctx = makeCtx({
      ...demoWorld,
      bankTxns: [bankTxn("BT-1", 120_000, { party_id: OTHER })],
      facts: [fact("fact:parent", { predicate: "parent_pays", party_id: INITECH, value: { payer_party_id: "someone-else" } })],
    });
    expect(statusOf(runKernel(proposal, ctx, "proposal"), "E3")).toBe("fail");
  });

  it("does not allow the mismatch when the payer_alias fact is not active", () => {
    const ctx = makeCtx({
      ...demoWorld,
      docs: [invoice("INV-9001", OTHER, 120_000)],
      facts: [fact("fact:alias", { predicate: "payer_alias", party_id: INITECH, status: "candidate" })],
    });
    expect(statusOf(runKernel(creditMemo({ fact_refs: ["fact:alias"] }), ctx, "proposal"), "E3")).toBe("fail");
  });

  it("fails when the bank transaction names a different party", () => {
    const proposal = makeProposal({
      kind: "apply_payment",
      bank_txn_id: "BT-1",
      applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
      entries: [line(CASH, 120_000, 0), line(AR, 0, 120_000)],
    });
    const ctx = makeCtx({ ...demoWorld, bankTxns: [bankTxn("BT-1", 120_000, { party_id: OTHER })] });
    expect(markOf(runKernel(proposal, ctx, "proposal"), "E3").detail).toContain(`bank transaction BT-1 party ${OTHER}`);
  });
});

describe("E5 adjustment evidence", () => {
  const writeOff = (over: Partial<Proposal> = {}) =>
    makeProposal({
      kind: "write_off",
      applications: [{ doc_id: "INV-9001", amount_cents: 30_000 }],
      entries: [line(BAD_DEBT, 30_000, 0), line(AR, 0, 30_000)],
      ...over,
    });
  const world = { docs: [invoice("INV-9001", INITECH, 120_000)], traces: [trace("t-1", "uncollectible, per Dana")] };

  it("passes when the non-standard account carries evidence", () => {
    const proposal = writeOff({ evidence: [{ claim: "uncollectible", trace_id: "t-1", quote: "uncollectible" }] });
    const mark = markOf(runKernel(proposal, makeCtx(world), "proposal"), "E5");
    expect(mark.status).toBe("pass");
    expect(mark.refs).toEqual([BAD_DEBT]);
  });

  it("fails when a non-standard account carries no evidence at all", () => {
    const mark = markOf(runKernel(writeOff(), makeCtx(world), "proposal"), "E5");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain(`1 non-standard line(s) on ${BAD_DEBT} with 0 evidence items`);
  });

  it("is n/a when the account is standard for the kind", () => {
    const ctx = makeCtx({ ...world, standard: { write_off: [BAD_DEBT] } });
    expect(markOf(runKernel(writeOff(), ctx, "proposal"), "E5").detail).toMatch(/^n\/a:/);
  });

  it("is n/a when every line sits on a control account", () => {
    const proposal = makeProposal({
      kind: "apply_payment",
      applications: [{ doc_id: "INV-9001", amount_cents: 30_000 }],
      entries: [line(CASH, 30_000, 0), line(AR, 0, 30_000)],
    });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "E5").detail).toMatch(/^n\/a:/);
  });
});
