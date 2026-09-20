import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "eval/**/*.test.ts", "workspace/**/*.test.ts"], environment: "node" },
});
