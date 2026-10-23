import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
  },
});
