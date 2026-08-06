// Plain-text extraction, one unit per form-feed-separated page. OCR output
// (tesseract) concatenates pages with \f between them, so splitting on \f keeps
// page numbers aligned with the source PDF; a file with no \f is a single page.
// The unit shape matches the PDF extractor's per-page loc (see pdf.ts:48).
import { readFile } from "node:fs/promises";
import type { ExtractedUnit } from "../types";

export async function extractTxt(absPath: string): Promise<ExtractedUnit[]> {
  let raw = await readFile(absPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip UTF-8 BOM

  const units: ExtractedUnit[] = [];
  // Page index comes from the segment's position, not from a running count of
  // non-empty pages — an empty page mid-document must not shift later citations.
  raw.split("\f").forEach((segment, i) => {
    const text = segment.replace(/\s+/g, " ").trim();
    if (text.length > 0) units.push({ loc: { kind: "page", index: i + 1 }, text });
  });
  return units;
}
