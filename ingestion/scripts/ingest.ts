/**
 * Full ingestion: discover → extract → chunk → embed (Gemini) → write the vector
 * index. Incremental by default (reuses embeddings for unchanged files); pass
 * --full to rebuild from scratch. Runs locally; needs GEMINI_API_KEY.
 *
 * Usage:
 *   GEMINI_API_KEY=... npm run ingest -- "C:\\Users\\sabih\\OneDrive\\Documents\\MBA Coursework" .index
 *   GEMINI_API_KEY=... npm run ingest -- "<src>" .index --full
 */
import { runExtraction } from "../src/pipeline";
import { createGeminiEmbedder, embedChunks, EMBED_MODEL, EMBED_DIMS } from "../src/embed";
import { tryLoadPriorIndex, planEmbedding } from "../src/incremental";
import { writeChunks, writeVectors, writeManifest, writeIngestReport, type Manifest } from "../src/store";

const root = process.argv[2] ?? process.env.INGEST_SRC;
const outDir = process.argv[3] ?? process.env.INGEST_OUT ?? ".index";
const full = process.argv.includes("--full");
const apiKey = process.env.GEMINI_API_KEY;
const batchSize = Number(process.env.INGEST_BATCH ?? "100");

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
const { chunks, fileHashes, needsOcr, failures } = await runExtraction(root);
console.log(`  ${chunks.length} chunks · ${needsOcr.length} PDFs need OCR · ${failures.length} failures`);

const prior = full ? undefined : await tryLoadPriorIndex(outDir);
const { toEmbed, reuse } = planEmbedding(chunks, fileHashes, prior);
console.log(
  prior
    ? `Incremental: embedding ${toEmbed.length} new/changed chunks, reusing ${reuse.size}.`
    : `Full build: embedding ${toEmbed.length} chunks.`,
);

const embedder = createGeminiEmbedder(apiKey);
const fresh = await embedChunks(embedder, toEmbed, batchSize, (p) => {
  process.stdout.write(`\r  embedded ${p.done}/${p.total}`);
});
if (toEmbed.length > 0) process.stdout.write("\n");

// Assemble vectors row-aligned to chunks (reused or freshly embedded).
const vectors = new Float32Array(chunks.length * EMBED_DIMS);
chunks.forEach((chunk, i) => {
  const vector = reuse.get(chunk.id) ?? fresh.get(chunk.id);
  if (!vector) throw new Error(`internal: missing vector for chunk ${chunk.id}`);
  vectors.set(vector, i * EMBED_DIMS);
});

await writeChunks(outDir, chunks);
await writeVectors(outDir, vectors);
const manifest: Manifest = {
  model: EMBED_MODEL,
  dims: EMBED_DIMS,
  count: chunks.length,
  createdAt: new Date(started).toISOString(),
  files: fileHashes,
};
await writeManifest(outDir, manifest);
await writeIngestReport(outDir, {
  runAt: new Date(started).toISOString(),
  needsOcr,
  failures,
});

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nIndex written to ${outDir}/ in ${seconds}s: ${chunks.length} vectors × ${EMBED_DIMS} dims`);
if (needsOcr.length > 0) {
  console.log(`  needs OCR (${needsOcr.length}):`);
  for (const relPath of needsOcr) console.log(`    - ${relPath}`);
}
if (failures.length > 0) {
  console.log(`  failures (${failures.length}):`);
  for (const failure of failures) console.log(`    - ${failure.file}: ${failure.error}`);
}
