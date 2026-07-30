import { describe, expect, it } from "vitest";
// Relative imports — vitest has no "@/" alias (repo convention).
import { searchVault, formatHits, validateQuery, MAX_QUERY_CHARS, type SearchVaultDeps } from "./search-vault";
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
    const hits = await searchVault(deps([1, 0]), "positioning", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].citation).toBe("Marketing / deck.pptx (slide 12)");
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[0].text).toContain("Positioning");
    expect(hits[1].citation).toBe("Finance / notes.pdf (p. 3)");
  });

  it("respects k", async () => {
    const hits = await searchVault(deps([0, 1]), "npv", 1);
    expect(hits).toHaveLength(1);
    expect(hits[0].course).toBe("Finance");
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
  it("numbers hits with citation labels and scores", async () => {
    const hits = await searchVault(deps([1, 0]), "positioning", 2);
    const text = formatHits(hits);
    expect(text).toContain("[1] Marketing / deck.pptx (slide 12) (score 1.000)");
    expect(text).toContain("[2] Finance / notes.pdf (p. 3)");
    expect(text).toContain("owning a space");
  });

  it("says so when nothing matched", () => {
    expect(formatHits([])).toBe("No matching coursework found.");
  });
});
