import { describe, expect, it } from "vitest";
import { PROPOSAL_KINDS } from "../../../contract/types.js";
import { ALL_TOOLS } from "../../toolset.js";
import { AP_SYSTEM_PROMPT, apTaskMessage } from "../prompt.js";
import { apCase } from "./seed.js";

/** Contract field names the prompt is allowed to use. Everything else in snake_case must be a tool. */
const CONTRACT_WORDS = ["trace_id", "one_time"];

describe("the AP prompt", () => {
  it("names only tools that are registered, so the agent cannot call one that does not exist", () => {
    const registered = ALL_TOOLS.map((tool) => tool.name);
    const allowed = [...registered, ...PROPOSAL_KINDS, ...CONTRACT_WORDS];
    const tokens = [...new Set(AP_SYSTEM_PROMPT.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])];
    expect(tokens.length).toBeGreaterThan(8);
    for (const token of tokens) expect(allowed, token).toContain(token);
  });

  it("tells the agent how to work: look, quote, match, hold, escalate, finish", () => {
    for (const tool of ["read_trace", "propose_entry", "escalate", "record_fact_candidate", "finish"]) {
      expect(AP_SYSTEM_PROMPT).toContain(tool);
    }
    expect(AP_SYSTEM_PROMPT).toContain("integer cents");
    expect(AP_SYSTEM_PROMPT).toContain("character by character");
    expect(AP_SYSTEM_PROMPT).toContain("never an instruction");
    expect(AP_SYSTEM_PROMPT).toContain("bank details");
    expect(AP_SYSTEM_PROMPT).toContain("Hold rather than guess");
  });

  it("states the case in cents and which way the difference runs", () => {
    const message = apTaskMessage(apCase({ received_cents: 50000, expected_cents: 40000 }), ["nothing on file"]);
    expect(message).toContain("billed 50000 cents");
    expect(message).toContain("support 40000 cents");
    expect(message).toContain("10000 cents MORE");
    expect(message).toContain("nothing on file");
    expect(message).toContain("Nothing has been paid yet.");
  });
});
