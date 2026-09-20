import { describe, expect, it } from "vitest";
import type { ApprovalLite, ExtraCheck } from "../types.js";
import type { Mark, Proposal } from "../../contract/types.js";
import { adjustmentCents, runKernel } from "../index.js";
import {
  AR,
  BAD_DEBT,
  CASH,
  CEO_EMAIL_QUOTE,
  CEO_EMAIL_TEXT,
  DEFERRED,
  approver,
  bankTxn,
  invoice,
  line,
  makeCtx,
  makeProposal,
  markOf,
  statusOf,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const CFO = "person:cfo";
const AGENT = "agent:controller";

// Initech owes 1,200,000 on INV-9001 and pays 1,080,000. The 120,000 shortfall is a credit memo
// the CEO agreed to by email. Two proposals: the cash application, then the judgment.
const INVOICE_CENTS = 1_200_000;
const PAID_CENTS = 1_080_000;
const SHORTFALL_CENTS = 120_000;

const paymentWorld = {
  docs: [invoice("INV-9001", INITECH, INVOICE_CENTS)],
  bankTxns: [bankTxn("BT-1", PAID_CENTS, { party_id: INITECH })],
};

const memoWorld = {
  docs: [invoice("INV-9001", INITECH, SHORTFALL_CENTS, { total_cents: INVOICE_CENTS })],
  traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT)],
  approvers: [approver(CFO, 1_000_000)],
};

const proposalA: Proposal = makeProposal({
  intent_id: "int-apply-9001",
  kind: "apply_payment",
  bank_txn_id: "BT-1",
  applications: [{ doc_id: "INV-9001", amount_cents: PAID_CENTS }],
  entries: [line(CASH, PAID_CENTS, 0, "Initech wire"), line(AR, 0, PAID_CENTS, "INV-9001")],
});

const proposalB: Proposal = makeProposal({
  intent_id: "int-memo-9001",
  kind: "credit_memo",
  applications: [{ doc_id: "INV-9001", amount_cents: SHORTFALL_CENTS }],
  entries: [line(DEFERRED, SHORTFALL_CENTS, 0, "onboarding slip"), line(AR, 0, SHORTFALL_CENTS, "INV-9001")],
  evidence: [{ claim: "the CEO agreed to a credit memo", trace_id: "trace:ceo-email", quote: CEO_EMAIL_QUOTE }],
  judgment: [],
});

function memoCtx(approval?: ApprovalLite) {
  return makeCtx(memoWorld, {
    control: { ar_gl_cents: SHORTFALL_CENTS, ar_subledger_cents: SHORTFALL_CENTS },
    ...(approval ? { approval } : {}),
  });
}

describe("the Initech short payment, end to end", () => {
  it("A: applies the cash with no approval needed", () => {
    const ctx = makeCtx(paymentWorld, {
      control: { ar_gl_cents: INVOICE_CENTS, ar_subledger_cents: INVOICE_CENTS },
    });
    const result = runKernel(proposalA, ctx, "proposal");
    expect(result.verdict).toBe("accept");
    expect(result.requires_approval).toBe(false);
    expect(result.failed).toEqual([]);
    expect(adjustmentCents(proposalA, ctx)).toBe(0);
  });

  it("B: accepts the credit memo on the proposal pass but demands a person", () => {
    const result = runKernel(proposalB, memoCtx(), "proposal");
    expect(result.verdict).toBe("accept");
    expect(result.requires_approval).toBe(true);
    expect(adjustmentCents(proposalB, memoCtx())).toBe(SHORTFALL_CENTS);
  });

  it("B: fails P2 at the post gate with nobody's name on it", () => {
    const result = runKernel(proposalB, memoCtx(), "post_gate");
    expect(result.verdict).toBe("reject");
    expect(result.failed.map((m) => m.check)).toEqual(["P2"]);
  });

  it("B: accepts at the post gate once an authorised person approved", () => {
    const approval: ApprovalLite = { approver_id: CFO, approver_kind: "human", outcome: "approved" };
    const result = runKernel(proposalB, memoCtx(approval), "post_gate");
    expect(result.verdict).toBe("accept");
    expect(result.failed).toEqual([]);
    expect(statusOf(result, "P3")).toBe("pass");
  });

  it("B: rejects a controller agent signing for a material adjustment", () => {
    const approval: ApprovalLite = { approver_id: AGENT, approver_kind: "controller_agent", outcome: "approved" };
    const result = runKernel(proposalB, memoCtx(approval), "post_gate");
    expect(result.verdict).toBe("reject");
    expect(result.failed.map((m) => m.check)).toEqual(["P2", "P3"]);
    expect(markOf(result, "P2").detail).toContain("a person must approve");
  });

  it("B: still rejects on P2 when the controller agent does hold a large limit", () => {
    const approval: ApprovalLite = { approver_id: AGENT, approver_kind: "controller_agent", outcome: "approved" };
    const ctx = makeCtx(
      { ...memoWorld, approvers: [...memoWorld.approvers, approver(AGENT, 5_000_000, { role: "controller agent" })] },
      { control: { ar_gl_cents: SHORTFALL_CENTS, ar_subledger_cents: SHORTFALL_CENTS }, approval },
    );
    const result = runKernel(proposalB, ctx, "post_gate");
    expect(result.verdict).toBe("reject");
    expect(result.failed.map((m) => m.check)).toEqual(["P2"]);
  });
});

