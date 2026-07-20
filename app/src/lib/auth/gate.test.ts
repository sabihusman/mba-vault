import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { sealData } from "iron-session";
import { hasValidSession, hasValidCronSecret, isPublicPath } from "./gate";
import { SESSION_TTL_SECONDS, type SessionData } from "./session";

const SECRET = "unit-test-session-secret-at-least-32-chars-long";

/** Seal a payload the way session.save() would, so the gate can unseal it. */
function seal(data: SessionData, ttl = SESSION_TTL_SECONDS): Promise<string> {
  return sealData(data, { password: SECRET, ttl });
}

describe("hasValidSession", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  it("accepts a cookie sealed with a username", async () => {
    const cookie = await seal({ username: "sabih", loggedInAt: 1 });
    expect(await hasValidSession(cookie)).toBe(true);
  });

  it("rejects a missing cookie", async () => {
    expect(await hasValidSession(undefined)).toBe(false);
    expect(await hasValidSession("")).toBe(false);
  });

  it("rejects a validly-sealed cookie that names no user", async () => {
    const cookie = await seal({ loggedInAt: 1 });
    expect(await hasValidSession(cookie)).toBe(false);
  });

  it("rejects a cookie with an empty username", async () => {
    const cookie = await seal({ username: "", loggedInAt: 1 });
    expect(await hasValidSession(cookie)).toBe(false);
  });

  it("rejects a tampered / garbage cookie", async () => {
    expect(await hasValidSession("not-a-real-seal")).toBe(false);
  });

  it("rejects a cookie sealed with a different secret", async () => {
    const cookie = await sealData({ username: "sabih" }, { password: "a-completely-different-secret-32-chars!!", ttl: SESSION_TTL_SECONDS });
    expect(await hasValidSession(cookie)).toBe(false);
  });

  // NOTE: expiry is enforced by iron-session at unseal time, comparing the seal's
  // creation timestamp against the ttl we pass (SESSION_TTL_SECONDS). Verified
  // manually — not unit-tested here because it can't be exercised without either
  // backdating the seal or a 7-day wait. The "accepts a valid cookie" case proves
  // the matched-ttl round-trip; the E2E suite (PR5) covers real session lifetime.
});

describe("hasValidCronSecret", () => {
  const PATH = "/api/staleness/run";

  afterEach(() => {
    delete process.env.STALENESS_CRON_SECRET;
  });

  it("accepts a header that matches the configured secret, on the right path", () => {
    process.env.STALENESS_CRON_SECRET = "a-long-random-cron-secret";
    expect(hasValidCronSecret(PATH, "a-long-random-cron-secret")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    process.env.STALENESS_CRON_SECRET = "a-long-random-cron-secret";
    expect(hasValidCronSecret(PATH, "guess")).toBe(false);
  });

  it("rejects a missing header", () => {
    process.env.STALENESS_CRON_SECRET = "a-long-random-cron-secret";
    expect(hasValidCronSecret(PATH, undefined)).toBe(false);
    expect(hasValidCronSecret(PATH, null)).toBe(false);
  });

  it("never falls open when STALENESS_CRON_SECRET isn't configured, even with a header present", () => {
    delete process.env.STALENESS_CRON_SECRET;
    expect(hasValidCronSecret(PATH, "anything")).toBe(false);
    expect(hasValidCronSecret(PATH, "")).toBe(false);
  });

  it("is scoped to exactly the staleness-run path — a correct secret elsewhere is rejected", () => {
    process.env.STALENESS_CRON_SECRET = "a-long-random-cron-secret";
    expect(hasValidCronSecret("/api/staleness/status", "a-long-random-cron-secret")).toBe(false);
    expect(hasValidCronSecret("/api/ask", "a-long-random-cron-secret")).toBe(false);
  });

  it("rejects an empty-string secret header even if the configured secret is also falsy-ish", () => {
    process.env.STALENESS_CRON_SECRET = "x";
    expect(hasValidCronSecret(PATH, "")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("allows the login flow, liveness probe, and PWA shell/assets", () => {
    for (const p of [
      "/login",
      "/api/login",
      "/api/logout",
      "/api/health",
      "/offline",
      "/manifest.webmanifest",
      "/sw.js",
      "/icon-192.png",
      "/icon-512.png",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("gates the app root and every protected page/api", () => {
    for (const p of [
      "/",
      "/browse",
      "/ask",
      "/api/ask",
      "/api/health/extra",
      "/loginx",
      "/api/staleness/run",
      "/api/staleness/status",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});
