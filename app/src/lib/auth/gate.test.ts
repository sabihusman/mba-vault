import { describe, it, expect, beforeAll } from "vitest";
import { sealData } from "iron-session";
import { hasValidSession } from "./gate";
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