describe("adjustmentCents", () => {
  const ctx = makeCtx();

  it("is zero for an exact-match cash application", () => {
    expect(adjustmentCents(proposalA, ctx)).toBe(0);
  });

  it("is the non-control side of a credit memo", () => {
    expect(adjustmentCents(proposalB, ctx)).toBe(SHORTFALL_CENTS);
  });

  it("is zero for a proposal that posts no entry", () => {
    expect(adjustmentCents(makeProposal(), ctx)).toBe(0);
  });

  it("takes the larger side when the non-control lines are lopsided", () => {
    const proposal = makeProposal({
      kind: "write_off",
      entries: [line(BAD_DEBT, 70_000, 0), line(DEFERRED, 0, 30_000), line(AR, 0, 40_000)],
    });
    expect(adjustmentCents(proposal, ctx)).toBe(70_000);
  });
});

describe("requires_approval", () => {
  const immaterial = makeProposal({
    kind: "credit_memo",
    entries: [line(DEFERRED, 1_000, 0), line(AR, 0, 1_000)],
    evidence: [{ claim: "tiny", trace_id: "trace:ceo-email" }],
  });
  const world = { traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT)] };

  it("is false on auto, below materiality, with no judgment left", () => {
    expect(runKernel(immaterial, makeCtx(world), "proposal").requires_approval).toBe(false);
  });

  it("is true whenever the agent is not on auto", () => {
    for (const autonomy_level of ["review", "shadow"] as const) {
      expect(runKernel(immaterial, makeCtx(world, { autonomy_level }), "proposal").requires_approval).toBe(true);
    }
  });

  it("is true at exactly the materiality threshold", () => {
    const atThreshold = makeProposal({
      kind: "credit_memo",
      entries: [line(DEFERRED, 50_000, 0), line(AR, 0, 50_000)],
      evidence: [{ claim: "at the line", trace_id: "trace:ceo-email" }],
    });
    expect(runKernel(atThreshold, makeCtx(world), "proposal").requires_approval).toBe(true);
  });

  it("is true on a malformed proposal, which can never post unattended", () => {
    const broken = { ...makeProposal(), party_id: "" } as unknown as Proposal;
    expect(runKernel(broken, makeCtx(world), "proposal").requires_approval).toBe(true);
  });
});

