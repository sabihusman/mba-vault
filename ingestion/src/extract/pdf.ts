// PDF text extraction, one unit per page, via pdfjs (the "legacy" build is the
// Node-compatible one). A PDF that yields almost no text is treated as scanned/
// image-only and flagged needsOcr — OCR itself is deferred to a later pass.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ExtractedUnit } from "../types";

// pdfjs ships the 14 standard fonts; pointing at them silences a warning and
// improves glyph mapping. Resolve from the real install (hoisted to the repo root).
const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL =
  pathToFileURL(join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts/")).href;

// Fewer than this many non-whitespace characters across the whole document ⇒
// almost certainly a scanned PDF with no text layer.
const MIN_TEXT_CHARS = 16;

export interface PdfExtract {
  units: ExtractedUnit[];
  needsOcr: boolean;
}

export async function extractPdf(absPath: string): Promise<PdfExtract> {
  const data = new Uint8Array(await readFile(absPath));
  const loadingTask = pdfjs.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    verbosity: 0, // errors only — no per-page font warnings across hundreds of PDFs
  });
  const doc = await loadingTask.promise;

  const units: ExtractedUnit[] = [];
  let nonWhitespaceChars = 0;
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const pdfPage = await doc.getPage(page);
      try {
        const content = await pdfPage.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        nonWhitespaceChars += text.replace(/\s/g, "").length;
        if (text.length > 0) units.push({ loc: { kind: "page", index: page }, text });
      } finally {
        pdfPage.cleanup();
      }
    }
  } finally {
    // destroy() lives on the loading task, not the document proxy — it releases
    // the worker/transport and everything under it.
    await loadingTask.destroy();
  }

  return { units, needsOcr: nonWhitespaceChars < MIN_TEXT_CHARS };
}
