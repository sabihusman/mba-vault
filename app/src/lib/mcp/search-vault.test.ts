import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
// Relative imports — vitest has no "@/" alias (repo convention).
import {
  searchVault,
  formatHits,
  validateQuery,
  clampCount,
  NOT_RELEVANT_MESSAGE,
  MAX_QUERY_CHARS,
  MCP_TOP_K,
  MCP_MAX_K,
  type SearchVaultDeps,
} from "./search-vault";
import { loadIndex } from "../ask/index-store";
import type { ChunkMeta, LoadedIndex } from "../ask/index-store";

// A tiny 2-dim fake index: two orthogonal unit vectors, so which chunk wins is
// fully determined by the fake query embedding.
function fakeIndex(): LoadedIndex {
  const chunks: ChunkMeta[] = [
    {
      id: "a",
      course: "Marketing",
      file: "Marketing/deck.pptx",
      loc: { kind: "slide", index: 12 },
      text: "Positioning is about owning a space in the customer's mind.",
    },
    {
      id: "b",
      course: "Finance",
      file: "Finance/notes.pdf",
      loc: { kind: "page", index: 3 },
      text: "NPV discounts future cash flows to present value.",
    },
  ];
  return {
    manifest: { model: "fake", dims: 2, count: 2, createdAt: "", files: {} },
    chunks,
    vectors: new Float32Array([1, 0, 0, 1]),
  };
}

function deps(queryVector: number[]): SearchVaultDeps {
  return {
    getIndex: async () => fakeIndex(),
    embedQuery: async () => Float32Array.from(queryVector),
  };
}

describe("searchVault", () => {
  it("returns hits ranked by cosine similarity with human-readable citations", async () => {
    const outcome = await searchVault(deps([1, 0]), "positioning", 2);
    expect(outcome.relevant).toBe(true);
    expect(outcome.hits).toHaveLength(2);
    expect(outcome.hits[0].citation).toBe("Marketing / deck.pptx (slide 12)");
    expect(outcome.hits[0].score).toBeCloseTo(1);
    expect(outcome.hits[0].text).toContain("Positioning");
    expect(outcome.hits[1].citation).toBe("Finance / notes.pdf (p. 3)");
  });

  it("respects k", async () => {
    const outcome = await searchVault(deps([0, 1]), "npv", 1);
    expect(outcome.hits).toHaveLength(1);
    expect(outcome.hits[0].course).toBe("Finance");
  });
});

// A 3-dim fake index (two chunks on the first two axes, third axis unused by
// any chunk) so an "off-corpus" query can score near zero against every
// chunk — the 2-dim fakeIndex above can't express that: with only two
// orthogonal chunk vectors spanning the whole space, cos²+sin²=1 means the
// best-matching chunk is NEVER below ~0.707 similarity for any query.
function fakeIndex3d(): LoadedIndex {
  const chunks: ChunkMeta[] = [
    { id: "a", course: "Marketing", file: "Marketing/deck.pptx", loc: { kind: "slide", index: 12 }, text: "Positioning." },
    { id: "b", course: "Finance", file: "Finance/notes.pdf", loc: { kind: "page", index: 3 }, text: "NPV." },
  ];
  return {
    manifest: { model: "fake", dims: 3, count: 2, createdAt: "", files: {} },
    chunks,
    vectors: new Float32Array([1, 0, 0, 0, 1, 0]),
  };
}

describe("searchVault — relevance gate (phase 2)", () => {
  it("gates a query whose best match is below the threshold: no hits, relevant: false", async () => {
    const off = await searchVault(
      { getIndex: async () => fakeIndex3d(), embedQuery: async () => new Float32Array([0, 0, 1]) },
      "completely unrelated topic",
      2,
    );
    expect(off.relevant).toBe(false);
    expect(off.hits).toEqual([]);
  });

  it("passes a query whose best match clears the threshold, exactly as before", async () => {
    const on = await searchVault(deps([1, 0]), "positioning", 2);
    expect(on.relevant).toBe(true);
    expect(on.hits).toHaveLength(2);
  });

  it("respects the ASK_RELEVANCE_THRESHOLD env override", async () => {
    // similarity of [1,1](normalized) vs [1,0] is ~0.707 — passes the 0.58
    // default but fails a stricter override.
    process.env.ASK_RELEVANCE_THRESHOLD = "0.9";
    try {
      const outcome = await searchVault(deps([1, 1]), "borderline", 2);
      expect(outcome.relevant).toBe(false);
    } finally {
      delete process.env.ASK_RELEVANCE_THRESHOLD;
    }
  });
});

