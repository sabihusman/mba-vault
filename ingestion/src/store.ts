// The on-disk vector index. Three files (shipped to /data/.index on the box):
//   chunks.jsonl  — one chunk per line (provenance + text), row-aligned to vectors
//   vectors.bin   — contiguous Float32, count × dims, L2-normalised (at embed time)
//   manifest.json — model, dims, count, and per-file hashes for incremental runs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Chunk } from "./document-chunker";

export const CHUNKS_FILE = "chunks.jsonl";
export const VECTORS_FILE = "vectors.bin";
export const MANIFEST_FILE = "manifest.json";

export interface Manifest {
  model: string;
  dims: number;
  count: number; // number of chunks / vector rows
  createdAt: string; // ISO timestamp
  files: Record<string, string>; // relPath (forward-slashed) → sha256
}

export async function writeChunks(outDir: string, chunks: Chunk[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const body = chunks.map((c) => JSON.stringify(c)).join("\n");
  await writeFile(join(outDir, CHUNKS_FILE), chunks.length ? body + "\n" : "", "utf8");
}

export async function readChunks(outDir: string): Promise<Chunk[]> {
  const text = await readFile(join(outDir, CHUNKS_FILE), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Chunk);
}

export async function writeVectors(outDir: string, vectors: Float32Array): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, VECTORS_FILE),
    Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength),
  );
}

export async function readVectors(outDir: string): Promise<Float32Array> {
  const buf = await readFile(join(outDir, VECTORS_FILE));
  // Copy into a fresh, 4-byte-aligned ArrayBuffer — a Buffer from readFile can sit
  // at an unaligned offset in a pooled ArrayBuffer, which Float32Array rejects.
  const aligned = new ArrayBuffer(buf.byteLength);
  new Uint8Array(aligned).set(buf);
  return new Float32Array(aligned);
}

export async function writeManifest(outDir: string, manifest: Manifest): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function readManifest(outDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(outDir, MANIFEST_FILE), "utf8")) as Manifest;
}
