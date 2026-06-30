/**
 * Vector retrieval helpers for the /ask endpoint.
 *
 * At our scale (~10k–40k chunks, one user) a brute-force cosine scan over the
 * in-memory index is fast enough (~100ms worst case) — no ANN library needed.
 * Embeddings from gemini-embedding-001 are L2-normalized at write time, so at
 * query time a dot product equals cosine similarity; we keep the full cosine
 * here so the helper is correct even on un-normalized input (and easy to test).
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface Scored<T> {
  item: T;
  score: number;
}

export interface IndexedVector<T> {
  vector: number[];
  data: T;
}

/** Return the `k` items whose vectors are most similar to `query`, best first. */
export function topK<T>(
  query: number[],
  items: IndexedVector<T>[],
  k: number,
): Scored<T>[] {
  const scored = items.map((it) => ({
    item: it.data,
    score: cosineSimilarity(query, it.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k));
}
