// Gemini embeddings. The actual API call sits behind the Embedder interface so the
// batching/orchestration below is testable with a fake, and the real run (I4)
// swaps in createGeminiEmbedder. gemini-embedding-001 at 1536 dims, L2-normalized.
import { GoogleGenAI } from "@google/genai";
import { l2normalize } from "./vector";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 1536;

/** Total attempts (including the first) before the SDK surfaces an error. */
export const RETRY_ATTEMPTS = 5;

export interface Embedder {
  /** Embed a batch of texts → one unit-length vector each, in input order. */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export function createGeminiEmbedder(
  apiKey: string,
  model: string = EMBED_MODEL,
  dims: number = EMBED_DIMS,
): Embedder {
  // Retry lives in the SDK, not here. It splits retryable (408/429/5xx) from
  // terminal and aborts immediately on the latter, so a 4xx that can never
  // succeed doesn't burn the budget. It only engages when retryOptions is set —
  // without it the SDK issues a bare fetch. Caveat: intermediate retries are
  // invisible to callers (only the final failure surfaces, and ApiError carries
  // just message+status), so per-batch latency is the only retry signal we get.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: RETRY_ATTEMPTS } },
  });
  return {
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const response = await ai.models.embedContent({
        model,
        contents: texts,
        config: { outputDimensionality: dims },
      });
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

export interface EmbedProgress {
  done: number;
  total: number;
}

/** Per-batch instrumentation. `estTokens` is chars/4 — an estimate, not billed usage. */
export interface BatchStat {
  index: number; // 0-based batch number
  count: number; // chunks in this batch
  estTokens: number;
  latencyMs: number;
  done: number;
  total: number;
}

export interface EmbedOptions {
  /** Fixed pause between batches. Default 0 — no adaptive behaviour by design. */
  delayMs?: number;
  /** Fired after each successful batch, before the next one starts. Awaited. */
  onBatch?: (
    batch: { chunks: { id: string; text: string }[]; vectors: Float32Array[] },
    stat: BatchStat,
  ) => void | Promise<void>;
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
  options: EmbedOptions = {},
): Promise<Map<string, Float32Array>> {
  const byId = new Map<string, Float32Array>();
  const delayMs = options.delayMs ?? 0;
  let index = 0;

  for (let start = 0; start < chunks.length; start += batchSize) {
    // Pause *between* batches only — never before the first or after the last.
    if (index > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const batch = chunks.slice(start, start + batchSize);
    const startedAt = Date.now();
    const vectors = await embedder.embedBatch(batch.map((c) => c.text));
    const latencyMs = Date.now() - startedAt;

    batch.forEach((chunk, j) => byId.set(chunk.id, vectors[j]!));
    const done = Math.min(start + batchSize, chunks.length);

    // Awaited so a checkpoint is durable before the next batch is requested.
    await options.onBatch?.(
      { chunks: batch, vectors },
      {
        index,
        count: batch.length,
        estTokens: Math.round(batch.reduce((sum, c) => sum + c.text.length, 0) / 4),
        latencyMs,
        done,
        total: chunks.length,
      },
    );

    onProgress?.({ done, total: chunks.length });
    index += 1;
  }
  return byId;
}
