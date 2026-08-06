import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMinimalPdf, buildMinimalDocx, buildMinimalPptx } from "../fixtures";
import { extractDocument, extractPdf } from "./index";
import type { DocKind, SourceFile } from "../types";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mbav-extract-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function source(absPath: string, kind: DocKind): SourceFile {
  return { absPath, course: "Course A", relPath: `Course A/${kind}`, kind };
}

describe("extractDocument", () => {
  it("extracts PDF text with per-page provenance", async () => {
    const path = join(dir, "a.pdf");
    await writeFile(path, buildMinimalPdf(["Hello page one", "Second page here"]));
    const doc = await extractDocument(source(path, "pdf"));

    expect(doc.needsOcr).toBe(false);
    expect(doc.units.map((u) => u.loc)).toEqual([
      { kind: "page", index: 1 },
      { kind: "page", index: 2 },
    ]);
    expect(doc.units[0]!.text).toContain("Hello page one");
    expect(doc.units[1]!.text).toContain("Second page here");
  });

  it("flags a text-less PDF as needing OCR and returns no units", async () => {
    const path = join(dir, "scan.pdf");
    await writeFile(path, buildMinimalPdf([""]));
    const { needsOcr, units } = await extractPdf(path);
    expect(needsOcr).toBe(true);
    expect(units).toEqual([]);
  });

  it("extracts DOCX as a single file-level unit", async () => {
    const path = join(dir, "a.docx");
    await writeFile(path, await buildMinimalDocx(["First paragraph.", "Second paragraph."]));
    const doc = await extractDocument(source(path, "docx"));

    expect(doc.units).toHaveLength(1);
    expect(doc.units[0]!.loc).toEqual({ kind: "file" });
    expect(doc.units[0]!.text).toContain("First paragraph.");
    expect(doc.units[0]!.text).toContain("Second paragraph.");
  });

  it("extracts PPTX text per slide", async () => {
    const path = join(dir, "a.pptx");
    await writeFile(path, await buildMinimalPptx([["Slide one", "bullet"], ["Slide two"]]));
    const doc = await extractDocument(source(path, "pptx"));

    expect(doc.units.map((u) => u.loc)).toEqual([
      { kind: "slide", index: 1 },
      { kind: "slide", index: 2 },
    ]);
    expect(doc.units[0]!.text).toBe("Slide one bullet");
    expect(doc.units[1]!.text).toBe("Slide two");
  });

  it("extracts TXT with one page-loc unit per form-feed-separated page", async () => {
    const path = join(dir, "two-pages.txt");
    await writeFile(path, "First page text.\fSecond page text.");
    const doc = await extractDocument(source(path, "txt"));

    expect(doc.needsOcr).toBe(false);
    expect(doc.units).toEqual([
      { loc: { kind: "page", index: 1 }, text: "First page text." },
      { loc: { kind: "page", index: 2 }, text: "Second page text." },
    ]);
  });

  it("TXT without a form feed is exactly one unit, page 1", async () => {
    const path = join(dir, "one-page.txt");
    await writeFile(path, "Just one page,\ntwo lines.");
    const doc = await extractDocument(source(path, "txt"));

    expect(doc.units).toEqual([
      { loc: { kind: "page", index: 1 }, text: "Just one page, two lines." },
    ]);
  });

  it("TXT with a trailing form feed emits no empty final page", async () => {
    const path = join(dir, "trailing-ff.txt");
    await writeFile(path, "Page one.\fPage two.\f");
    const doc = await extractDocument(source(path, "txt"));

    expect(doc.units.map((u) => u.loc)).toEqual([
      { kind: "page", index: 1 },
      { kind: "page", index: 2 },
    ]);
  });

  it("empty or whitespace-only TXT yields no units and does not throw", async () => {
    const empty = join(dir, "empty.txt");
    await writeFile(empty, "");
    expect((await extractDocument(source(empty, "txt"))).units).toEqual([]);

    const blank = join(dir, "blank.txt");
    await writeFile(blank, "  \n\f \t\n");
    expect((await extractDocument(source(blank, "txt"))).units).toEqual([]);
  });

  it("orders slides numerically (slide10 after slide2, not after slide1)", async () => {
    const path = join(dir, "many.pptx");
    const slides = Array.from({ length: 11 }, (_, i) => [`Slide ${i + 1}`]);
    await writeFile(path, await buildMinimalPptx(slides));
    const doc = await extractDocument(source(path, "pptx"));

    const indices = doc.units.map((u) => (u.loc.kind === "slide" ? u.loc.index : -1));
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
