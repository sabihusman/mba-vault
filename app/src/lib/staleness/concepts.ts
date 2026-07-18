// Auto-extracts a proposed concept/framework check-list from the existing
// vector index, grouped by course folder. This is the one-time (re-runnable)
// bootstrap step from the loop spec's "Concept list bootstrap" section — it
// reads the same index /ask already loads (read-only), samples a bounded
// amount of text per course so cost stays flat regardless of corpus size, and
// proposes concepts via Gemini. New concepts are appended as "pending";
// anything the user already reviewed (active/rejected) is left untouched.
import type { ChunkMeta } from "../ask/index-store";
import type { Concept } from "./types";
import type { ConceptExtractor } from "./gemini";

// Cap the sampled text per course so bootstrap cost doesn't scale with corpus
// size — enough breadth across a course's files without a "whole corpus" prompt.
export const SAMPLE_CHAR_BUDGET = 6000;
export const CHARS_PER_FILE = 500;

/** Sample text for one course: round-robin one chunk per file per round (not
 *  just the first file's chunks), so a course with many files gets breadth. */
export function sampleCourseText(chunks: ChunkMeta[], course: string): string {
  const byFile = new Map<string, ChunkMeta[]>();
  for (const chunk of chunks) {
    if (chunk.course !== course) continue;
    const list = byFile.get(chunk.file);
    if (list) list.push(chunk);
    else byFile.set(chunk.file, [chunk]);
  }

  const files = [...byFile.values()];
  const parts: string[] = [];
  let used = 0;
  let round = 0;
  while (used < SAMPLE_CHAR_BUDGET) {
    let addedThisRound = false;
    for (const fileChunks of files) {
      if (used >= SAMPLE_CHAR_BUDGET) break;
      const chunk = fileChunks[round];
      if (!chunk) continue;
      const text = chunk.text.slice(0, CHARS_PER_FILE);
      parts.push(text);
      used += text.length;
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round++;
  }
  return parts.join("\n---\n");
}

// Non-alphanumerics (including any diacritics NFKD decomposed out) collapse to
// a single dash; good enough for a stable internal id, not shown to the user.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BootstrapResult {
  proposed: Concept[]; // newly proposed concepts (status: pending) — not yet merged
  coursesSkipped: string[]; // courses with no sampleable text (shouldn't normally happen)
}

/** Run auto-extraction across every course present in the index. Does not
 *  touch stored state — callers merge the result with mergeConcepts(). */
export async function bootstrapConcepts(
  extractor: ConceptExtractor,
  chunks: ChunkMeta[],
): Promise<BootstrapResult> {
  const courses = [...new Set(chunks.map((c) => c.course))].sort();
  const proposed: Concept[] = [];
  const coursesSkipped: string[] = [];

  for (const course of courses) {
    const excerpts = sampleCourseText(chunks, course);
    if (!excerpts) {
      coursesSkipped.push(course);
      continue;
    }
    const extracted = await extractor.extractConcepts(course, excerpts);
    for (const concept of extracted) {
      proposed.push({
        id: slugify(`${course}-${concept.name}`),
        name: concept.name,
        course,
        description: concept.description,
        status: "pending",
        lastCheckedAt: null,
      });
    }
  }

  return { proposed, coursesSkipped };
}

/** Merge newly proposed concepts into the existing list: any id that already
 *  exists is left exactly as-is (preserves review decisions + lastCheckedAt);
 *  only genuinely new ids are appended, as "pending". */
export function mergeConcepts(existing: Concept[], proposed: Concept[]): Concept[] {
  const existingIds = new Set(existing.map((c) => c.id));
  const additions = proposed.filter((c) => !existingIds.has(c.id));
  return [...existing, ...additions];
}