describe("searchVault — off-corpus, against the real committed fixture index", () => {
  const FIXTURE_INDEX = fileURLToPath(new URL("../../../test-fixtures/data/.index", import.meta.url));

  it("gates an off-corpus query against the on-disk 4-chunk synthetic fixture", async () => {
    const index = await loadIndex(FIXTURE_INDEX);
    // The fixture's 4 chunks are orthonormal basis vectors in 4-dim space
    // (see test-fixtures/data/.index/vectors.bin); [1,1,1,1] is equidistant
    // from all of them at cosine 0.5 — comfortably below the 0.58 default,
    // simulating a question with no relevant material in the vault at all.
    const outcome = await searchVault(
      { getIndex: async () => index, embedQuery: async () => new Float32Array([1, 1, 1, 1]) },
      "something with no relevant material in this vault",
      4,
    );
    expect(outcome.relevant).toBe(false);
    expect(outcome.hits).toEqual([]);
  });

  it("still returns the real chunk when the query matches one of the fixture vectors", async () => {
    const index = await loadIndex(FIXTURE_INDEX);
    const outcome = await searchVault(
      { getIndex: async () => index, embedQuery: async () => new Float32Array([1, 0, 0, 0]) },
      "widget economics",
      4,
    );
    expect(outcome.relevant).toBe(true);
    expect(outcome.hits[0].file).toBe("Course A/Week 1/notes.pdf");
  });
});

describe("NOT_RELEVANT_MESSAGE", () => {
  it("states the vault has nothing, forbids answering from training data, and says what to tell the user", () => {
    expect(NOT_RELEVANT_MESSAGE).toMatch(/no material.*relevant/i);
    expect(NOT_RELEVANT_MESSAGE).toMatch(/do not answer from your own knowledge/i);
    expect(NOT_RELEVANT_MESSAGE).toMatch(/tell the user/i);
  });
});

describe("validateQuery", () => {
  it("accepts a normal query", () => {
    expect(validateQuery("what is NPV?")).toBeNull();
  });

  it("rejects empty, whitespace-only, and non-string queries", () => {
    expect(validateQuery("")).toMatch(/non-empty/);
    expect(validateQuery("   ")).toMatch(/non-empty/);
    expect(validateQuery(42)).toMatch(/non-empty/);
    expect(validateQuery(undefined)).toMatch(/non-empty/);
  });

  it("rejects over-long queries", () => {
    expect(validateQuery("x".repeat(MAX_QUERY_CHARS + 1))).toMatch(/too long/);
  });
});

describe("formatHits", () => {
  it("numbers hits with citation labels, scores, and get_document-ready paths", async () => {
    const outcome = await searchVault(deps([1, 0]), "positioning", 2);
    const text = formatHits(outcome.hits);
    expect(text).toContain("[1] Marketing / deck.pptx (slide 12) (score 1.000)");
    expect(text).toContain("path: Marketing/deck.pptx");
    expect(text).toContain("[2] Finance / notes.pdf (p. 3)");
    expect(text).toContain("path: Finance/notes.pdf");
    expect(text).toContain("owning a space");
  });

  it("says so when nothing matched", () => {
    expect(formatHits([])).toBe("No matching coursework found.");
  });
});

describe("clampCount", () => {
  it("defaults to 8 for absent or garbage values", () => {
    expect(clampCount(undefined)).toBe(MCP_TOP_K);
    expect(clampCount(NaN)).toBe(MCP_TOP_K);
    expect(clampCount("12")).toBe(MCP_TOP_K);
  });

  it("clamps to [1, 20] and floors fractions", () => {
    expect(clampCount(12)).toBe(12);
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-5)).toBe(1);
    expect(clampCount(50)).toBe(MCP_MAX_K);
    expect(clampCount(3.9)).toBe(3);
  });
});
