import { afterEach, describe, expect, it } from "vitest";
// Relative import — vitest has no "@/" alias (same convention as store.test.ts).
import { envCap, envCapOptions } from "./env-caps";

const VARS = ["STALENESS_COST_CAP_USD", "STALENESS_STEP_CAP", "TEST_CAP"] as const;

afterEach(() => {
  for (const v of VARS) delete process.env[v];
});

describe("envCap", () => {
  it("returns undefined when the var is unset or empty (defaults apply)", () => {
    expect(envCap("TEST_CAP")).toBeUndefined();
    process.env.TEST_CAP = "";
    expect(envCap("TEST_CAP")).toBeUndefined();
  });

  it("parses valid positive numbers, including fractional cost caps", () => {
    process.env.TEST_CAP = "2.5";
    expect(envCap("TEST_CAP")).toBe(2.5);
    process.env.TEST_CAP = "100";
    expect(envCap("TEST_CAP")).toBe(100);
  });

  it("rejects garbage, zero, and negatives — NaN must never reach the loop's >= checks, which would silently disable the cap", () => {
    for (const bad of ["abc", "NaN", "Infinity", "0", "-1"]) {
      process.env.TEST_CAP = bad;
      expect(envCap("TEST_CAP"), `value: ${bad}`).toBeUndefined();
    }
  });
});

describe("envCapOptions", () => {
  it("returns all-undefined when nothing is set — bit-for-bit today's behavior", () => {
    expect(envCapOptions()).toEqual({ costCapUsd: undefined, stepCap: undefined });
  });

  it("reads the namespaced vars", () => {
    process.env.STALENESS_COST_CAP_USD = "0.5";
    process.env.STALENESS_STEP_CAP = "20";
    expect(envCapOptions()).toEqual({ costCapUsd: 0.5, stepCap: 20 });
  });
});
