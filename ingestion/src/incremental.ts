// Incremental re-indexing: reuse embeddings for chunks whose source file is
// byte-identical to the last run (matched by the stable chunk id), so a re-run
// only pays to embed new/changed files. Matching is by chunk id AND the file's
// content hash — a file whose hash changed re-embeds all its chunks.
import { readManifest, readChunks, readVectors, type Manifest } from "./store";
import type { Chunk } from "./document-chunker";
import { EMBED_DIMS } from "./embed";

export interface PriorIndex {
  manifest: Manifest;
  chunks: Chunk[];
  vectors: Float32Array; // flat: count × dims, row-aligned to chunks
}

/** Load a previous index if all three files are present and readable; else none. */
export async function tryLoadPriorIndex(outDir: string): Promise<PriorIndex | undefined> {
  try {
    const [manifest, chunks, vectors] = await Promise.all([
      readManifest(outDir),
      readChunks(outDir),
      readVectors(outDir),
    ]);
    return { manifest, chunks, vectors };
  } catch {
    return undefined; // missing/incomplete prior index → full build
  }
}

export interface EmbeddingPlan {
  toEmbed: Chunk[]; // chunks needing a fresh embedding
  reuse: Map<string, Float32Array>; // chunk id → existing vector (length = dims)
}

export function planEmbedding(
  newChunks: Chunk[],
  newHashes: Record<string, string>,
  prior: PriorIndex | undefined,
  dims: number = EMBED_DIMS,
): EmbeddingPlan {
  const reuse = new Map<string, Float32Array>();

  // Only reuse when the prior index used the same dimensionality.
  if (prior && prior.manifest.dims === dims) {
    const priorVectorById = indexVectorsById(prior, dims);
    for (const chunk of newChunks) {
      const fileUnchanged = prior.manifest.files[chunk.file] === newHashes[chunk.file];
      const priorVector = priorVectorById.get(chunk.id);
      if (fileUnchanged && priorVector) reuse.set(chunk.id, priorVector);
    }
  }

  const toEmbed = newChunks.filter((chunk) => !reuse.has(chunk.id));
  return { toEmbed, reuse };
}

function indexVectorsById(prior: PriorIndex, dims: number): Map<string, Float32Array> {
  const byId = new Map<string, Float32Array>();
  prior.chunks.forEach((chunk, i) => {
    byId.set(chunk.id, prior.vectors.subarray(i * dims, (i + 1) * dims));
  });
  return byId;
}
