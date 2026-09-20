import { describe, expect, it } from "vitest";
import type { Proposal } from "../../contract/types.js";
import { runKernel } from "../index.js";
import {
  AR,
  DEFERRED,
  EXPENSE,
  approver,
  invoice,
  line,
  makeCtx,
  makeProposal,
  markOf,
  statusOf,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const PREPARER = "agent:ar";
const CFO = "person:cfo";

const world = {
  docs: [invoice("INV-9001", INITECH, 120_000)],
  traces: [trace("t-1", "shortfall agreed by the CEO")],
  approvers: [approver(CFO, 1_000_000), approver("person:clerk", 10_000, { role: "ar clerk" })],
};

/** Adjustment 120,000, which is above the 50,000 materiality, so approval is required. */
function materialMemo(over: Partial<Proposal> = {}): Proposal {
  return makeProposal({
    kind: "credit_memo",
    applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
    entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    evidence: [{ claim: "shortfall agreed", trace_id: "t-1", quote: "shortfall agreed by the CEO" }],
    ...over,
  });
}

describe("P5 period open", () => {
  it("passes an open period and a closing one", () => {
    expect(statusOf(runKernel(makeProposal(), makeCtx(world), "proposal"), "P5")).toBe("pass");
    const closing = makeCtx(world, { period: { id: "2026-09", status: "closing" } });
    expect(statusOf(runKernel(makeProposal(), closing, "proposal"), "P5")).toBe("pass");
  });

  it("fails a locked period", () => {
    const ctx = makeCtx(world, { period: { id: "2026-08", status: "locked" } });
    const mark = markOf(runKernel(makeProposal(), ctx, "proposal"), "P5");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("period 2026-08 is locked");
  });
});

describe("P9 fiscal window", () => {
  it("passes a date inside the window", () => {
    expect(statusOf(runKernel(makeProposal(), makeCtx(world), "proposal"), "P9")).toBe("pass");
  });

  it("fails an entry date before the window", () => {
    const proposal = makeProposal({ entry_date: "2023-07-14" });
    const mark = markOf(runKernel(proposal, makeCtx(world), "proposal"), "P9");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("entry_date 2023-07-14 is outside the fiscal window 2026-01-01..2026-12-31");
  });

  it("fails an entry date in an invented future year", () => {
    const proposal = makeProposal({ entry_date: "2027-09-15" });
    const mark = markOf(runKernel(proposal, makeCtx(world), "proposal"), "P9");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("entry_date 2027-09-15 is outside the fiscal window 2026-01-01..2026-12-31");
  });

  it("passes a concession that runs through a renewal next year", () => {
    const proposal = makeProposal({ entry_date: "2026-07-14", terms_change: { pct_off: 10, until: "2027-06-30" } });
    const mark = markOf(runKernel(proposal, makeCtx(world), "proposal"), "P9");
    expect(mark.status).toBe("pass");
    expect(mark.detail).toContain("terms end 2027-06-30 on or before 2031-12-31");
  });

  it("fails a terms end date that is already in the past", () => {
    const proposal = makeProposal({ entry_date: "2026-07-14", terms_change: { pct_off: 10, until: "2025-01-01" } });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "P9").detail).toContain(
      "terms_change.until 2025-01-01 is before the entry date 2026-07-14",
    );
  });

  it("passes a terms end date on the entry date itself", () => {
    const proposal = makeProposal({ entry_date: "2026-07-14", terms_change: { until: "2026-07-14" } });
    expect(statusOf(runKernel(proposal, makeCtx(world), "proposal"), "P9")).toBe("pass");
  });

  it("passes a terms end date exactly on the five year horizon", () => {
    const proposal = makeProposal({ entry_date: "2026-07-14", terms_change: { until: "2031-12-31" } });
    expect(statusOf(runKernel(proposal, makeCtx(world), "proposal"), "P9")).toBe("pass");
  });

  it("fails an invented far-future terms end date", () => {
    const proposal = makeProposal({ entry_date: "2026-07-14", terms_change: { pct_off: 10, until: "2040-01-01" } });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "P9").detail).toContain(
      "terms_change.until 2040-01-01 is later than 2031-12-31",
    );
  });
});

describe("P4 escalations answered", () => {
  it("passes when nothing is waiting on a person", () => {
    expect(statusOf(runKernel(makeProposal(), makeCtx(world), "proposal"), "P4")).toBe("pass");
  });

  it("fails while an escalation is unanswered", () => {
    const ctx = makeCtx(world, { open_escalations: 2 });
    const mark = markOf(runKernel(makeProposal(), ctx, "proposal"), "P4");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("2 escalation(s) still unanswered");
  });
});

