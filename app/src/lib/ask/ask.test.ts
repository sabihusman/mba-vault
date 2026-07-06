import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIndex, type ChunkMeta } from "./index-store";
import { search } from "./search";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mbav-ask-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Write a minimal index (manifest + chunks.jsonl + vectors.bin) to `dir`. */
async function writeFixtureIndex(
  dir: string,
  dims: number,
  chunks: ChunkMeta[],
  rows: number[][],
  countOverride?: number,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const manifest = {
    model: "test",
    dims,
    count: countOverride ?? chunks.length,
    createdAt: "2026-07-05T00:00:00.000Z",
    files: {},
  };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "chunks.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
  await writeFile(join(dir, "vectors.bin"), Buffer.from(new Float32Array(rows.flat()).buffer));
}

function chunk(id: string): ChunkMeta {
  return { id, course: "C", file: `C/${id}.pdf`, loc: { kind: "file" }, text: id };
}

describe("loadIndex", () => {
  it("loads a valid index and exposes manifest/chunks/vectors", async () => {
    const dir = join(root, "valid");
    await writeFixtureIndex(dir, 3, [chunk("a"), chunk("b")], [[1, 0, 0], [0, 1, 0]]);
    const index = await loadIndex(dir);

    expect(index.manifest.dims).toBe(3);
    expect(index.manifest.count).toBe(2);
    expect(index.chunks.map((c) => c.id)).toEqual(["a", "b"]);
    expect(index.vectors).toHaveLength(6);
    expect(index.vectors[0]).toBeCloseTo(1, 6);
  });

  it("rejects an index whose vector count doesn't match the manifest", async () => {
    const dir = join(root, "bad-vectors");
    // manifest says count 3, but only 2 rows of data.
    await writeFixtureIndex(dir, 3, [chunk("a"), chunk("b")], [[1, 0, 0], [0, 1, 0]], 3);
    await expect(loadIndex(dir)).rejects.toThrow(/corrupt/);
  });
});

describe("search", () => {
  it("ranks the nearest chunk first and respects k", async () => {
    const dir = join(root, "search");
    await writeFixtureIndex(
      dir,
      3,
      [chunk("x"), chunk("y"), chunk("z")],
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    );
    const index = await loadIndex(dir);

    const hits = search(index, [0.9, 0.1, 0], 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].chunk.id).toBe("x");
    expect(hits[1].chunk.id).toBe("y");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("throws on a query with the wrong dimensionality", async () => {
    const dir = join(root, "dims");
    await writeFixtureIndex(dir, 3, [chunk("a")], [[1, 0, 0]]);
    const index = await loadIndex(dir);
    expect(() => search(index, [1, 0], 1)).toThrow(/dims/);
  });
});
