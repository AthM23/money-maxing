import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../../../runtime/db.js";
import { readControlTotals } from "../../../runtime/kernelContext.js";
import { main } from "../cli.js";

const dbPath = join(tmpdir(), `footnote-scenario-cli-${process.pid}.db`);

function cleanUp(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
}

afterEach(cleanUp);

describe("the scenario CLI, seeded onto a database file", () => {
  it("seeds a fresh database whose books tie", () => {
    expect(main([dbPath])).toBe(0);
    const db = openDb(dbPath);
    const totals = readControlTotals(db);
    expect(totals.ar_gl_cents).toBe(totals.ar_subledger_cents);
    expect(totals.ar_gl_cents).toBeGreaterThan(0);
  });

  it("refuses a second run on the same path", () => {
    expect(main([dbPath])).toBe(0);
    expect(main([dbPath])).toBe(1);
  });
});
