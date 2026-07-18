// Staleness Detector state: the concept check-list, on the same writable /state
// volume as Ask history (see history/store.ts) — /data is read-only, and this is
// exactly the kind of small, single-file, single-user state that volume exists
// for. Concepts live in one file so "review" is just editing a status field in
// place; there's no separate proposed/active split to keep in sync.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getStateDir } from "../history/store";
import type { ConceptList } from "./types";

const CONCEPTS_DIR = "staleness";
const CONCEPTS_FILE = "concepts.json";

// Guard the fixed relative path against the (env-provided) state dir, mirroring
// historyPath() — the path is constant so this always passes, but it validates
// before any filesystem access.
function conceptsPath(): string {
  const base = resolve(getStateDir());
  const target = resolve(base, CONCEPTS_DIR, CONCEPTS_FILE);
  if (target !== join(base, CONCEPTS_DIR, CONCEPTS_FILE) || !target.startsWith(base + sep)) {
    throw new Error("unsafe concepts path");
  }
  return target;
}

const EMPTY_LIST: ConceptList = { generatedAt: "", concepts: [] };

/** The concept check-list, or an empty list if bootstrap hasn't run yet. */
export async function readConceptList(): Promise<ConceptList> {
  try {
    const text = await readFile(conceptsPath(), "utf8");
    const parsed = JSON.parse(text) as ConceptList;
    if (!Array.isArray(parsed.concepts)) return EMPTY_LIST;
    return parsed;
  } catch {
    return EMPTY_LIST; // no file yet, or unreadable
  }
}

export async function writeConceptList(list: ConceptList): Promise<void> {
  const base = resolve(getStateDir());
  await mkdir(join(base, CONCEPTS_DIR), { recursive: true });
  await writeFile(conceptsPath(), JSON.stringify(list, null, 2) + "\n", "utf8");
}
