import { describe, expect, it } from "vitest";
import type { EntryLine, Proposal } from "../../contract/types.js";
import { checkF1, checkF7, runKernel } from "../index.js";
import {
  AP,
  AR,
  CASH,
  DEFERRED,
  EXPENSE,
  bankTxn,
  bill,
  invoice,
  line,
  makeCtx,
  makeProposal,
  markOf,
  statusOf,
  trace,
} from "./fixtures.js";

const INITECH = "cust:initech";
const ACME = "vend:acme";

describe("F0 schema gate", () => {
  it("passes a well-formed proposal through to the real checks", () => {
    const result = runKernel(makeProposal(), makeCtx(), "proposal");
    expect(result.marks.some((m) => m.check === "F0")).toBe(false);
    expect(result.verdict).toBe("accept");
  });

  it("rejects a malformed proposal with a single F0 mark instead of throwing", () => {
    const broken = { ...makeProposal(), entry_date: "15/09/2026" } as unknown as Proposal;
    const result = runKernel(broken, makeCtx(), "proposal");
    expect(result.verdict).toBe("reject");
    expect(result.marks).toHaveLength(1);
    expect(markOf(result, "F0").detail).toContain("entry_date");
    expect(markOf(result, "F0").cls).toBe("F");
  });
});

describe("F1 footed", () => {
  it("passes when debits equal credits", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    });
    const mark = checkF1(proposal);
    expect(mark.status).toBe("pass");
    expect(mark.detail).toContain("debits 120000 = credits 120000");
  });

  it("fails when debits and credits differ", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 119_999)],
    });
    const mark = checkF1(proposal);
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("debits 120000 != credits 119999");
  });

  it("passes with no lines only for the kinds that post none", () => {
    expect(checkF1(makeProposal({ kind: "no_action" })).status).toBe("pass");
    expect(checkF1(makeProposal({ kind: "hold_bill" })).detail).toContain("n/a:");
    const posting = checkF1(makeProposal({ kind: "credit_memo" }));
    expect(posting.status).toBe("fail");
    expect(posting.detail).toContain("must post entry lines, found 0");
  });
});

describe("F2 applications fit", () => {
  const world = {
    docs: [invoice("INV-9001", INITECH, 1_200_000)],
    bankTxns: [bankTxn("BT-1", 1_080_000)],
  };
  const payment = (over: Partial<Proposal> = {}) =>
    makeProposal({
      kind: "apply_payment",
      bank_txn_id: "BT-1",
      applications: [{ doc_id: "INV-9001", amount_cents: 1_080_000 }],
      entries: [line(CASH, 1_080_000, 0), line(AR, 0, 1_080_000)],
      ...over,
    });

  it("passes when the application, the document and the bank line agree", () => {
    const result = runKernel(payment(), makeCtx(world), "proposal");
    expect(statusOf(result, "F2")).toBe("pass");
  });

  it("is n/a when there is nothing to apply", () => {
    const result = runKernel(makeProposal(), makeCtx(world), "proposal");
    expect(markOf(result, "F2").detail).toMatch(/^n\/a:/);
  });

  it("fails when the application exceeds the open balance", () => {
    const proposal = payment({
      applications: [{ doc_id: "INV-9001", amount_cents: 1_300_000 }],
      entries: [line(CASH, 1_300_000, 0), line(AR, 0, 1_300_000)],
      bank_txn_id: "BT-2",
    });
    const ctx = makeCtx({ ...world, bankTxns: [bankTxn("BT-2", 1_300_000)] });
    expect(markOf(runKernel(proposal, ctx, "proposal"), "F2").detail).toContain(
      "applications 1300000 exceed INV-9001 open balance 1200000",
    );
  });

  it("fails when the document does not exist", () => {
    const proposal = payment({ applications: [{ doc_id: "INV-NOPE", amount_cents: 1_080_000 }] });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "F2").detail).toContain(
      "document INV-NOPE not found",
    );
  });

  it("fails on a zero application", () => {
    const proposal = payment({ applications: [{ doc_id: "INV-9001", amount_cents: 0 }] });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "F2").detail).toContain("must be > 0");
  });

  it("fails when the applications exceed the bank amount", () => {
    const ctx = makeCtx({ ...world, bankTxns: [bankTxn("BT-1", 500_000)] });
    expect(markOf(runKernel(payment(), ctx, "proposal"), "F2").detail).toContain(
      "applications 1080000 exceed what is left of bank line",
    );
  });

  it("fails when the cash debit does not equal the bank amount", () => {
    const proposal = payment({ entries: [line(CASH, 900_000, 0), line(AR, 0, 900_000)] });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "F2").detail).toContain(
      "cash debit 900000 != bank amount 1080000",
    );
  });
});

