// Dispatch a discovered file to the right extractor and return a uniform
// ExtractedDoc. Only PDF carries an OCR flag; DOCX/PPTX always have a text layer.
import type { ExtractedDoc, SourceFile } from "../types";
import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";
import { extractPptx } from "./pptx";

export async function extractDocument(file: SourceFile): Promise<ExtractedDoc> {
  switch (file.kind) {
    case "pdf": {
      const { units, needsOcr } = await extractPdf(file.absPath);
      return { file, units, needsOcr };
    }
    case "docx":
      return { file, units: await extractDocx(file.absPath), needsOcr: false };
    case "pptx":
      return { file, units: await extractPptx(file.absPath), needsOcr: false };
  }
}

export { extractPdf } from "./pdf";
export { extractDocx } from "./docx";
export { extractPptx } from "./pptx";
