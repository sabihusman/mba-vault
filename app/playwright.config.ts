import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// A fresh session secret per test run, generated (not hard-coded) so no secret
// literal lives in the repo. PR4's e2e only renders /login and exercises the
// gate, so this is the only auth env the app needs to boot. The login-flow tests
// (PR5) will add generated AUTH_* credentials via a global setup.
const E2E_SESSION_SECRET = randomBytes(32).toString("base64url");

/**
 * E2E config. We test on a desktop viewport AND a mobile viewport (Pixel 5) so
 * responsiveness is covered from day one, as required by the architecture.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run dev",
    // Probe /vault/login: it returns 200 directly, whereas the gated app root now
    // 307-redirects to login, which is a noisier readiness signal.
    url: "http://localhost:3000/vault/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // The app needs a session secret to render /login and run the gate.
    env: {
      SESSION_SECRET: E2E_SESSION_SECRET,
    },
  },
});