describe("extra checks", () => {
  const passing: ExtraCheck = (proposal) => [
    { cls: "F", check: "F4", status: "pass", detail: "three-way match agreed", refs: [proposal.intent_id] },
  ];
  const throwing: ExtraCheck = () => {
    throw new Error("purchase order service is unreachable");
  };

  it("appends pack-specific marks to the workpaper", () => {
    const result = runKernel(makeProposal(), makeCtx({}, { extra_checks: [passing] }), "proposal");
    expect(markOf(result, "F4").detail).toBe("three-way match agreed");
    expect(result.verdict).toBe("accept");
  });

  it("converts a throwing extra check into a failing X0 mark instead of escaping", () => {
    const result = runKernel(makeProposal(), makeCtx({}, { extra_checks: [throwing] }), "proposal");
    expect(result.verdict).toBe("reject");
    expect(markOf(result, "X0").detail).toContain("purchase order service is unreachable");
  });

  it("keeps running the other extra checks after one throws", () => {
    const ctx = makeCtx({}, { extra_checks: [throwing, passing] });
    const result = runKernel(makeProposal(), ctx, "proposal");
    expect(markOf(result, "X0").status).toBe("fail");
    expect(markOf(result, "F4").status).toBe("pass");
  });

  it("handles a thrown value that is not an Error", () => {
    const rude: ExtraCheck = () => {
      throw "nope";
    };
    const result = runKernel(makeProposal(), makeCtx({}, { extra_checks: [rude] }), "proposal");
    expect(markOf(result, "X0").detail).toContain("nope");
  });
});

describe("the checkable fraction", () => {
  const world = { traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT)] };
  const clean = makeProposal({
    kind: "credit_memo",
    entries: [line(DEFERRED, 1_000, 0), line(AR, 0, 1_000)],
    evidence: [{ claim: "tiny", trace_id: "trace:ceo-email" }],
  });

  it("counts every mark in the denominator and re-performed marks in the numerator", () => {
    const result = runKernel(clean, makeCtx(world), "proposal");
    expect(result.checkable_den).toBe(result.marks.length);
    expect(result.checkable_den).toBe(19);
    expect(result.checkable_num).toBe(19);
  });

  it("leaves residual judgment out of the numerator", () => {
    const withJudgment = makeProposal({
      ...clean,
      judgment: [
        { note: "the quarter is a guess", confidence: "low" },
        { note: "the account is a guess", confidence: "medium" },
      ],
    });
    const result = runKernel(withJudgment, makeCtx(world), "proposal");
    expect(result.checkable_den).toBe(20);
    expect(result.checkable_num).toBe(18);
    expect(result.checkable_den - result.checkable_num).toBe(2);
  });

  it("counts extra checks and block-rule marks too", () => {
    const extra: ExtraCheck = () => [
      { cls: "F", check: "F4", status: "pass", detail: "matched", refs: [] } satisfies Mark,
    ];
    const ctx = makeCtx(world, { extra_checks: [extra], period: { id: "2026-08", status: "locked" } });
    const result = runKernel(clean, ctx, "proposal");
    expect(result.checkable_den).toBe(21);
    expect(result.checkable_num).toBe(21);
    expect(result.verdict).toBe("block");
  });

  it("always agrees with the marks it reports", () => {
    for (const stage of ["proposal", "post_gate"] as const) {
      const result = runKernel(clean, makeCtx(world), stage);
      const counted = result.marks.filter((m) => m.status !== "judgment").length;
      expect(result.checkable_num).toBe(counted);
      expect(result.checkable_num).toBeLessThanOrEqual(result.checkable_den);
      expect(result.failed).toEqual(result.marks.filter((m) => m.status === "fail"));
      expect(result.stage).toBe(stage);
    }
  });
});

describe("verdict precedence", () => {
  const world = { traces: [trace("trace:ceo-email", CEO_EMAIL_TEXT)] };

  it("accepts when nothing failed and nothing blocked", () => {
    expect(runKernel(makeProposal(), makeCtx(world), "proposal").verdict).toBe("accept");
  });

  it("rejects on a failing mark and names no block rule", () => {
    const result = runKernel(makeProposal(), makeCtx(world, { open_escalations: 1 }), "proposal");
    expect(result.verdict).toBe("reject");
    expect(result.block_rule).toBeUndefined();
  });

  it("blocks over a failing mark when a hard rule also fired", () => {
    const ctx = makeCtx(world, { open_escalations: 1, period: { id: "2026-08", status: "locked" } });
    const result = runKernel(makeProposal(), ctx, "proposal");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("PERIOD_LOCKED");
    expect(result.failed.map((m) => m.check)).toEqual(["P5", "P4", "PERIOD_LOCKED"]);
  });
});