describe("P6 accruals say how they reverse", () => {
  const accrual = (over: Partial<Proposal> = {}) =>
    makeProposal({ function: "close", kind: "accrual", entries: [line(EXPENSE, 9_000, 0), line(AR, 0, 9_000)], ...over });

  it("passes when reversal_mode is set", () => {
    const proposal = accrual({ reversal_mode: "auto_next_period", evidence: [{ claim: "accrue", trace_id: "t-1", quote: "shortfall agreed" }] });
    expect(statusOf(runKernel(proposal, makeCtx(world), "proposal"), "P6")).toBe("pass");
  });

  it("fails an accrual with no reversal_mode", () => {
    const mark = markOf(runKernel(accrual(), makeCtx(world), "proposal"), "P6");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("kind accrual has no reversal_mode");
  });

  it("fails a payroll accrual with no reversal_mode", () => {
    const proposal = accrual({ kind: "payroll_accrual" });
    expect(statusOf(runKernel(proposal, makeCtx(world), "proposal"), "P6")).toBe("fail");
  });

  it("is n/a for a kind that does not reverse", () => {
    expect(markOf(runKernel(makeProposal(), makeCtx(world), "proposal"), "P6").detail).toMatch(/^n\/a:/);
  });
});

describe("post-gate-only checks on the proposal pass", () => {
  it("emits P1, P2 and P3 as deferred rather than judging them early", () => {
    const result = runKernel(materialMemo(), makeCtx(world), "proposal");
    for (const check of ["P1", "P2", "P3"]) {
      expect(markOf(result, check).detail).toBe("n/a: evaluated at post gate");
      expect(markOf(result, check).status).toBe("pass");
    }
    expect(result.verdict).toBe("accept");
    expect(result.requires_approval).toBe(true);
  });
});

describe("P1 preparer is not approver", () => {
  it("passes when someone else approved", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" } });
    expect(statusOf(runKernel(materialMemo(), ctx, "post_gate"), "P1")).toBe("pass");
  });

  it("fails when the preparer approved their own work", () => {
    const ctx = makeCtx(world, { approval: { approver_id: PREPARER, approver_kind: "human", outcome: "approved" } });
    const mark = markOf(runKernel(materialMemo(), ctx, "post_gate"), "P1");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain(`approver ${PREPARER} is the preparer`);
  });
});

describe("P2 approval present when required", () => {
  it("passes with a human approval on record", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" } });
    expect(statusOf(runKernel(materialMemo(), ctx, "post_gate"), "P2")).toBe("pass");
  });

  it("accepts a corrected outcome as an approval", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "corrected" } });
    expect(statusOf(runKernel(materialMemo(), ctx, "post_gate"), "P2")).toBe("pass");
  });

  it("fails when approval is required and none is on record", () => {
    const mark = markOf(runKernel(materialMemo(), makeCtx(world), "post_gate"), "P2");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("approval required for adjustment 120000 but none is on record");
  });

  it("fails a rejected outcome", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "rejected" } });
    expect(markOf(runKernel(materialMemo(), ctx, "post_gate"), "P2").detail).toContain("outcome is rejected");
  });

  it("is n/a when no approval was required", () => {
    const result = runKernel(makeProposal(), makeCtx(world), "post_gate");
    expect(result.requires_approval).toBe(false);
    expect(markOf(result, "P2").detail).toMatch(/^n\/a:/);
  });

  it("lets a controller agent sign below materiality but not at or above it", () => {
    const agent = { approver_id: "agent:controller", approver_kind: "controller_agent" as const, outcome: "approved" as const };
    const small = makeProposal({
      kind: "credit_memo",
      entries: [line(DEFERRED, 40_000, 0), line(AR, 0, 40_000)],
      applications: [{ doc_id: "INV-9001", amount_cents: 40_000 }],
      evidence: [{ claim: "small goodwill credit", trace_id: "t-1", quote: "agreed by the CEO" }],
      judgment: [{ note: "goodwill sizing", confidence: "high" }],
    });
    const ctx = makeCtx({ ...world, approvers: [...world.approvers, approver("agent:controller", 5_000_000)] }, {
      approval: agent,
    });
    expect(statusOf(runKernel(small, ctx, "post_gate"), "P2")).toBe("pass");

    const big = markOf(runKernel(materialMemo(), ctx, "post_gate"), "P2");
    expect(big.status).toBe("fail");
    expect(big.detail).toContain("a person must approve");
  });
});

describe("P3 approver authorised", () => {
  it("passes when the approver's limit covers the adjustment", () => {
    const ctx = makeCtx(world, { approval: { approver_id: CFO, approver_kind: "human", outcome: "approved" } });
    expect(statusOf(runKernel(materialMemo(), ctx, "post_gate"), "P3")).toBe("pass");
  });

  it("fails when the approver is not on the authority list", () => {
    const ctx = makeCtx(world, { approval: { approver_id: "person:ghost", approver_kind: "human", outcome: "approved" } });
    const mark = markOf(runKernel(materialMemo(), ctx, "post_gate"), "P3");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("person:ghost is not on the authority list");
  });

  it("fails when the approver signed over their limit", () => {
    const ctx = makeCtx(world, {
      approval: { approver_id: "person:clerk", approver_kind: "human", outcome: "approved" },
    });
    expect(markOf(runKernel(materialMemo(), ctx, "post_gate"), "P3").detail).toContain(
      "limit 10000 < adjustment 120000",
    );
  });

  it("is n/a when there is no approval to check", () => {
    expect(markOf(runKernel(makeProposal(), makeCtx(world), "post_gate"), "P3").detail).toMatch(/^n\/a:/);
  });
});
