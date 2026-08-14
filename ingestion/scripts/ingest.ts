/**
 * Full ingestion CLI: discover → extract → chunk → embed (Gemini) → write the
 * vector index. Incremental by default (reuses embeddings for unchanged files);
 * pass --full to rebuild from scratch. Runs locally; needs GEMINI_API_KEY.
 *
 * The orchestration lives in src/run.ts so it can be tested with a fake
 * embedder; this file is argv/env parsing and reporting only.
 *
 * Usage:
 *   GEMINI_API_KEY=... npm run ingest -- "C:\\Users\\sabih\\OneDrive\\Documents\\MBA Coursework" .index
 *   GEMINI_API_KEY=... npm run ingest -- "<src>" .index --full
 *
 * Env knobs:
 *   INGEST_BATCH      chunks per embedding request (default 100)
 *   INGEST_DELAY_MS   fixed pause between batches (default 0)
 *   INGEST_CACHE_DIR  resume-cache directory (default .embed-cache)
 */
import { runIngest } from "../src/run";
import { createGeminiEmbedder, EMBED_DIMS } from "../src/embed";

const root = process.argv[2] ?? process.env.INGEST_SRC;
const outDir = process.argv[3] ?? process.env.INGEST_OUT ?? ".index";
const full = process.argv.includes("--full");
const apiKey = process.env.GEMINI_API_KEY;
const batchSize = Number(process.env.INGEST_BATCH ?? "100");
const delayMs = Number(process.env.INGEST_DELAY_MS ?? "0");
const cacheDir = process.env.INGEST_CACHE_DIR ?? ".embed-cache";

if (!root) {
  console.error('usage: npm run ingest -- "<source dir>" [out dir] [--full]');
  process.exit(1);
}
if (!apiKey) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

const started = Date.now();
console.log(`Extracting from ${root} …`);
if (delayMs > 0) console.log(`  pacing: ${delayMs}ms between batches`);

const result = await runIngest({
  root,
  outDir,
  embedder: createGeminiEmbedder(apiKey),
  cacheDir,
  batchSize,
  delayMs,
  full,
  onProgress: (p) => process.stdout.write(`\r  embedded ${p.done}/${p.total}`),
  // Per-batch instrumentation. Intermediate SDK retries are invisible here (see
  // embed.ts) — a latency spike is the only signal that one happened.
  onBatchStat: (s) =>
    process.stderr.write(
      `\n  batch ${s.index} · ${s.count} chunks · ~${s.estTokens} tok · ${s.latencyMs}ms\n`,
    ),
});
if (result.embedded > 0) process.stdout.write("\n");

console.log(`  ${result.chunkCount} chunks · ${result.needsOcr.length} PDFs need OCR · ${result.failures.length} failures`);
console.log(
  `  reused ${result.reusedFromIndex} from the index, ${result.reusedFromCache} from the resume cache, embedded ${result.embedded}.`,
);

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `\nIndex written to ${outDir}/ in ${seconds}s: ${result.chunkCount} vectors × ${EMBED_DIMS} dims`,
);
if (result.priorChunkCount > 0) {
  const delta = result.chunkCount - result.priorChunkCount;
  console.log(`  chunk count ${result.priorChunkCount} → ${result.chunkCount} (${delta >= 0 ? "+" : ""}${delta})`);
}
if (result.needsOcr.length > 0) {
  console.log(`  needs OCR (${result.needsOcr.length}):`);
  for (const relPath of result.needsOcr) console.log(`    - ${relPath}`);
}
if (result.failures.length > 0) {
  console.log(`  failures (${result.failures.length}):`);
  for (const failure of result.failures) console.log(`    - ${failure.file}: ${failure.error}`);
}
