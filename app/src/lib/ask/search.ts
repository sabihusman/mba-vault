// Brute-force nearest-neighbour search over the in-memory index. Index rows are
// already L2-normalized (at ingest time), so we normalize the query and take dot
// products — a dot product of unit vectors IS cosine similarity. At ~12k × 1536
// this is a few milliseconds per query, so no ANN library is needed.
import type { ChunkMeta, LoadedIndex } from "./index-store";

export interface SearchHit {
  chunk: ChunkMeta;
  score: number; // cosine similarity, [-1, 1]
}

export function search(index: LoadedIndex, query: ArrayLike<number>, k: number): SearchHit[] {
  const { dims } = index.manifest;
  if (query.length !== dims) {
    throw new Error(`query has ${query.length} dims, index expects ${dims}`);
  }

  const q = normalize(query);
  const { vectors, chunks } = index;

  const hits: SearchHit[] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    const offset = i * dims;
    let dot = 0;
    for (let d = 0; d < dims; d++) dot += q[d] * vectors[offset + d];
    hits[i] = { chunk: chunks[i], score: dot };
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(0, k));
}

function normalize(vec: ArrayLike<number>): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vec.length; i++) sumSquares += vec[i] * vec[i];

  const out = new Float32Array(vec.length);
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}
