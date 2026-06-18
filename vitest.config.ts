import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    hookTimeout: 30_000,
    testTimeout: 15_000,
    include: ["tests/**/*.test.ts"],
  },
});
