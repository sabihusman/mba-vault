import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverFiles } from "./discover";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mbav-discover-"));
  await mkdir(join(root, "Course A", "Week 1"), { recursive: true });
  await writeFile(join(root, "Course A", "intro.pdf"), "x");
  await writeFile(join(root, "Course A", "Week 1", "deck.pptx"), "x");
  await writeFile(join(root, "Course A", "budget.xlsx"), "x"); // Excel → excluded
  await writeFile(join(root, "Course A", "photo.png"), "x"); // image → excluded
  await mkdir(join(root, "Course B"), { recursive: true });
  await writeFile(join(root, "Course B", "paper.docx"), "x");
  await mkdir(join(root, ".index"), { recursive: true });
  await writeFile(join(root, ".index", "vectors.bin"), "x"); // dot-dir → skipped
  await writeFile(join(root, "MBA-Vault - Architecture.md"), "x"); // not ingestible
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("discoverFiles", () => {
  it("returns only pdf/docx/pptx with course + kind, skipping everything else", async () => {
    const files = await discoverFiles(root);
    const rels = files.map((f) => f.relPath.replaceAll("\\", "/"));

    expect(new Set(rels)).toEqual(
      new Set(["Course A/intro.pdf", "Course A/Week 1/deck.pptx", "Course B/paper.docx"]),
    );

    const byRel = new Map(files.map((f) => [f.relPath.replaceAll("\\", "/"), f]));
    expect(byRel.get("Course A/intro.pdf")?.kind).toBe("pdf");
    expect(byRel.get("Course A/intro.pdf")?.course).toBe("Course A");
    expect(byRel.get("Course A/Week 1/deck.pptx")?.kind).toBe("pptx");
    expect(byRel.get("Course A/Week 1/deck.pptx")?.course).toBe("Course A");
    expect(byRel.get("Course B/paper.docx")?.kind).toBe("docx");
  });
});
