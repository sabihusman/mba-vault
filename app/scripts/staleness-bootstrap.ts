/**
 * staleness-bootstrap — propose the Staleness Detector's concept check-list by
 * reading the existing vector index (read-only) and asking Gemini for the key
 * named concepts/frameworks per course. Safe to re-run: concepts you've already
 * reviewed (active/rejected) are left untouched; only genuinely new concepts are
 * appended as "pending".
 *
 * This is a ONE-TIME setup step (Phase 1 of the Staleness Detector), not part of
 * the recurring check loop (Phase 2) — it never calls the web search tool.
 *
 * Usage (run wherever the index + a writable state dir are reachable — e.g. on
 * the box itself, or locally against a local copy of both):
 *   GEMINI_API_KEY=... DATA_DIR=/path/to/data STATE_DIR=/path/to/state \
 *     npm run staleness:bootstrap
 *
 * After it runs, review the proposed concepts: open
 * $STATE_DIR/staleness/concepts.json and change each "pending" entry's
 * "status" to "active" (check it monthly) or "rejected" (ignore it). The loop
 * (Phase 2) only ever processes "active" concepts.
 */
import { getIndex } from "../src/lib/ask/index-store";
import { createGeminiConceptExtractor } from "../src/lib/staleness/gemini";
import { bootstrapConcepts, mergeConcepts } from "../src/lib/staleness/concepts";
import { readConceptList, writeConceptList } from "../src/lib/staleness/store";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail("GEMINI_API_KEY environment variable is required");

  console.log("Loading index …");
  const { chunks } = await getIndex();
  console.log(`  ${chunks.length} chunks loaded.`);

  console.log("Extracting concepts per course …");
  const extractor = createGeminiConceptExtractor(apiKey);
  const { proposed, coursesSkipped } = await bootstrapConcepts(extractor, chunks);

  const existing = await readConceptList();
  const merged = mergeConcepts(existing.concepts, proposed);
  const added = merged.length - existing.concepts.length;

  await writeConceptList({ generatedAt: new Date().toISOString(), concepts: merged });

  console.log(`\nDone: ${proposed.length} concepts proposed, ${added} new (rest already known).`);
  if (coursesSkipped.length > 0) {
    console.log(`  courses with no sampleable text (${coursesSkipped.length}): ${coursesSkipped.join(", ")}`);
  }
  console.log(`  total concepts on file: ${merged.length}`);
  console.log(
    "\nNext: review the check-list before it becomes active. Open the concepts file",
    "and set each pending entry's \"status\" to \"active\" or \"rejected\":",
  );
  console.log(`  ${process.env.STATE_DIR ?? "/state"}/staleness/concepts.json`);
}

function fail(message: string): never {
  console.error(`staleness-bootstrap: ${message}`);
  process.exit(1);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
