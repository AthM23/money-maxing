import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv.js";

describe("parseCsv", () => {
  it("keeps commas inside quoted fields intact", () => {
    const text = 'id,title\nA-06,"One-to-many: one payment run, three bank debits"\n';
    expect(parseCsv(text)).toEqual([
      ["id", "title"],
      ["A-06", "One-to-many: one payment run, three bank debits"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const text = 'id,note\nA-1,"she said ""hello"""\n';
    expect(parseCsv(text)).toEqual([
      ["id", "note"],
      ["A-1", 'she said "hello"'],
    ]);
  });

  it("handles a final row with no trailing newline", () => {
    const text = "id,title\nA-1,first\nA-2,second";
    expect(parseCsv(text)).toEqual([
      ["id", "title"],
      ["A-1", "first"],
      ["A-2", "second"],
    ]);
  });

  it("does not emit a phantom row for a trailing newline at EOF", () => {
    const text = "id,title\nA-1,first\n";
    expect(parseCsv(text)).toEqual([
      ["id", "title"],
      ["A-1", "first"],
    ]);
  });

  it("rejects a malformed row: an unterminated quoted field", () => {
    const text = 'id,title\nA-1,"never closed\n';
    expect(() => parseCsv(text)).toThrow(/unterminated/i);
  });
});
