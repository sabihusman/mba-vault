// Gemini embeddings. The actual API call sits behind the Embedder interface so the
// batching/orchestration below is testable with a fake, and the real run (I4)
// swaps in createGeminiEmbedder. gemini-embedding-001 at 1536 dims, L2-normalized.
import { GoogleGenAI } from "@google/genai";
import { l2normalize } from "./vector";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 1536;

export interface Embedder {
  /** Embed a batch of texts → one unit-length vector each, in input order. */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export function createGeminiEmbedder(
  apiKey: string,
  model: string = EMBED_MODEL,
  dims: number = EMBED_DIMS,
): Embedder {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const response = await withRetry(() =>
        ai.models.embedContent({ model, contents: texts, config: { outputDimensionality: dims } }),
      );
      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(`embedContent returned ${embeddings.length} embeddings for ${texts.length} inputs`);
      }
      return embeddings.map((embedding, i) => {
        const values = embedding.values ?? [];
        if (values.length !== dims) {
          throw new Error(`embedding ${i} has ${values.length} dims, expected ${dims}`);
        }
        return l2normalize(values);
      });
    },
  };
}

/** Retry transient failures (rate limits, blips) with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries) throw err;
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export interface EmbedProgress {
  done: number;
  total: number;
}

/**
 * Embed chunks in batches, returning a map from chunk id → normalized vector.
 * Batching cuts request count (and rate-limit pressure) for large corpora.
 */
export async function embedChunks(
  embedder: Embedder,
  chunks: { id: string; text: string }[],
  batchSize: number = 100,
  onProgress?: (progress: EmbedProgress) => void,
): Promise<Map<string, Float32Array>> {
  const byId = new Map<string, Float32Array>();
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const vectors = await embedder.embedBatch(batch.map((c) => c.text));
    batch.forEach((chunk, j) => byId.set(chunk.id, vectors[j]!));
    onProgress?.({ done: Math.min(start + batchSize, chunks.length), total: chunks.length });
  }
  return byId;
}
