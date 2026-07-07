import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// A generated (not hard-coded) session secret so no secret literal lives in the
// repo. Playwright re-loads this config in every worker process, so we must
// generate ONCE in the main process and let workers inherit the value via env —
// otherwise each worker would pick a different secret and seal cookies the app
// can't unseal. The browse tests read E2E_SESSION_SECRET to mint a valid session.
const E2E_SESSION_SECRET =
  process.env.E2E_SESSION_SECRET ?? randomBytes(32).toString("base64url");
process.env.E2E_SESSION_SECRET = E2E_SESSION_SECRET;

// Point the app at the committed fixture tree instead of the box's /data.
// Playwright runs this config with cwd = the app workspace, so resolve from there
// (avoids import.meta, which breaks Playwright's CJS config loader).
const E2E_DATA_DIR = resolve(process.cwd(), "test-fixtures/data");

// Writable state dir for the Ask-history / resume-card tests. Shared with the test
// runner via env (like the session secret) so a spec can seed history.jsonl at the
// same path the app reads from. Gitignored, not committed.
const E2E_STATE_DIR = resolve(process.cwd(), "test-fixtures/state");
process.env.STATE_DIR = E2E_STATE_DIR;

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
    // The app needs a session secret to render /login and run the gate, and a
    // data dir to serve browse from the fixtures.
    env: {
      SESSION_SECRET: E2E_SESSION_SECRET,
      DATA_DIR: E2E_DATA_DIR,
      STATE_DIR: E2E_STATE_DIR,
    },
  },
});
