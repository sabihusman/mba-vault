import { describe, it, expect } from "vitest";
import { chunkDocument } from "./document-chunker";
import type { ExtractedDoc } from "./types";

function doc(units: ExtractedDoc["units"], relPath = "Course A\\deck.pptx"): ExtractedDoc {
  return {
    file: { absPath: "x", course: "Course A", relPath, kind: "pptx" },
    units,
    needsOcr: false,
  };
}

describe("chunkDocument", () => {
  it("carries provenance and builds stable forward-slashed ids", () => {
    const chunks = chunkDocument(doc([{ loc: { kind: "slide", index: 3 }, text: "hello world" }]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe("Course A/deck.pptx::s3::0");
    expect(chunks[0]!.file).toBe("Course A/deck.pptx");
    expect(chunks[0]!.course).toBe("Course A");
    expect(chunks[0]!.loc).toEqual({ kind: "slide", index: 3 });
    expect(chunks[0]!.text).toBe("hello world");
  });

  it("splits a long unit into ordinal-numbered chunks with the same loc", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkDocument(
      doc([{ loc: { kind: "page", index: 1 }, text: words }], "Course A\\reading.pdf"),
      { targetWords: 20, overlap: 5 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `Course A/reading.pdf::p1::${i}`));
    expect(chunks.every((c) => c.loc.kind === "page")).toBe(true);
  });

  it("labels file-level (DOCX) units", () => {
    const chunks = chunkDocument(doc([{ loc: { kind: "file" }, text: "one two" }], "Course B\\paper.docx"));
    expect(chunks[0]!.id).toBe("Course B/paper.docx::file::0");
    expect(chunks[0]!.loc).toEqual({ kind: "file" });
  });

  it("returns nothing for a document with no units", () => {
    expect(chunkDocument(doc([]))).toEqual([]);
  });
});
