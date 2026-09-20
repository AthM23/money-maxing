import { describe, expect, it } from "vitest";
import { ACTIONS } from "../actions.js";
import { assertAllowed, listening } from "../publicMode.js";

describe("a public copy of the workspace can be read and cannot be written or billed", () => {
  it("listens beyond this machine only when it is read-only", () => {
    expect(listening({})).toEqual({ host: "127.0.0.1", readOnly: false });
    expect(listening({ WORKSPACE_PUBLIC: "1" })).toEqual({ host: "0.0.0.0", readOnly: true });
    expect(() => listening({ HOST: "0.0.0.0" })).toThrow(/never bound beyond this machine/);
  });

  it("refuses every action that writes or spends, by name, and lets the reads through", () => {
    const refused = Object.keys(ACTIONS).filter((name) => {
      try { assertAllowed(name, {}, true); return false; } catch { return true; }
    });
    expect(refused.sort()).toEqual(["accruals", "answer", "approve", "decide", "fact", "learn", "policy", "run"]);
    expect(() => assertAllowed("ask", { model: "claude-haiku-4-5" }, true)).toThrow(/code only/);
    expect(() => assertAllowed("ask", { model: "code" }, true)).not.toThrow();
    // On the team's own machine nothing is refused here: the approval matrix and the kernel decide.
    expect(() => assertAllowed("approve", {}, false)).not.toThrow();
  });
});
