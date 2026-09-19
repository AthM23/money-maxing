import { describe, expect, it } from "vitest";
import type { Proposal } from "../../contract/types.js";
import { runKernel } from "../index.js";
import {
  AP,
  AR,
  CASH,
  DEFERRED,
  approver,
  bill,
  fact,
  invoice,
  line,
  makeCtx,
  makeProposal,
  markOf,
  policy,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const ACME = "vend:acme";
const PREPARER = "agent:ar";
const CFO = "person:cfo";

const world = {
  docs: [invoice("INV-9001", INITECH, 120_000), bill("BILL-7", ACME, 80_000)],
  traces: [trace("t-1", "approved by the CEO")],
  approvers: [approver(CFO, 1_000_000), approver("person:clerk", 10_000, { role: "ar clerk" })],
};

/** Adjustment 120,000: above materiality, so the approval rules have something to bite on. */
function memo(over: Partial<Proposal> = {}): Proposal {
  return makeProposal({
    kind: "credit_memo",
    applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
    entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    evidence: [{ claim: "shortfall agreed", trace_id: "t-1" }],
    ...over,
  });
}

function payment(over: Partial<Proposal> = {}): Proposal {
  return makeProposal({
    function: "ap",
    kind: "schedule_payment",
    party_id: ACME,
    applications: [{ doc_id: "BILL-7", amount_cents: 80_000 }],
    entries: [line(AP, 80_000, 0), line(CASH, 0, 80_000)],
    ...over,
  });
}

describe("H1 DUPLICATE_PAYMENT", () => {
  it("does not fire when no paid document matches", () => {
    const ctx = makeCtx(world, { findPaidDuplicate: () => undefined });
    expect(runKernel(payment(), ctx, "proposal").verdict).toBe("accept");
  });

  it("blocks when the same vendor and amount was already paid", () => {
    const ctx = makeCtx(world, { findPaidDuplicate: () => ({ doc_id: "BILL-3" }) });
    const result = runKernel(payment(), ctx, "proposal");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("DUPLICATE_PAYMENT");
    expect(markOf(result, "DUPLICATE_PAYMENT").detail).toContain("document BILL-3 already pays 80000");
  });

  it("passes the party, amount and excluded documents to the lookup", () => {
    const seen: unknown[] = [];
    const ctx = makeCtx(world, {
      findPaidDuplicate: (party, amount, exclude) => {
        seen.push([party, amount, exclude]);
        return undefined;
      },
    });
    runKernel(payment(), ctx, "proposal");
    expect(seen).toEqual([[ACME, 80_000, ["BILL-7"]]]);
  });

  it("does not fire for a kind that is not a payment", () => {
    const ctx = makeCtx(world, { findPaidDuplicate: () => ({ doc_id: "BILL-3" }) });
    expect(runKernel(memo(), ctx, "proposal").verdict).not.toBe("block");
  });
});

describe("H2 PREPARER_EQUALS_APPROVER", () => {
  it("does not fire when the approver is someone else", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" } });
    expect(runKernel(memo(), ctx, "post_gate").verdict).toBe("accept");
  });

  it("blocks when the preparer approved their own work, even with authority to spare", () => {
    const ctx = makeCtx(
      { ...world, approvers: [approver(PREPARER, 5_000_000)] },
      { approval: { approver_id: PREPARER, approver_kind: "human", outcome: "approved" } },
    );
    const result = runKernel(memo(), ctx, "post_gate");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("PREPARER_EQUALS_APPROVER");
    expect(markOf(result, "PREPARER_EQUALS_APPROVER").detail).toContain(`preparer ${PREPARER} also approved`);
  });

  it("is evaluated on the proposal pass too, not only at the post gate", () => {
    const ctx = makeCtx(world, {
      approval: { approver_id: PREPARER, approver_kind: "human", outcome: "approved" },
    });
    expect(runKernel(memo(), ctx, "proposal").block_rule).toBe("PREPARER_EQUALS_APPROVER");
  });
});

describe("H3 PERIOD_LOCKED", () => {
  it("does not fire while the period is open", () => {
    expect(runKernel(memo(), makeCtx(world), "proposal").verdict).toBe("accept");
  });

  it("blocks a locked period even with a valid approval", () => {
    const ctx = makeCtx(world, {
      period: { id: "2026-08", status: "locked" },
      approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" },
    });
    const result = runKernel(memo(), ctx, "post_gate");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("PERIOD_LOCKED");
  });
});

