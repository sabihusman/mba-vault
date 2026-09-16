import { describe, it, expect, vi, afterEach } from "vitest";
import { computeRelevanceStats, logRelevanceStats } from "./relevance";
import type { SearchHit } from "./search";
import type { ChunkMeta } from "./index-store";

function hit(score: number, text: string): SearchHit {
  const chunk: ChunkMeta = { id: "x", course: "C", file: "C/x.pdf", loc: { kind: "file" }, text };
  return { chunk, score };
}

describe("computeRelevanceStats", () => {
  it("returns all-null stats for an empty hit list", () => {
    expect(computeRelevanceStats([])).toEqual({
      hitCount: 0,
      topScore: null,
      spread: null,
      topChunkChars: null,
    });
  });

  it("reports null spread for a single hit (nothing to spread against)", () => {
    expect(computeRelevanceStats([hit(0.8, "hello")])).toEqual({
      hitCount: 1,
      topScore: 0.8,
      spread: null,
      topChunkChars: 5,
    });
  });

  it("computes topScore/spread/topChunkChars from the first and last of a sorted list", () => {
    const hits = [hit(0.9, "abcde"), hit(0.7, "middle"), hit(0.5, "z")];
    expect(computeRelevanceStats(hits)).toEqual({
      hitCount: 3,
      topScore: 0.9,
      spread: 0.4, // 0.9 - 0.5
      topChunkChars: 5, // "abcde"
    });
  });
});

describe("logRelevanceStats", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a single structured line containing the stats and no extra fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logRelevanceStats({ hitCount: 4, topScore: 0.71, spread: 0.12, topChunkChars: 900 });

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(logged).toEqual({
      event: "ask_relevance",
      hitCount: 4,
      topScore: 0.71,
      spread: 0.12,
      topChunkChars: 900,
    });
  });
});
