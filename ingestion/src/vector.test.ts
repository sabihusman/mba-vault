import { describe, it, expect } from "vitest";
import { l2normalize } from "./vector";

describe("l2normalize", () => {
  it("scales a vector to unit length", () => {
    const out = l2normalize([3, 4]); // norm 5
    expect(out[0]!).toBeCloseTo(0.6, 6);
    expect(out[1]!).toBeCloseTo(0.8, 6);
    const len = Math.hypot(out[0]!, out[1]!);
    expect(len).toBeCloseTo(1, 6);
  });

  it("returns a Float32Array of the same length", () => {
    const out = l2normalize([1, 2, 3, 4]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(4);
  });

  it("leaves an all-zero vector as zeros (no divide-by-zero)", () => {
    const out = l2normalize([0, 0, 0]);
    expect([...out]).toEqual([0, 0, 0]);
  });
});
