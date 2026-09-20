import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli-args.js";

describe("parseCliArgs", () => {
  it("defaults to stage all, no baseline, seed 0, no outcomes or pack filter", () => {
    expect(parseCliArgs([])).toEqual({ stage: "all", baseline: false, seed: 0 });
  });

  it("parses --stage min", () => {
    expect(parseCliArgs(["--stage", "min"]).stage).toBe("min");
  });

  it("rejects an invalid --stage value", () => {
    expect(() => parseCliArgs(["--stage", "bogus"])).toThrow(/--stage/);
  });

  it("parses --baseline as a boolean flag with no value", () => {
    expect(parseCliArgs(["--baseline"]).baseline).toBe(true);
  });

  it("parses --seed as an integer", () => {
    expect(parseCliArgs(["--seed", "7"]).seed).toBe(7);
  });

  it("rejects a non-integer --seed", () => {
    expect(() => parseCliArgs(["--seed", "abc"])).toThrow(/--seed/);
  });

  it("parses --outcomes and --pack", () => {
    const options = parseCliArgs(["--outcomes", "runs/x.json", "--pack", "ap"]);
    expect(options.outcomesPath).toBe("runs/x.json");
    expect(options.pack).toBe("ap");
  });

  it("rejects an unknown flag", () => {
    expect(() => parseCliArgs(["--nope"])).toThrow(/unknown argument/);
  });

  it("rejects a flag missing its value", () => {
    expect(() => parseCliArgs(["--seed"])).toThrow(/requires a value/);
  });

  it("combines multiple flags", () => {
    const options = parseCliArgs(["--stage", "min", "--baseline", "--seed", "3"]);
    expect(options).toEqual({ stage: "min", baseline: true, seed: 3 });
  });
});
