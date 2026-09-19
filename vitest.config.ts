import { defineConfig } from 'vitest/config';

// Unit tests live next to the code as src/**/*.test.ts.
// `tests/` at the repo root is the 115-case edge-case corpus, not a vitest directory.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
    environment: 'node',
  },
});
