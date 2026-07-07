// Loads the vector index (produced by the ingestion pipeline) into memory and
// caches it. Lives at DATA_DIR/.index on the box — the dot keeps it hidden from
// browse. Read-only: the app only ever reads this; ingestion writes it offline.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "../browse/data-dir";

export type Loc =
  | { kind: "page"; index: number }
  | { kind: "slide"; index: number }
  | { kind: "file" };

export interface ChunkMeta {
  id: string;
  course: string;
  file: string; // relPath, forward-slashed
  loc: Loc;
  text: string;
}

export interface IndexManifest {
  model: string;
  dims: number;
  count: number;
  createdAt: string;
  files: Record<string, string>;
}

export interface LoadedIndex {
  manifest: IndexManifest;
  chunks: ChunkMeta[];
  vectors: Float32Array; // count × dims, row-aligned to chunks, L2-normalized
}

/** The index directory on the box (hidden from browse by the leading dot). */
export function indexDir(): string {
  return join(getDataDir(), ".index");
}

let cached: Promise<LoadedIndex> | null = null;

/** Load once and cache; later calls return the same in-memory index. */
export function getIndex(): Promise<LoadedIndex> {
  cached ??= loadIndex();
  return cached;
}

/** Drop the cache so the next getIndex() reloads (e.g. after a re-ingest). */
export function clearIndexCache(): void {
  cached = null;
}

export async function loadIndex(dir: string = indexDir()): Promise<LoadedIndex> {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as IndexManifest;

  const chunks = (await readFile(join(dir, "chunks.jsonl"), "utf8"))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChunkMeta);

  const vectors = toFloat32(await readFile(join(dir, "vectors.bin")));

  // Guard against a truncated/mismatched upload — also verifies the index is intact.
  if (vectors.length !== manifest.count * manifest.dims) {
    throw new Error(
      `index corrupt: vectors.bin has ${vectors.length} floats, manifest expects ${manifest.count} × ${manifest.dims}`,
    );
  }
  if (chunks.length !== manifest.count) {
    throw new Error(`index corrupt: ${chunks.length} chunks but manifest count is ${manifest.count}`);
  }

  return { manifest, chunks, vectors };
}

function toFloat32(buf: Buffer): Float32Array {
  // Copy into a fresh, 4-byte-aligned ArrayBuffer — a pooled Buffer can sit at an
  // unaligned offset, which Float32Array rejects.
  const aligned = new ArrayBuffer(buf.byteLength);
  new Uint8Array(aligned).set(buf);
  return new Float32Array(aligned);
}
