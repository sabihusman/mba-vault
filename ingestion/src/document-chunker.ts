// Structure-aware chunking: split each extracted unit (page/slide/file) into
// word-window chunks, carrying the citation provenance onto every chunk. Chunk
// ids are stable across runs and machines (relPath normalised to forward slashes)
// so incremental re-indexing can match them.
import type { ExtractedDoc, Loc } from "./types";
import { chunkText, type ChunkOptions } from "./chunk";

export interface Chunk {
  id: string; // `${relPath}::${locLabel}::${ordinal}` — stable, unique
  course: string;
  file: string; // relPath, forward-slashed
  loc: Loc;
  text: string;
}

export function chunkDocument(doc: ExtractedDoc, opts?: ChunkOptions): Chunk[] {
  const relPath = doc.file.relPath.replaceAll("\\", "/");
  const chunks: Chunk[] = [];

  for (const unit of doc.units) {
    const label = locLabel(unit.loc);
    chunkText(unit.text, opts).forEach((text, ordinal) => {
      chunks.push({
        id: `${relPath}::${label}::${ordinal}`,
        course: doc.file.course,
        file: relPath,
        loc: unit.loc,
        text,
      });
    });
  }

  return chunks;
}

/** Short, filesystem-safe location tag for a chunk id (p3, s12, file). */
function locLabel(loc: Loc): string {
  switch (loc.kind) {
    case "page":
      return `p${loc.index}`;
    case "slide":
      return `s${loc.index}`;
    case "file":
      return "file";
  }
}
