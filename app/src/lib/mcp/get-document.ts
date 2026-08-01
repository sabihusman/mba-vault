// The get_document tool (read scope): reconstruct a document's text FROM THE
// INDEX, in document order — never from the filesystem, and never with a new
// parser on the box. Containment story: the primary "guard" is index
// MEMBERSHIP (chunks are matched by exact relPath — an index lookup cannot
// traverse anywhere); the single filesystem touch is Browse's resolveFile
// (already containment-guarded) and exists only to tell apart "browse-only
// file" from "no such file", so the model learns the real reason instead of
// retrying.
import type { ChunkMeta, LoadedIndex, Loc } from "../ask/index-store";
import type { FileInfo } from "../browse/catalog";
import { parsePathSegments } from "./list-files";

/** Output cap. Truncation happens at a CHUNK boundary with an explicit marker
 *  — a silently clipped document reads as complete, which is worse than short. */
export const MAX_DOCUMENT_CHARS = 40_000;

export interface GetDocumentDeps {
  getIndex(): Promise<LoadedIndex>;
  resolveFile(segments: string[]): Promise<FileInfo | null>;
}

export type GetDocumentResult =
  | { kind: "ok"; text: string }
  | { kind: "browse_only"; message: string }
  | { kind: "not_found"; message: string };

function locOrder(loc: Loc): number {
  return loc.kind === "file" ? 0 : loc.index;
}

function locHeader(loc: Loc): string {
  switch (loc.kind) {
    case "page":
      return `— page ${loc.index} —`;
    case "slide":
      return `— slide ${loc.index} —`;
    case "file":
      return "— content —";
  }
}

export async function getDocument(deps: GetDocumentDeps, path: string): Promise<GetDocumentResult> {
  const segments = parsePathSegments(path);
  if (segments === null || segments.length === 0) {
    return { kind: "not_found", message: "Invalid path. Use a [file] path exactly as list_files printed it." };
  }
  const normalized = segments.join("/");

  const index = await deps.getIndex();
  const chunks = index.chunks
    .filter((c) => c.file === normalized)
    .sort((a, b) => locOrder(a.loc) - locOrder(b.loc));

  if (chunks.length === 0) {
    // Distinguish "exists but was never ingested" from "doesn't exist at all".
    const onDisk = await deps.resolveFile(segments);
    if (onDisk !== null) {
      return {
        kind: "browse_only",
        message:
          `"${normalized}" exists but is browse/download-only — it isn't in the Q&A index. ` +
          "Excel workbooks and image-only (un-OCR'd) PDFs are excluded from ingestion by design. " +
          "The owner can download it from the app's Browse tab.",
      };
    }
    return {
      kind: "not_found",
      message: `No such file: "${normalized}". Use list_files to see valid paths.`,
    };
  }

  return { kind: "ok", text: assemble(normalized, chunks) };
}

function assemble(path: string, chunks: ChunkMeta[]): string {
  const header = `${path} — ${chunks.length} indexed chunk${chunks.length === 1 ? "" : "s"} (${chunks[0].course})`;
  const parts: string[] = [header];
  let used = header.length;
  let included = 0;

  for (const chunk of chunks) {
    const block = `${locHeader(chunk.loc)}\n${chunk.text}`;
    if (used + block.length + 2 > MAX_DOCUMENT_CHARS) {
      // Degenerate guard: if even the FIRST chunk doesn't fit (shouldn't
      // happen with real ~1k-char chunks), hard-slice it rather than
      // returning a document with no content at all.
      if (included === 0) {
        parts.push(block.slice(0, MAX_DOCUMENT_CHARS - used - 2) + "…");
        included = 1;
      }
      break;
    }
    parts.push(block);
    used += block.length + 2;
    included++;
  }

  if (included < chunks.length) {
    parts.push(
      `— truncated: showing chunks 1–${included} of ${chunks.length}. ` +
        `The remaining ${chunks.length - included} chunk${chunks.length - included === 1 ? "" : "s"} were omitted for size (${MAX_DOCUMENT_CHARS.toLocaleString()}-character cap).`,
    );
  }
  return parts.join("\n\n");
}
