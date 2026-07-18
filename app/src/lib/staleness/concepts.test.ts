import { describe, it, expect } from "vitest";
import { sampleCourseText, bootstrapConcepts, mergeConcepts, SAMPLE_CHAR_BUDGET } from "./concepts";
import type { ChunkMeta } from "../ask/index-store";
import type { Concept } from "./types";
import type { ConceptExtractor, ExtractedConcept } from "./gemini";

function chunk(course: string, file: string, text: string): ChunkMeta {
  return { id: `${file}::${text.slice(0, 8)}`, course, file, loc: { kind: "page", index: 1 }, text };
}

describe("sampleCourseText", () => {
  it("only samples chunks from the requested course", () => {
    const chunks = [chunk("Marketing", "a.pdf", "marketing text"), chunk("Finance", "b.pdf", "finance text")];
    expect(sampleCourseText(chunks, "Marketing")).toBe("marketing text");
  });

  it("round-robins across files instead of exhausting the first file", () => {
    const chunks = [
      chunk("Strategy", "a.pdf", "A1"),
      chunk("Strategy", "a.pdf", "A2"),
      chunk("Strategy", "b.pdf", "B1"),
    ];
    // round 0: A1, B1 — round 1: A2. So B1 appears before A2.
    const sample = sampleCourseText(chunks, "Strategy");
    expect(sample.indexOf("B1")).toBeLessThan(sample.indexOf("A2"));
  });

  it("stops at the char budget rather than including the whole corpus", () => {
    const bigText = "x".repeat(SAMPLE_CHAR_BUDGET * 3);
    const chunks = [chunk("Ops", "a.pdf", bigText)];
    expect(sampleCourseText(chunks, "Ops").length).toBeLessThanOrEqual(500); // CHARS_PER_FILE cap on one chunk
  });

  it("returns an empty string when the course has no chunks", () => {
    expect(sampleCourseText([], "Nonexistent")).toBe("");
  });
});

describe("bootstrapConcepts", () => {
  it("proposes concepts per course, marked pending with no lastCheckedAt", async () => {
    const chunks = [chunk("Marketing", "a.pdf", "the 4 Ps of marketing")];
    const extractor: ConceptExtractor = {
      async extractConcepts(course: string): Promise<ExtractedConcept[]> {
        expect(course).toBe("Marketing");
        return [{ name: "4 Ps", description: "Product, Price, Place, Promotion." }];
      },
    };

    const result = await bootstrapConcepts(extractor, chunks);
    expect(result.coursesSkipped).toEqual([]);
    expect(result.proposed).toEqual([
      {
        id: "marketing-4-ps",
        name: "4 Ps",
        course: "Marketing",
        description: "Product, Price, Place, Promotion.",
        status: "pending",
        lastCheckedAt: null,
      },
    ]);
  });

  it("skips courses with no sampleable text without calling the extractor", async () => {
    let calls = 0;
    const extractor: ConceptExtractor = {
      async extractConcepts(): Promise<ExtractedConcept[]> {
        calls++;
        return [];
      },
    };
    // No chunks at all → no courses to iterate, so nothing skipped either.
    const result = await bootstrapConcepts(extractor, []);
    expect(result).toEqual({ proposed: [], coursesSkipped: [] });
    expect(calls).toBe(0);
  });
});

describe("mergeConcepts", () => {
  const reviewed: Concept = {
    id: "marketing-4-ps",
    name: "4 Ps",
    course: "Marketing",
    description: "old description",
    status: "active",
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
  };

  it("leaves an already-known id untouched, even if the proposed description differs", () => {
    const proposed: Concept[] = [{ ...reviewed, description: "new description", status: "pending", lastCheckedAt: null }];
    expect(mergeConcepts([reviewed], proposed)).toEqual([reviewed]);
  });

  it("appends a genuinely new concept as pending", () => {
    const fresh: Concept = {
      id: "marketing-nps",
      name: "NPS",
      course: "Marketing",
      description: "Net Promoter Score.",
      status: "pending",
      lastCheckedAt: null,
    };
    expect(mergeConcepts([reviewed], [fresh])).toEqual([reviewed, fresh]);
  });
});
