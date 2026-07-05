import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeChunks,
  readChunks,
  writeVectors,
  readVectors,
  writeManifest,
  readManifest,
  type Manifest,
} from "./store";
import type { Chunk } from "./document-chunker";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mbav-store-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const chunks: Chunk[] = [
  { id: "A/x.pdf::p1::0", course: "A", file: "A/x.pdf", loc: { kind: "page", index: 1 }, text: "hello" },
  { id: "A/x.pdf::p2::0", course: "A", file: "A/x.pdf", loc: { kind: "page", index: 2 }, text: "world" },
];

describe("store", () => {
  it("round-trips chunks as JSONL", async () => {
    await writeChunks(dir, chunks);
    expect(await readChunks(dir)).toEqual(chunks);
  });

  it("round-trips vectors as aligned Float32", async () => {
    const vecs = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    await writeVectors(dir, vecs);
    const back = await readVectors(dir);
    expect(back).toHaveLength(6);
    for (let i = 0; i < vecs.length; i++) expect(back[i]!).toBeCloseTo(vecs[i]!, 6);
  });

  it("round-trips the manifest", async () => {
    const manifest: Manifest = {
      model: "gemini-embedding-001",
      dims: 1536,
      count: 2,
      createdAt: "2026-07-05T00:00:00.000Z",
      files: { "A/x.pdf": "deadbeef" },
    };
    await writeManifest(dir, manifest);
    expect(await readManifest(dir)).toEqual(manifest);
  });

  it("handles an empty chunk set", async () => {
    await writeChunks(dir, []);
    expect(await readChunks(dir)).toEqual([]);
  });
});
