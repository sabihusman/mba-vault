import { describe, expect, it } from "vitest";
// Relative imports — vitest has no "@/" alias (repo convention).
import { getDocument, MAX_DOCUMENT_CHARS, type GetDocumentDeps } from "./get-document";
import type { ChunkMeta, LoadedIndex } from "../ask/index-store";
import type { FileInfo } from "../browse/catalog";

function index(chunks: ChunkMeta[]): LoadedIndex {
  return {
    manifest: { model: "fake", dims: 2, count: chunks.length, createdAt: "", files: {} },
    chunks,
    vectors: new Float32Array(chunks.length * 2),
  };
}

function deps(chunks: ChunkMeta[], onDisk: FileInfo | null = null): GetDocumentDeps {
  return {
    getIndex: async () => index(chunks),
    resolveFile: async () => onDisk,
  };
}

const NOTES: ChunkMeta[] = [
  // Deliberately out of order — document order is the tool's job.
  { id: "p2", course: "C", file: "C/notes.pdf", loc: { kind: "page", index: 2 }, text: "second page text" },
  { id: "p1", course: "C", file: "C/notes.pdf", loc: { kind: "page", index: 1 }, text: "first page text" },
  { id: "p3", course: "C", file: "C/notes.pdf", loc: { kind: "page", index: 3 }, text: "third page text" },
  { id: "x", course: "C", file: "C/other.txt", loc: { kind: "file" }, text: "different file entirely" },
];

describe("getDocument — ordering + assembly", () => {
  it("returns only the file's chunks, in document order, with page headers", async () => {
    const result = await getDocument(deps(NOTES), "C/notes.pdf");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const first = result.text.indexOf("first page text");
    const second = result.text.indexOf("second page text");
    const third = result.text.indexOf("third page text");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
    expect(result.text).toContain("— page 1 —");
    expect(result.text).toContain("3 indexed chunks");
    expect(result.text).not.toContain("different file entirely");
  });

  it("file-kind chunks work (single-chunk documents)", async () => {
    const result = await getDocument(deps(NOTES), "C/other.txt");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.text).toContain("— content —");
    expect(result.text).toContain("different file entirely");
  });
});

describe("getDocument — size guard", () => {
  it("truncates at a chunk boundary with an explicit marker", async () => {
    const big = "x".repeat(15_000);
    const chunks: ChunkMeta[] = [1, 2, 3, 4].map((n) => ({
      id: `p${n}`,
      course: "C",
      file: "C/big.pdf",
      loc: { kind: "page", index: n },
      text: big,
    }));
    const result = await getDocument(deps(chunks), "C/big.pdf");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_CHARS + 300); // marker allowance
    expect(result.text).toContain("— truncated: showing chunks 1–2 of 4");
    expect(result.text).toContain("2 chunks were omitted");
  });
});

describe("getDocument — the three-way path outcome", () => {
  it("browse-only: on disk but not indexed (Excel / un-OCR'd PDF) — informative, names the reason", async () => {
    const onDisk: FileInfo = { absPath: "/x", name: "budget.xlsx", size: 10, ext: "xlsx" };
    const result = await getDocument(deps(NOTES, onDisk), "C/budget.xlsx");
    expect(result.kind).toBe("browse_only");
    if (result.kind !== "browse_only") return;
    expect(result.message).toMatch(/browse\/download-only/);
    expect(result.message).toMatch(/Excel|image-only/);
  });

  it("not found anywhere → error pointing at list_files", async () => {
    const result = await getDocument(deps(NOTES, null), "C/ghost.pdf");
    expect(result.kind).toBe("not_found");
  });

  it("malformed/traversal paths → not_found without touching the filesystem", async () => {
    let touched = false;
    const d: GetDocumentDeps = {
      getIndex: async () => index(NOTES),
      resolveFile: async () => {
        touched = true;
        return null;
      },
    };
    for (const bad of ["../../etc/passwd", "a\\b", "", "a//b"]) {
      const result = await getDocument(d, bad);
      expect(result.kind, `path=${JSON.stringify(bad)}`).toBe("not_found");
    }
    expect(touched).toBe(false);
  });
});
