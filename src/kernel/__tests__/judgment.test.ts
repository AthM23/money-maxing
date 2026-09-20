import { describe, expect, it } from "vitest";
import type { Proposal } from "../../contract/types.js";
import { checkJ3, runKernel } from "../index.js";
import {
  AR,
  DEFERRED,
  fact,
  invoice,
  line,
  makeCtx,
  makeProposal,
  marksOf,
  markOf,
  policy,
  statusOf,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const GLOBEX = "cust:globex";

const world = {
  docs: [invoice("INV-9001", INITECH, 120_000)],
  traces: [trace("t-1", "shortfall agreed by the CEO")],
};

/** Adjustment 120,000 on the Initech credit memo. */
function memo(over: Partial<Proposal> = {}): Proposal {
  return makeProposal({
    kind: "credit_memo",
    applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
    entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    evidence: [{ claim: "shortfall agreed", trace_id: "t-1", quote: "shortfall agreed by the CEO" }],
    ...over,
  });
}

describe("J1 policy holds", () => {
  const features = { shortfall_cents: 120_000, method: "credit_memo" };

  it("passes an approved policy whose condition holds", () => {
    const ctx = makeCtx({ ...world, policies: [policy("pol:shortfall")] }, { features });
    expect(statusOf(runKernel(memo({ policy_refs: ["pol:shortfall"] }), ctx, "proposal"), "J1")).toBe("pass");
  });

  it("is n/a when no policy is cited", () => {
    expect(markOf(runKernel(memo(), makeCtx(world), "proposal"), "J1").detail).toMatch(/^n\/a:/);
  });

  it("fails when the policy does not resolve", () => {
    const ctx = makeCtx(world, { features });
    expect(markOf(runKernel(memo({ policy_refs: ["pol:ghost"] }), ctx, "proposal"), "J1").detail).toContain(
      "policy pol:ghost does not resolve",
    );
  });

  it("fails a policy that is only proposed", () => {
    const ctx = makeCtx({ ...world, policies: [policy("pol:draft", { status: "proposed" })] }, { features });
    expect(markOf(runKernel(memo({ policy_refs: ["pol:draft"] }), ctx, "proposal"), "J1").detail).toContain(
      "status is proposed, not approved",
    );
  });

  it("fails when the condition does not hold on these features", () => {
    const ctx = makeCtx({ ...world, policies: [policy("pol:shortfall")] }, { features: { shortfall_cents: 900_000 } });
    const mark = markOf(runKernel(memo({ policy_refs: ["pol:shortfall"] }), ctx, "proposal"), "J1");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("condition does not hold");
  });
});

describe("J2 facts are in scope", () => {
  const inScope = fact("fact:terms", { kinds: ["credit_memo"], max_amount_cents: 200_000 });

  it("passes a fact that covers this party, kind, date and amount", () => {
    const ctx = makeCtx({ ...world, facts: [inScope] });
    expect(statusOf(runKernel(memo({ fact_refs: ["fact:terms"] }), ctx, "proposal"), "J2")).toBe("pass");
  });

  it("is n/a when no fact is cited", () => {
    expect(markOf(runKernel(memo(), makeCtx(world), "proposal"), "J2").detail).toMatch(/^n\/a:/);
  });

  it("fails when the fact does not resolve", () => {
    expect(markOf(runKernel(memo({ fact_refs: ["fact:ghost"] }), makeCtx(world), "proposal"), "J2").detail).toContain(
      "fact fact:ghost does not resolve",
    );
  });

  it("fails a one_time fact that was already used", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:once", { uses: "one_time", used_count: 1 })] });
    const mark = markOf(runKernel(memo({ fact_refs: ["fact:once"] }), ctx, "proposal"), "J2");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("is one_time and has already been used 1 time(s)");
  });

  it("passes a one_time fact that has not been used", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:once", { uses: "one_time", used_count: 0 })] });
    expect(statusOf(runKernel(memo({ fact_refs: ["fact:once"] }), ctx, "proposal"), "J2")).toBe("pass");
  });

  it("fails a fact whose validity window has expired", () => {
    const expired = fact("fact:old", { valid_from: "2025-01-01", valid_to: "2025-12-31", status: "expired" });
    const ctx = makeCtx({ ...world, facts: [expired] });
    const mark = markOf(runKernel(memo({ fact_refs: ["fact:old"] }), ctx, "proposal"), "J2");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("status is expired, not active");
    expect(mark.detail).toContain("valid 2025-01-01..2025-12-31, entry_date is 2026-09-15");
  });

  it("fails a fact learned for a different party", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:other", { party_id: GLOBEX })] });
    expect(markOf(runKernel(memo({ fact_refs: ["fact:other"] }), ctx, "proposal"), "J2").detail).toContain(
      `party ${GLOBEX} != proposal party ${INITECH}`,
    );
  });

  it("fails a fact that does not cover this kind", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:ap", { kinds: ["schedule_payment"] })] });
    expect(markOf(runKernel(memo({ fact_refs: ["fact:ap"] }), ctx, "proposal"), "J2").detail).toContain(
      "covers [schedule_payment], not credit_memo",
    );
  });

  it("fails a fact that caps below the adjustment", () => {
    const ctx = makeCtx({ ...world, facts: [fact("fact:small", { max_amount_cents: 50_000 })] });
    expect(markOf(runKernel(memo({ fact_refs: ["fact:small"] }), ctx, "proposal"), "J2").detail).toContain(
      "caps at 50000, adjustment is 120000",
    );
  });

  it("fails in replay when the fact was learned after as_of", () => {
    const ctx = makeCtx(
      { ...world, facts: [fact("fact:late", { learned_at: "2026-09-18T09:00:00Z" })] },
      { mode: "replay", as_of: "2026-09-15T00:00:00Z" },
    );
    expect(markOf(runKernel(memo({ fact_refs: ["fact:late"] }), ctx, "proposal"), "J2").detail).toContain(
      "learned 2026-09-18T09:00:00Z is after as_of",
    );
  });
});

describe("J3 residual judgment", () => {
  it("emits one passing mark when the agent left no judgment open", () => {
    const marks = checkJ3(makeProposal());
    expect(marks).toHaveLength(1);
    expect(marks[0]?.status).toBe("pass");
  });

  it("emits one judgment mark per note and forces approval", () => {
    const proposal = memo({
      judgment: [
        { note: "the shortfall split is an estimate", confidence: "medium" },
        { note: "deferred revenue is the likelier account", confidence: "low" },
      ],
    });
    const result = runKernel(proposal, makeCtx(world), "proposal");
    const j3 = marksOf(result, "J3");
    expect(j3).toHaveLength(2);
    expect(j3.every((m) => m.status === "judgment" && m.cls === "J")).toBe(true);
    expect(j3[0]?.detail).toContain("judgment 1/2 (medium confidence): the shortfall split is an estimate");
    expect(result.requires_approval).toBe(true);
    expect(result.verdict).toBe("accept");
  });

  it("forces approval on an immaterial entry that still carries judgment", () => {
    const small = memo({
      applications: [{ doc_id: "INV-9001", amount_cents: 1_000 }],
      entries: [line(DEFERRED, 1_000, 0), line(AR, 0, 1_000)],
      judgment: [{ note: "unsure which quarter this belongs to", confidence: "low" }],
    });
    const result = runKernel(small, makeCtx(world), "proposal");
    expect(result.requires_approval).toBe(true);
    expect(marksOf(result, "J3")).toHaveLength(1);
  });
});
