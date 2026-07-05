// Orchestrates discover → extract → chunk, collecting the pieces the index needs:
// the chunks, per-file content hashes (for incremental runs), and a list of PDFs
// that need OCR (deferred). Embedding is a separate step (added in I3) so this can
// run as a zero-cost dry run.
import { discoverFiles } from "./discover";
import { extractDocument } from "./extract";
import { chunkDocument, type Chunk } from "./document-chunker";
import { hashFile } from "./hash";
import type { ChunkOptions } from "./chunk";

export interface ExtractionFailure {
  file: string; // relPath, forward-slashed
  error: string;
}

export interface ExtractionResult {
  chunks: Chunk[];
  fileHashes: Record<string, string>; // relPath (forward-slashed) → sha256
  needsOcr: string[]; // relPaths of PDFs with no extractable text
  failures: ExtractionFailure[]; // files that threw during extraction
  fileCount: number;
}

export async function runExtraction(root: string, opts?: ChunkOptions): Promise<ExtractionResult> {
  const files = await discoverFiles(root);
  const chunks: Chunk[] = [];
  const fileHashes: Record<string, string> = {};
  const needsOcr: string[] = [];
  const failures: ExtractionFailure[] = [];

  for (const file of files) {
    const relPath = file.relPath.replaceAll("\\", "/");
    // One corrupt file must not sink a 842-file run — record and move on.
    try {
      const doc = await extractDocument(file);
      if (doc.needsOcr) needsOcr.push(relPath);
      chunks.push(...chunkDocument(doc, opts));
      fileHashes[relPath] = await hashFile(file.absPath);
    } catch (err) {
      failures.push({ file: relPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { chunks, fileHashes, needsOcr, failures, fileCount: files.length };
}
