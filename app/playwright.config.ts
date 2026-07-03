import { defineConfig, devices } from "@playwright/test";

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
    // Auth is now required for the app to render. These are TEST-ONLY credentials
    // (not the real box secrets) so e2e is self-contained locally and in CI. The
    // password behind AUTH_PASSWORD_HASH is "e2e-test-password"; TOTP_SECRET is a
    // well-known base32 test vector. The login-flow tests (PR5) build on these.
    env: {
      SESSION_SECRET: "e2e-test-session-secret-at-least-32-characters-long",
      AUTH_USERNAME: "sabih",
      AUTH_PASSWORD_HASH:
        "$argon2id$v=19$m=19456,t=2,p=1$+yrPtq1oEPQpq3iql9X58A$TtwyJ0vSqIUn3eoXFJb3aaNsaUNSTd8V0WuFGUb7ZZ8",
      TOTP_SECRET: "JBSWY3DPEHPK3PXP",
    },
  },
});
