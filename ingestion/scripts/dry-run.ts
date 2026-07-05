/**
 * Dry run: discover → extract → chunk over a real coursework folder and write the
 * text side of the index (chunks.jsonl + manifest.json) WITHOUT embedding. Lets us
 * eyeball chunk counts and see which PDFs need OCR before spending on Gemini.
 *
 * Usage:
 *   npm run ingest:dryrun -- "C:\\Users\\sabih\\OneDrive\\Documents\\MBA Coursework" .index-dryrun
 */
import { runExtraction } from "../src/pipeline";
import { writeChunks, writeManifest, type Manifest } from "../src/store";

const root = process.argv[2] ?? process.env.INGEST_SRC;
const outDir = process.argv[3] ?? process.env.INGEST_OUT ?? ".index-dryrun";

if (!root) {
  console.error('usage: npm run ingest:dryrun -- "<source dir>" [out dir]');
  process.exit(1);
}

const started = Date.now();
const result = await runExtraction(root);

await writeChunks(outDir, result.chunks);
const manifest: Manifest = {
  model: "(dry-run: no embeddings)",
  dims: 0,
  count: result.chunks.length,
  createdAt: new Date(started).toISOString(),
  files: result.fileHashes,
};
await writeManifest(outDir, manifest);

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nDry run complete in ${seconds}s → ${outDir}/`);
console.log(`  files ingested: ${result.fileCount}`);
console.log(`  chunks written: ${result.chunks.length}`);
console.log(`  PDFs needing OCR (skipped): ${result.needsOcr.length}`);
for (const relPath of result.needsOcr) console.log(`    - ${relPath}`);
console.log(`  extraction failures: ${result.failures.length}`);
for (const failure of result.failures) console.log(`    - ${failure.file}: ${failure.error}`);
