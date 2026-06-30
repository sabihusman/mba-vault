import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK } from "./retrieval";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [2, 0, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("topK", () => {
  const items = [
    { vector: [1, 0], data: "east" },
    { vector: [0, 1], data: "north" },
    { vector: [0.9, 0.1], data: "east-ish" },
  ];

  it("returns the closest items, best first", () => {
    const result = topK([1, 0], items, 2);
    expect(result.map((r) => r.item)).toEqual(["east", "east-ish"]);
  });

  it("never returns more than k", () => {
    expect(topK([1, 0], items, 1)).toHaveLength(1);
  });
});
