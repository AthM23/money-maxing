import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_TOOLS } from "../toolset.js";

describe("tool schemas the Agent SDK will accept", () => {
  it("every tool converts to JSON Schema and none uses a free-form record (propertyNames), which empties the SDK's tool list", () => {
    for (const tool of ALL_TOOLS) {
      const schema = JSON.stringify(z.toJSONSchema(z.object(tool.input.shape)));
      expect(schema, tool.name).not.toContain("propertyNames");
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
