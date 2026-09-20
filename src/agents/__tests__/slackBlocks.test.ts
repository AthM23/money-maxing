import { describe, expect, it } from "vitest";
import { creditMemo } from "../../runtime/__tests__/seed.js";
import { parseVerdict } from "../controllerOpenAI.js";
import { answerModal, approvalBlocks, escalationBlocks } from "../slack/blocks.js";

describe("Slack messages are plain data", () => {
  it("an escalation says what happened, what was checked with hit counts, what is unknown, and offers the treatments", () => {
    const blocks = escalationBlocks("esc_1", {
      what_happened: "Wayne paid $29,700.00 of $33,000.00", what_is_unknown: "Whether a credit was agreed",
      what_was_checked: [{ source: "mail", query: "Wayne credit", hits: 0 }, { source: "slack", query: "Wayne", hits: 1 }],
      treatments: [{ id: "credit_memo", label: "Agreed credit" }, { id: "chase", label: "Chase it" }],
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain("0 hits");
    expect(text).toContain("1 hit\"".slice(0, 5));
    expect(text).toContain("answer:credit_memo");
    expect(text).toContain("Nothing is written off on a guess");
  });

  it("the modal carries the escalation and treatment, and defaults to one-time", () => {
    const modal = answerModal("esc_1", "credit_memo") as { private_metadata: string; blocks: unknown[] };
    expect(JSON.parse(modal.private_metadata)).toEqual({ escalation_id: "esc_1", treatment: "credit_memo" });
    expect(JSON.stringify(modal.blocks)).toContain("one_time");
  });

  it("an approval shows the entry in dollars, the tick-mark tally, the quoted evidence and the controller's note", () => {
    const marks = [
      { cls: "F" as const, check: "F1", status: "pass" as const, detail: "", refs: [] },
      { cls: "E" as const, check: "E2", status: "pass" as const, detail: "", refs: [] },
      { cls: "J" as const, check: "J3", status: "judgment" as const, detail: "", refs: [] },
    ];
    const text = JSON.stringify(approvalBlocks("dec_1", creditMemo(), marks, "Quote matches the email."));
    expect(text).toContain("$1,200.00");
    expect(text).toContain("F 1/1 · E 1/1 · P 0/0 · J 0/1");
    expect(text).toContain("10% off the platform fee");
    expect(text).toContain("Controller agent: Quote matches the email.");
  });
});

describe("controller reply parsing", () => {
  it("reads a well-formed verdict and treats anything else as not agreeing", () => {
    expect(parseVerdict('{"agrees":true,"note":"fine","concerns":[]}')).toMatchObject({ agrees: true });
    expect(parseVerdict("I think it looks good!")).toMatchObject({ agrees: false, concerns: ["unparsable reply"] });
    expect(parseVerdict('{"agrees":"yes"}').agrees).toBe(false);
  });
});

describe("Slack refuses a whole message over one long field, so nothing a model writes can be too long", () => {
  it("clips a button label to 75 characters and a section to under 3,000", () => {
    const long = "x".repeat(5000);
    const blocks = escalationBlocks("esc_1", {
      what_happened: long, what_was_checked: [{ source: "mail_search", query: "credit", hits: 0 }], what_is_unknown: long,
      treatments: [{ id: "credit_memo", label: "y".repeat(200) }, { id: "chase", label: "Chase it" }],
    });
    const texts = JSON.stringify(blocks);
    const button = (blocks[3] as { elements: { text: { text: string } }[] }).elements[0]!.text.text;
    expect(button.length).toBeLessThanOrEqual(75);
    for (const b of blocks.slice(0, 3)) expect((b as { text: { text: string } }).text.text.length).toBeLessThan(3000);
    expect(texts).toContain("answer:credit_memo");
  });
});
