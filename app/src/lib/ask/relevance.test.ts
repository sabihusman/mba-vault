import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeRelevanceStats,
  logRelevanceStats,
  relevanceThreshold,
  passesRelevanceGate,
  RELEVANCE_THRESHOLD_ENV,
  DEFAULT_RELEVANCE_THRESHOLD,
} from "./relevance";
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

describe("relevanceThreshold", () => {
  afterEach(() => {
    delete process.env[RELEVANCE_THRESHOLD_ENV];
  });

  it("falls back to the calibrated default when unset", () => {
    delete process.env[RELEVANCE_THRESHOLD_ENV];
    expect(relevanceThreshold()).toBe(DEFAULT_RELEVANCE_THRESHOLD);
  });

  it("uses a valid override", () => {
    process.env[RELEVANCE_THRESHOLD_ENV] = "0.7";
    expect(relevanceThreshold()).toBe(0.7);
  });

  // A garbage value must fall back to the default, never pass NaN through —
  // NaN comparisons are always false, which would silently let every query
  // through the gate regardless of score (mirrors envCap's reasoning in
  // lib/staleness/env-caps.ts).
  it.each(["not-a-number", "", "  ", "1.5", "-2"])(
    "falls back to the default for an invalid/out-of-range value %j",
    (raw) => {
      process.env[RELEVANCE_THRESHOLD_ENV] = raw;
      expect(relevanceThreshold()).toBe(DEFAULT_RELEVANCE_THRESHOLD);
    },
  );

  it("accepts the boundary values -1 and 1", () => {
    process.env[RELEVANCE_THRESHOLD_ENV] = "1";
    expect(relevanceThreshold()).toBe(1);
    process.env[RELEVANCE_THRESHOLD_ENV] = "-1";
    expect(relevanceThreshold()).toBe(-1);
  });
});

describe("passesRelevanceGate", () => {
  it("fails a null top score (no hits at all)", () => {
    expect(passesRelevanceGate(null, 0.58)).toBe(false);
  });

  it("fails a score strictly below the threshold", () => {
    expect(passesRelevanceGate(0.557, 0.58)).toBe(false);
  });

  it("passes a score at or above the threshold", () => {
    expect(passesRelevanceGate(0.58, 0.58)).toBe(true);
    expect(passesRelevanceGate(0.9, 0.58)).toBe(true);
  });

  it("uses relevanceThreshold() as the default when no threshold is passed", () => {
    expect(passesRelevanceGate(DEFAULT_RELEVANCE_THRESHOLD - 0.01)).toBe(false);
    expect(passesRelevanceGate(DEFAULT_RELEVANCE_THRESHOLD)).toBe(true);
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
