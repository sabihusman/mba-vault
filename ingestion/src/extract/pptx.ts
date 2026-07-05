// PPTX text extraction, one unit per slide. A .pptx is a zip; the slide text
// lives in ppt/slides/slideN.xml inside <a:t> elements. We unzip with jszip and
// walk the parsed XML collecting every a:t value.
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedUnit } from "../types";

const parser = new XMLParser({ ignoreAttributes: true });
const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

export async function extractPptx(absPath: string): Promise<ExtractedUnit[]> {
  const zip = await JSZip.loadAsync(await readFile(absPath));

  const slides: { index: number; file: JSZip.JSZipObject }[] = [];
  zip.forEach((path, file) => {
    const match = SLIDE_RE.exec(path);
    if (match) slides.push({ index: Number(match[1]), file });
  });
  // Numeric sort so slide10 comes after slide2, not after slide1.
  slides.sort((a, b) => a.index - b.index);

  const units: ExtractedUnit[] = [];
  for (const { index, file } of slides) {
    const xml = await file.async("string");
    const runs: string[] = [];
    collectText(parser.parse(xml), runs);
    const text = runs.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 0) units.push({ loc: { kind: "slide", index }, text });
  }
  return units;
}

/** Recursively gather every `<a:t>` text value from the parsed slide XML. */
function collectText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "a:t") {
        pushScalarText(value, out);
      } else {
        collectText(value, out);
      }
    }
  }
}

function pushScalarText(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "number") out.push(String(value));
  else if (Array.isArray(value)) for (const item of value) pushScalarText(item, out);
}
