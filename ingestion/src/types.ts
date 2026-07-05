// Shared types for the ingestion pipeline: what we discover on disk and what the
// extractors return. A "unit" is the smallest citable span — a PDF page, a slide,
// or (for Word, which has no fixed pages) the whole file.

export type DocKind = "pdf" | "docx" | "pptx";

export interface SourceFile {
  absPath: string; // full path on the local machine
  course: string; // top-level folder under the ingest root (the citation's "course")
  relPath: string; // path relative to the ingest root (stable id across machines)
  kind: DocKind;
}

/** Where a chunk came from, for `/ask` citations. */
export type Loc =
  | { kind: "page"; index: number } // 1-based PDF page
  | { kind: "slide"; index: number } // 1-based PPTX slide
  | { kind: "file" }; // whole file (DOCX has no reliable pagination)

export interface ExtractedUnit {
  loc: Loc;
  text: string;
}

export interface ExtractedDoc {
  file: SourceFile;
  units: ExtractedUnit[];
  /** True when a PDF yielded almost no text — likely scanned/image-only (OCR deferred). */
  needsOcr: boolean;
}
