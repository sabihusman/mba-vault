import { describe, it, expect } from "vitest";
import { consumeLoginAttempt, resetLoginAttempts } from "./ratelimit";

describe("login rate limiting", () => {
  it("blocks a username after 5 attempts, and resets on success", async () => {
    const user = "rate-user-a";
    // Vary the IP each attempt so the per-IP limiter isn't what trips.
    for (let i = 0; i < 5; i++) {
      expect((await consumeLoginAttempt(`ip-a-${i}`, user)).blocked).toBe(false);
    }
    const sixth = await consumeLoginAttempt("ip-a-x", user);
    expect(sixth.blocked).toBe(true);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);

    await resetLoginAttempts("ip-a-x", user);
    expect((await consumeLoginAttempt("ip-a-y", user)).blocked).toBe(false);
  });

  it("blocks an IP after 10 attempts", async () => {
    const ip = "203.0.113.7";
    // Vary the username each attempt so the per-user limiter isn't what trips.
    for (let i = 0; i < 10; i++) {
      expect((await consumeLoginAttempt(ip, `rate-ipuser-${i}`)).blocked).toBe(false);
    }
    expect((await consumeLoginAttempt(ip, "rate-ipuser-z")).blocked).toBe(true);
  });
});
