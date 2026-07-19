import { describe, it, expect } from "vitest";
import { consumeStalenessRun } from "./ratelimit";

describe("staleness run rate limiting", () => {
  it("allows 2 runs per IP per hour, then blocks the 3rd", async () => {
    const ip = "198.51.100.5";
    expect((await consumeStalenessRun(ip)).blocked).toBe(false);
    expect((await consumeStalenessRun(ip)).blocked).toBe(false);
    const third = await consumeStalenessRun(ip);
    expect(third.blocked).toBe(true);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks each IP independently", async () => {
    const ipA = "198.51.100.6";
    const ipB = "198.51.100.7";
    expect((await consumeStalenessRun(ipA)).blocked).toBe(false);
    expect((await consumeStalenessRun(ipA)).blocked).toBe(false);
    expect((await consumeStalenessRun(ipA)).blocked).toBe(true);
    // A different IP still has its own fresh allowance.
    expect((await consumeStalenessRun(ipB)).blocked).toBe(false);
  });
});
