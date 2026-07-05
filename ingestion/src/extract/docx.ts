// DOCX text extraction via mammoth. Word documents have no fixed pagination, so
// the whole doc is a single unit; citations for these are file-level.
import mammoth from "mammoth";
import type { ExtractedUnit } from "../types";

export async function extractDocx(absPath: string): Promise<ExtractedUnit[]> {
  const result = await mammoth.extractRawText({ path: absPath });
  const text = result.value
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n") // keep paragraph breaks, drop big gaps
    .trim();
  if (text.length === 0) return [];
  return [{ loc: { kind: "file" }, text }];
}
