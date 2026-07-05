import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planEmbedding, tryLoadPriorIndex, type PriorIndex } from "./incremental";
import type { Chunk } from "./document-chunker";
import type { Manifest } from "./store";

const DIMS = 2;

function chunk(id: string, file: string): Chunk {
  return { id, course: "C", file, loc: { kind: "file" }, text: id };
}

// A prior index with two files (x.pdf, y.pdf), one chunk each, known vectors.
function priorIndex(): PriorIndex {
  const manifest: Manifest = {
    model: "gemini-embedding-001",
    dims: DIMS,
    count: 2,
    createdAt: "2026-07-05T00:00:00.000Z",
    files: { "C/x.pdf": "hashX", "C/y.pdf": "hashY" },
  };
  const chunks = [chunk("C/x.pdf::file::0", "C/x.pdf"), chunk("C/y.pdf::file::0", "C/y.pdf")];
  const vectors = new Float32Array([1, 0, 0, 1]); // row0 = x, row1 = y
  return { manifest, chunks, vectors };
}

describe("planEmbedding", () => {
  it("embeds everything when there is no prior index", () => {
    const chunks = [chunk("C/x.pdf::file::0", "C/x.pdf")];
    const plan = planEmbedding(chunks, { "C/x.pdf": "hashX" }, undefined, DIMS);
    expect(plan.toEmbed).toHaveLength(1);
    expect(plan.reuse.size).toBe(0);
  });

  it("reuses vectors for unchanged files and re-embeds changed ones", () => {
    const prior = priorIndex();
    const newChunks = [
      chunk("C/x.pdf::file::0", "C/x.pdf"), // unchanged
      chunk("C/y.pdf::file::0", "C/y.pdf"), // changed (hash differs below)
    ];
    const plan = planEmbedding(newChunks, { "C/x.pdf": "hashX", "C/y.pdf": "hashY-NEW" }, prior, DIMS);

    expect(plan.reuse.has("C/x.pdf::file::0")).toBe(true);
    expect([...plan.reuse.get("C/x.pdf::file::0")!]).toEqual([1, 0]);
    expect(plan.toEmbed.map((c) => c.id)).toEqual(["C/y.pdf::file::0"]);
  });

  it("embeds brand-new files and silently drops removed ones", () => {
    const prior = priorIndex();
    // x removed, z added; y unchanged.
    const newChunks = [chunk("C/y.pdf::file::0", "C/y.pdf"), chunk("C/z.pdf::file::0", "C/z.pdf")];
    const plan = planEmbedding(newChunks, { "C/y.pdf": "hashY", "C/z.pdf": "hashZ" }, prior, DIMS);

    expect(plan.reuse.has("C/y.pdf::file::0")).toBe(true);
    expect(plan.toEmbed.map((c) => c.id)).toEqual(["C/z.pdf::file::0"]);
    // x.pdf simply isn't in the new set → not reused, not embedded.
  });

  it("re-embeds everything if the prior index used different dims", () => {
    const prior = priorIndex(); // dims = 2
    const newChunks = [chunk("C/x.pdf::file::0", "C/x.pdf")];
    const plan = planEmbedding(newChunks, { "C/x.pdf": "hashX" }, prior, 1536);
    expect(plan.reuse.size).toBe(0);
    expect(plan.toEmbed).toHaveLength(1);
  });
});

describe("tryLoadPriorIndex", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "mbav-prior-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined when there is no index on disk", async () => {
    expect(await tryLoadPriorIndex(dir)).toBeUndefined();
  });
});
