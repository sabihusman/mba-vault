// The ingest orchestration, extracted from scripts/ingest.ts so it can be driven
// with a fake Embedder in tests — which is what makes "a resumed run produces the
// same index as an uninterrupted one" a testable claim rather than an assertion.
//
// The index write path is deliberately unchanged: nothing lands in outDir until
// every vector exists, so a mid-run failure leaves the previous index untouched.
// The resume cache lives in its own directory and never weakens that property.
import { runExtraction, type ExtractionFailure } from "./pipeline";
import {
  EMBED_DIMS,
  EMBED_MODEL,
  embedChunks,
  type BatchStat,
  type Embedder,
  type EmbedProgress,
} from "./embed";
import { planEmbedding, tryLoadPriorIndex } from "./incremental";
import { cacheKey, openEmbedCache } from "./embed-cache";
import { writeChunks, writeIngestReport, writeManifest, writeVectors, type Manifest } from "./store";
import type { Chunk } from "./document-chunker";

export interface RunIngestOptions {
  root: string;
  outDir: string;
  embedder: Embedder;
  /** Resume-cache directory. Omit to disable caching entirely. */
  cacheDir?: string;
  batchSize?: number;
  /** Fixed pause between batches. Default 0. */
  delayMs?: number;
  full?: boolean;
  model?: string;
  dims?: number;
  onProgress?: (progress: EmbedProgress) => void;
  onBatchStat?: (stat: BatchStat) => void;
}

export interface RunIngestResult {
  fileCount: number;
  chunkCount: number;
  priorChunkCount: number;
  reusedFromIndex: number;
  reusedFromCache: number;
  embedded: number;
  batchStats: BatchStat[];
  needsOcr: string[];
  failures: ExtractionFailure[];
  manifest: Manifest;
}

export async function runIngest(options: RunIngestOptions): Promise<RunIngestResult> {
  const { root, outDir, embedder } = options;
  const batchSize = options.batchSize ?? 100;
  const dims = options.dims ?? EMBED_DIMS;
  const model = options.model ?? EMBED_MODEL;
  const startedAt = Date.now();

  const { chunks, fileHashes, needsOcr, failures, fileCount } = await runExtraction(root);

  const prior = options.full ? undefined : await tryLoadPriorIndex(outDir);
  const { toEmbed, reuse } = planEmbedding(chunks, fileHashes, prior, dims);

  const cache = options.cacheDir
    ? await openEmbedCache(options.cacheDir, { model, dims })
    : undefined;

  // Split what the index can't supply into "already embedded during an earlier
  // attempt" (cache hit) and "must call the API".
  const cached = new Map<string, Float32Array>();
  const mustEmbed: Chunk[] = [];
  for (const chunk of toEmbed) {
    const hit = cache?.get(cacheKey(chunk.id, chunk.text));
    if (hit) cached.set(chunk.id, hit);
    else mustEmbed.push(chunk);
  }

  const batchStats: BatchStat[] = [];
  const fresh = await embedChunks(embedder, mustEmbed, batchSize, options.onProgress, {
    delayMs: options.delayMs ?? 0,
    onBatch: async (batch, stat) => {
      batchStats.push(stat);
      options.onBatchStat?.(stat);
      await cache?.append(
        batch.chunks.map((chunk, i) => ({
          key: cacheKey(chunk.id, chunk.text),
          vector: batch.vectors[i]!,
        })),
      );
    },
  });

  // Assemble row-aligned to chunks: reused from the index, resumed from the
  // cache, or freshly embedded. Only now do we touch outDir.
  const vectors = new Float32Array(chunks.length * dims);
  chunks.forEach((chunk, i) => {
    const vector = reuse.get(chunk.id) ?? cached.get(chunk.id) ?? fresh.get(chunk.id);
    if (!vector) throw new Error(`internal: missing vector for chunk ${chunk.id}`);
    vectors.set(vector, i * dims);
  });

  const manifest: Manifest = {
    model,
    dims,
    count: chunks.length,
    createdAt: new Date(startedAt).toISOString(),
    files: fileHashes,
  };

  await writeChunks(outDir, chunks);
  await writeVectors(outDir, vectors);
  await writeManifest(outDir, manifest);
  await writeIngestReport(outDir, {
    runAt: new Date(startedAt).toISOString(),
    needsOcr,
    failures,
  });

  return {
    fileCount,
    chunkCount: chunks.length,
    priorChunkCount: prior ? prior.chunks.length : 0,
    reusedFromIndex: reuse.size,
    reusedFromCache: cached.size,
    embedded: fresh.size,
    batchStats,
    needsOcr,
    failures,
    manifest,
  };
}
