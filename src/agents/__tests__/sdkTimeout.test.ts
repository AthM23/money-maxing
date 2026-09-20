import { describe, expect, it } from "vitest";
import { withinSeconds } from "../sdk.js";

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
