import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t ")).toEqual([]);
  });

  it("keeps short text in a single chunk", () => {
    expect(chunkText("alpha beta gamma", { targetWords: 450 })).toEqual([
      "alpha beta gamma",
    ]);
  });

  it("splits long text into multiple chunks", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { targetWords: 400, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("overlaps consecutive chunks by the requested word count", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { targetWords: 400, overlap: 50 });
    const tailOfFirst = chunks[0]!.split(" ").slice(-50);
    const headOfSecond = chunks[1]!.split(" ").slice(0, 50);
    expect(headOfSecond).toEqual(tailOfFirst);
  });

  it("rejects an overlap that is not smaller than the target", () => {
    expect(() => chunkText("a b c", { targetWords: 10, overlap: 10 })).toThrow();
  });
});
