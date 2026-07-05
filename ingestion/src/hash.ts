// Content hash of a file, used by the manifest so incremental re-indexing can
// skip files whose bytes haven't changed.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function hashFile(absPath: string): Promise<string> {
  const bytes = await readFile(absPath);
  return createHash("sha256").update(bytes).digest("hex");
}
