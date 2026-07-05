// Walk the coursework tree and yield the files we ingest. Only PDF/DOCX/PPTX are
// ingestible — Excel is browse-only in v1, and images/other files are skipped.
// The top-level folder becomes the "course" for citations.
import { readdir } from "node:fs/promises";
import { join, extname, relative, sep } from "node:path";
import type { DocKind, SourceFile } from "./types";

const KIND_BY_EXT: Record<string, DocKind | undefined> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
};

/**
 * Recursively find every ingestible file under `rootDir`. Skips dotfiles/dot-dirs
 * (e.g. a `.index/` sitting alongside the docs) and non-ingestible types. Results
 * are sorted by relative path for deterministic, reproducible runs.
 */
export async function discoverFiles(rootDir: string): Promise<SourceFile[]> {
  const found: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // hidden files/dirs
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = KIND_BY_EXT[extname(entry.name).toLowerCase()];
      if (!kind) continue; // xlsx/images/other → skipped

      const relPath = relative(rootDir, abs);
      const course = relPath.split(sep)[0] ?? "";
      found.push({ absPath: abs, course, relPath, kind });
    }
  }

  await walk(rootDir);
  found.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return found;
}
