import { describe, expect, it } from "vitest";
import { usageWithin, withinSeconds, type SdkStream } from "../sdk.js";

describe("a model call that hangs cannot hold the worker", () => {
  it("gives up on the clock, stops the work, and the caller moves on", async () => {
    let stopped = false;
    const never = new Promise<string>(() => undefined);
    expect(await withinSeconds(0.05, never, () => { stopped = true; })).toBe("timed_out");
    expect(stopped).toBe(true);
  });

  it("returns the work when it finishes first, and stops nothing", async () => {
    let stopped = false;
    expect(await withinSeconds(5, Promise.resolve({ cost: 1, turns: 2 }), () => { stopped = true; })).toEqual({ cost: 1, turns: 2 });
    expect(stopped).toBe(false);
  });

  it("a stream that rejects after being stopped does not surface as an unhandled rejection", async () => {
    let reject: (e: Error) => void = () => undefined;
    const work = new Promise<string>((_, r) => { reject = r; });
    expect(await withinSeconds(0.02, work, () => reject(new Error("aborted")))).toBe("timed_out");
  });
});

/** A stand-in for the SDK's stream: some turns, then silence until it is asked to stop, then (perhaps) its bill. */
function fakeStream(turns: number, onInterrupt: "reports" | "stays silent"): SdkStream & { interrupted: boolean } {
  let release: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => { release = resolve; });
  const stream = {
    interrupted: false,
    interrupt: async () => { stream.interrupted = true; release(); },
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < turns; i++) yield { type: "assistant" };
      await stopped;
      if (onInterrupt === "stays silent") await new Promise(() => undefined);
      yield { type: "result", total_cost_usd: 0.0421, num_turns: turns };
    },
  };
  return stream;
}

describe("a model turn that runs out of time still says what it used", () => {
  it("is asked to stop first, and its bill is kept when it reports one", async () => {
    let cutOff = false;
    const stream = fakeStream(3, "reports");
    expect(await usageWithin(stream, 0.03, 1, () => { cutOff = true; })).toEqual({ cost: 0.0421, turns: 3, timed_out: true });
    expect(stream.interrupted).toBe(true);
    expect(cutOff).toBe(false);
  });

  it("is cut off if it says nothing, keeping the turns that were counted and an unknown cost", async () => {
    let cutOff = false;
    expect(await usageWithin(fakeStream(2, "stays silent"), 0.03, 0.05, () => { cutOff = true; })).toEqual({ cost: 0, turns: 2, timed_out: true });
    expect(cutOff).toBe(true);
  });

  it("a run that finishes in time is not interrupted", async () => {
    const stream = { interrupted: false, interrupt: async () => { stream.interrupted = true; },
      async *[Symbol.asyncIterator]() { yield { type: "assistant" }; yield { type: "result", total_cost_usd: 0.01, num_turns: 1 }; } };
    expect(await usageWithin(stream, 5, 1, () => undefined)).toEqual({ cost: 0.01, turns: 1, timed_out: false });
    expect(stream.interrupted).toBe(false);
  });
});
