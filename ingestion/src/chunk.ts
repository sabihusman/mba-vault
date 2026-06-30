/**
 * Text chunking for the ingestion pipeline.
 *
 * This is the v1 word-window chunker (target size + overlap). The structure-aware
 * variants — one chunk per slide for PowerPoint, heading/section splits for Word &
 * PDF — build on top of this in the ingestion phase. Keeping it small and pure so it
 * is easy to unit-test (a required CI check).
 */

export interface ChunkOptions {
  /** Target words per chunk. Architecture doc target: ~300–600. */
  targetWords?: number;
  /** Overlap in words between consecutive chunks (~10–15%). */
  overlap?: number;
}

/**
 * Split `text` into overlapping word windows.
 * Returns [] for empty/whitespace-only input.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const targetWords = opts.targetWords ?? 450;
  const overlap = opts.overlap ?? Math.round(targetWords * 0.12);

  if (overlap >= targetWords) {
    throw new Error("overlap must be smaller than targetWords");
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = end - overlap;
  }
  return chunks;
}
