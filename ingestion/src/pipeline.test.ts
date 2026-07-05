import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMinimalPdf, buildMinimalPptx } from "./fixtures";
import { runExtraction } from "./pipeline";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mbav-pipeline-"));
  await mkdir(join(root, "Course A"), { recursive: true });
  await writeFile(join(root, "Course A", "slides.pptx"), await buildMinimalPptx([["Alpha"], ["Beta"]]));
  await writeFile(join(root, "Course A", "reading.pdf"), buildMinimalPdf(["Some page text here"]));
  await writeFile(join(root, "Course A", "scan.pdf"), buildMinimalPdf([""])); // no text → needs OCR
  await writeFile(join(root, "Course A", "broken.pdf"), Buffer.from("this is not a pdf at all")); // → failure
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("runExtraction (end-to-end, no embeddings)", () => {
  it("chunks with provenance, hashes every file, and reports OCR needs", async () => {
    const result = await runExtraction(root);

    expect(result.fileCount).toBe(4);
    // 2 slides + 1 pdf page = 3 chunks; scan.pdf yields none; broken.pdf fails.
    expect(result.chunks).toHaveLength(3);
    expect(result.needsOcr).toEqual(["Course A/scan.pdf"]);

    // A corrupt file is recorded, not fatal, and isn't hashed as a success.
    expect(result.failures.map((f) => f.file)).toEqual(["Course A/broken.pdf"]);
    expect(Object.keys(result.fileHashes).sort()).toEqual([
      "Course A/reading.pdf",
      "Course A/scan.pdf",
      "Course A/slides.pptx",
    ]);

    const slideChunk = result.chunks.find((c) => c.file.endsWith("slides.pptx"));
    expect(slideChunk?.loc.kind).toBe("slide");
    expect(result.chunks.every((c) => c.text.length > 0)).toBe(true);
  });
});