describe("H4 RULE_ABOVE_APPROVER_AUTHORITY", () => {
  it("does not fire when the cited rule covers the amount", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:terms", { max_amount_cents: 200_000 })] });
    expect(runKernel(memo({ fact_refs: ["fact:terms"] }), ctx, "proposal").verdict).toBe("accept");
  });

  it("blocks when a cited fact caps below the adjustment", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:small", { max_amount_cents: 50_000 })] });
    const result = runKernel(memo({ fact_refs: ["fact:small"] }), ctx, "proposal");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("RULE_ABOVE_APPROVER_AUTHORITY");
    expect(markOf(result, "RULE_ABOVE_APPROVER_AUTHORITY").detail).toContain("fact fact:small caps at 50000");
  });

  it("blocks when a cited policy caps below the adjustment", () => {
    const ctx = makeCtx(
      { ...world, policies: [policy("pol:cap", { max_amount_cents: 60_000 })] },
      { features: { shortfall_cents: 120_000 } },
    );
    const result = runKernel(memo({ policy_refs: ["pol:cap"] }), ctx, "proposal");
    expect(result.block_rule).toBe("RULE_ABOVE_APPROVER_AUTHORITY");
    expect(markOf(result, "RULE_ABOVE_APPROVER_AUTHORITY").detail).toContain("policy pol:cap caps at 60000");
  });
});

describe("H5 BANK_DETAILS_CHANGED", () => {
  it("does not fire when the remit-to details are confirmed", () => {
    const ctx = makeCtx(world, { remitChangedUnverified: () => false });
    expect(runKernel(payment(), ctx, "proposal").verdict).toBe("accept");
  });

  it("blocks a payment to details nobody confirmed out of band", () => {
    const ctx = makeCtx(world, { remitChangedUnverified: (party) => party === ACME });
    const result = runKernel(payment(), ctx, "proposal");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("BANK_DETAILS_CHANGED");
  });

  it("does not fire for a kind that is not a payment", () => {
    const ctx = makeCtx(world, { remitChangedUnverified: () => true });
    expect(runKernel(memo(), ctx, "proposal").verdict).toBe("accept");
  });
});

describe("H6 OVER_APPROVER_LIMIT", () => {
  it("does not fire when the approver's limit covers the adjustment", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" } });
    expect(runKernel(memo(), ctx, "post_gate").verdict).toBe("accept");
  });

  it("blocks at the post gate when the approver signed over their limit", () => {
    const ctx = makeCtx(world, {
      approval: { approver_id: "person:clerk", approver_kind: "human", outcome: "approved" },
    });
    const result = runKernel(memo(), ctx, "post_gate");
    expect(result.verdict).toBe("block");
    expect(result.block_rule).toBe("OVER_APPROVER_LIMIT");
    expect(markOf(result, "OVER_APPROVER_LIMIT").detail).toContain("limit 10000 < adjustment 120000");
  });

  it("is not evaluated on the proposal pass, where no approver has signed yet", () => {
    const ctx = makeCtx(world, {
      approval: { approver_id: "person:clerk", approver_kind: "human", outcome: "approved" },
    });
    expect(runKernel(memo(), ctx, "proposal").verdict).toBe("accept");
  });
});

describe("block rule precedence", () => {
  it("names the first rule in H1..H6 order when several fire", () => {
    const ctx = makeCtx(world, {
      period: { id: "2026-08", status: "locked" },
      findPaidDuplicate: () => ({ doc_id: "BILL-3" }),
      remitChangedUnverified: () => true,
    });
    const result = runKernel(payment(), ctx, "proposal");
    expect(result.block_rule).toBe("DUPLICATE_PAYMENT");
    expect(result.failed.map((m) => m.check)).toContain("PERIOD_LOCKED");
    expect(result.failed.map((m) => m.check)).toContain("BANK_DETAILS_CHANGED");
  });

  it("blocks over an otherwise clean, approved and material entry", () => {
    const ctx = makeCtx(world, {
      approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" },
      period: { id: "2026-08", status: "locked" },
    });
    const result = runKernel(memo(), ctx, "post_gate");
    expect(result.verdict).toBe("block");
    expect(markOf(result, "P2").status).toBe("pass");
  });
});
