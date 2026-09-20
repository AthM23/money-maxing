import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../run.js";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("main: exit codes", () => {
  it("exits 0 when nothing has been run (notImplementedSut, no false auto-posts)", async () => {
    expect(await main(["--stage", "min"])).toBe(0);
  });

  it("exits 2 when a recorded run contains a false auto-post", async () => {
    const outcomesPath = path.join(FIXTURES_DIR, "false-auto-post-outcomes.json");
    expect(await main(["--outcomes", outcomesPath])).toBe(2);
  });

  it("exits 0 for a clean recorded run", async () => {
    const outcomesPath = path.join(FIXTURES_DIR, "clean-outcomes.json");
    expect(await main(["--outcomes", outcomesPath])).toBe(0);
  });

  it("exits 1 on a harness error (bad CLI arguments)", async () => {
    expect(await main(["--stage", "bogus"])).toBe(1);
  });

  it("exits 1 when the outcomes file doesn't exist", async () => {
    const missingPath = path.join(FIXTURES_DIR, "does-not-exist.json");
    expect(await main(["--outcomes", missingPath])).toBe(1);
  });
});