describe("F3 control accounts stay tied", () => {
  const world = { docs: [invoice("INV-9001", INITECH, 1_200_000), bill("BILL-7", ACME, 50_000)] };

  it("passes when the GL movement matches the subledger movement on AR", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
      entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    });
    const mark = markOf(runKernel(proposal, makeCtx(world), "proposal"), "F3");
    expect(mark.status).toBe("pass");
    expect(mark.detail).toContain("AR 4880000 = 4880000");
  });

  it("passes on AP when a bill is approved", () => {
    const proposal = makeProposal({
      function: "ap",
      kind: "approve_bill",
      party_id: ACME,
      applications: [{ doc_id: "BILL-7", amount_cents: 50_000 }],
      entries: [line(EXPENSE, 50_000, 0), line(AP, 0, 50_000)],
      evidence: [{ claim: "bill received", trace_id: "t-1" }],
    });
    const ctx = makeCtx({ ...world, traces: [trace("t-1", "Acme bill 7 for 50,000 cents")] });
    expect(markOf(runKernel(proposal, ctx, "proposal"), "F3").detail).toContain("AP 3050000 = 3050000");
  });

  it("fails when the GL and the subledger moved by different amounts", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      applications: [{ doc_id: "INV-9001", amount_cents: 100_000 }],
      entries: [line(DEFERRED, 120_000, 0), line(AR, 0, 120_000)],
    });
    expect(markOf(runKernel(proposal, makeCtx(world), "proposal"), "F3").detail).toContain(
      "AR gl 4880000 != subledger 4900000",
    );
  });

  it("leaves both subledgers alone for a dispute hold, which retires nothing", () => {
    const proposal = makeProposal({
      kind: "dispute_hold",
      applications: [{ doc_id: "INV-9001", amount_cents: 120_000 }],
      entries: [],
    });
    const result = runKernel(proposal, makeCtx(world), "proposal");
    expect(markOf(result, "F1").detail).toMatch(/^n\/a:/);
    expect(statusOf(result, "F3")).toBe("pass");
    expect(markOf(result, "F3").detail).toContain("AR 5000000 = 5000000");
    expect(statusOf(result, "F2")).toBe("pass");
    expect(result.verdict).toBe("accept");
  });

  it("still checks that a disputed amount fits the open balance", () => {
    const proposal = makeProposal({
      kind: "dispute_hold",
      applications: [{ doc_id: "INV-9001", amount_cents: 2_000_000 }],
      entries: [],
    });
    const result = runKernel(proposal, makeCtx(world), "proposal");
    expect(markOf(result, "F2").detail).toContain("applications 2000000 exceed INV-9001 open balance 1200000");
    expect(statusOf(result, "F3")).toBe("pass");
  });

  it("fails and says so when the accounts were not tied before the proposal", () => {
    const ctx = makeCtx(world, { control: { ar_subledger_cents: 4_999_000 } });
    const mark = markOf(runKernel(makeProposal(), ctx, "proposal"), "F3");
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("were not tied before the proposal");
  });
});

describe("F7 integer cents", () => {
  it("passes when every amount is a safe integer", () => {
    const proposal = makeProposal({ kind: "credit_memo", entries: [line(DEFERRED, 1, 0), line(AR, 0, 1)] });
    expect(checkF7(proposal).status).toBe("pass");
  });

  it("fails a float amount rather than rounding it", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      applications: [{ doc_id: "INV-9001", amount_cents: 0.1 + 0.2 }],
      entries: [line(DEFERRED, 0.1 + 0.2, 0), line(AR, 0, 0.1 + 0.2)],
    });
    const mark = checkF7(proposal);
    expect(mark.status).toBe("fail");
    expect(mark.detail).toContain("0.30000000000000004");
  });

  it("fails an integer past the safe range", () => {
    const proposal = makeProposal({ kind: "credit_memo", entries: [line(DEFERRED, 2 ** 53, 0), line(AR, 0, 2 ** 53)] });
    expect(checkF7(proposal).status).toBe("fail");
  });

  it("stops a float at the schema gate before it reaches the ledger", () => {
    const proposal = makeProposal({
      kind: "credit_memo",
      entries: [line(DEFERRED, 0.1 + 0.2, 0), line(AR, 0, 0.1 + 0.2)],
    });
    const result = runKernel(proposal, makeCtx(), "proposal");
    expect(result.verdict).toBe("reject");
    expect(markOf(result, "F0").detail).toContain("expected int");
  });
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split a total into `parts` amounts of at least 1 cent each. */
function splitInto(total: number, parts: number, rand: () => number): number[] {
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < parts - 1; i += 1) {
    const room = left - (parts - i - 1);
    const take = 1 + Math.floor(rand() * room);
    out.push(take);
    left -= take;
  }
  out.push(left);
  return out;
}

function randomBalanced(rand: () => number): EntryLine[] {
  const debits = splitInto(1000 + Math.floor(rand() * 5_000_000), 1 + Math.floor(rand() * 3), rand);
  const credits = splitInto(
    debits.reduce((a, b) => a + b, 0),
    1 + Math.floor(rand() * 3),
    rand,
  );
  return [
    ...debits.map((amount, i) => line(`4000 Revenue ${i}`, amount, 0)),
    ...credits.map((amount, i) => line(`${AR} ${i}`, 0, amount)),
  ];
}

describe("F1 over random balanced entries", () => {
  it("foots 200 random entries and breaks on a one cent perturbation", () => {
    const rand = mulberry32(20260919);
    for (let i = 0; i < 200; i += 1) {
      const entries = randomBalanced(rand);
      expect(checkF1(makeProposal({ kind: "credit_memo", entries })).status).toBe("pass");

      const index = Math.floor(rand() * entries.length);
      const target = entries[index] as EntryLine;
      const bumped = target.debit_cents > 0
        ? { ...target, debit_cents: target.debit_cents + 1 }
        : { ...target, credit_cents: target.credit_cents + 1 };
      const perturbed = entries.map((l, j) => (j === index ? bumped : l));
      expect(checkF1(makeProposal({ kind: "credit_memo", entries: perturbed })).status).toBe("fail");
    }
  });
});
