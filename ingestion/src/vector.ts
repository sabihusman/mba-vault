// L2-normalize an embedding to unit length. gemini-embedding-001 only returns
// pre-normalized vectors at its full 3072 dims; at our reduced 1536 dims we MUST
// normalize ourselves, so that a dot product at query time equals cosine
// similarity (what retrieval.ts assumes).
export function l2normalize(values: number[]): Float32Array {
  let sumSquares = 0;
  for (const value of values) sumSquares += value * value;

  const out = new Float32Array(values.length);
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return out; // all-zero embedding → leave as zeros

  for (let i = 0; i < values.length; i++) out[i] = values[i]! / norm;
  return out;
}
