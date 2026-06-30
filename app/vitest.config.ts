import { defineConfig } from "vitest/config";

// Unit tests only. Playwright E2E lives in ./e2e and is run separately.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
