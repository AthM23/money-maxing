import { describe, expect, it } from "vitest";
import { loadCases } from "../cases.js";
import { main } from "../run.js";
import { kernelPackSut } from "../suts/kernelPack.js";

const KERNEL_PACK_IDS = ["G-01", "G-02", "G-03", "G-04", "G-05", "G-06", "G-07", "G-08", "B-24", "F-09", "H-1"];
const opts = { baseline: false, seed: 0 };

function rowFor(id: string) {
  const row = loadCases().find((r) => r.id === id);
  if (!row) throw new Error(`test fixture bug: ${id} is not in tests/cases.csv`);
  return row;
}

describe("kernelPackSut: wired to the real runtime, kernel and learning loop", () => {
  it.each(KERNEL_PACK_IDS)("%s routes to something other than NOT_RUN", async (id) => {
    const outcome = await kernelPackSut.runCase(rowFor(id), opts);
    expect(outcome.route).not.toBe("NOT_RUN");
    expect(outcome.cost_micros).toBe(0);
    expect(outcome.model_calls).toBe(0);
  });

  it("an id with no fixture returns NOT_RUN", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("A-01"), opts);
    expect(outcome).toMatchObject({ case_id: "A-01", route: "NOT_RUN" });
  });

  it("G-03 blocks a posting into a locked period", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-03"), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "PERIOD_LOCKED" });
  });

  it("G-02 blocks the preparer approving their own entry", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-02"), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "PREPARER_EQUALS_APPROVER" });
  });

  it("B-24 blocks a $14,000 adjustment against a $10,000 limit", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("B-24"), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "OVER_APPROVER_LIMIT" });
  });

  it.each(["G-01", "H-1"])("%s blocks the duplicate payment even though a human approved it", async (id) => {
    const outcome = await kernelPackSut.runCase(rowFor(id), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "DUPLICATE_PAYMENT" });
  });

  it("G-04 blocks a rule cited above its approver's authority", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-04"), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "RULE_ABOVE_APPROVER_AUTHORITY" });
  });

  it("F-09 refuses an entry dated outside the fiscal window (kernel P9)", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("F-09"), opts);
    expect(outcome.route).toBe("REFUSE");
    expect(outcome.refuse_places_looked).toContain("kernel:P9");
  });

  it("G-05 refuses to learn from a single decision point", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-05"), opts);
    expect(outcome).toMatchObject({
      route: "REFUSE",
      refuse_places_looked: ["decision_point history: 1 agreeing case, 3 required"],
    });
  });

  it("G-06 blocks a rule whose backtest would have mis-cleared a prior case", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-06"), opts);
    expect(outcome).toMatchObject({ route: "BLOCK", block_rule: "BACKTEST_MISCLEAR" });
  });

  it("G-07 proposes after a contradicting correction supersedes the prior fact", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-07"), opts);
    expect(outcome).toMatchObject({ route: "PROPOSE" });
  });

  it("G-08 auto-clears within the learned ceiling and reports whether it stayed clamped", async () => {
    const outcome = await kernelPackSut.runCase(rowFor("G-08"), opts);
    expect(outcome.route).toBe("AUTO");
    expect(outcome.auto_posted_entry_matches_key).toBe(true);
  });

  it("the full harness with --sut kernel-pack finds zero false auto-posts", async () => {
    expect(await main(["--sut", "kernel-pack"])).toBe(0);
  });
});
