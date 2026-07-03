/**
 * Maps a file extension to a Content-Type and a disposition (inline vs download).
 * Kept separate from the route handler so it's easy to unit-test and extend.
 */

// Extensions we're happy to render in the browser tab; everything else downloads.
const INLINE_EXTS = new Set(["pdf", "txt", "md", "png", "jpg", "jpeg", "gif", "webp", "svg"]);

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
  xls: "application/vnd.ms-excel",
};

export function contentTypeFor(ext: string): string {
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function dispositionFor(ext: string): "inline" | "attachment" {
  return INLINE_EXTS.has(ext) ? "inline" : "attachment";
}

/**
 * Build a Content-Disposition header value. Includes both an ASCII-sanitised
 * `filename` (for old clients) and a UTF-8 `filename*` (RFC 5987) so names with
 * spaces or non-ASCII characters download correctly.
 */
export function contentDisposition(kind: "inline" | "attachment", name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
