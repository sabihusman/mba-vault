/**
 * staleness-run — the Staleness Detector loop (Phase 2). Checks every "active"
 * concept in the reviewed check-list against current web sources and writes a
 * dated report. Report-only: never writes to /data or the vector index.
 *
 * This is a manual CLI entry point for now — the systemd timer (Phase 4) and
 * app endpoint + button (Phase 3) will call the same runStalenessCheck() with
 * the same deps, just wired up differently.
 *
 * Usage:
 *   GEMINI_API_KEY=... DATA_DIR=/path/to/data STATE_DIR=/path/to/state \
 *     npm run staleness:run
 *
 *   Optional overrides (loop spec §3 — hard caps, not suggestions):
 *     COST_CAP_USD=1     # per-run cost cap in USD (estimate, see gemini.ts)
 *     STEP_CAP=50        # max concepts attempted this run
 *
 * Only concepts marked "active" (via staleness:bootstrap + your manual review)
 * are checked — "pending"/"rejected" concepts are skipped entirely, not even
 * counted in the report.
 */
import { getIndex } from "../src/lib/ask/index-store";
import { createGeminiClient } from "../src/lib/ask/gemini";
import { createGeminiComparator } from "../src/lib/staleness/gemini";
import { runStalenessCheck, applyCheckedTimestamps } from "../src/lib/staleness/loop";
import { readConceptList, writeConceptList, writeReport, writeRunStatus } from "../src/lib/staleness/store";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail("GEMINI_API_KEY environment variable is required");

  const costCapUsd = process.env.COST_CAP_USD ? Number(process.env.COST_CAP_USD) : undefined;
  const stepCap = process.env.STEP_CAP ? Number(process.env.STEP_CAP) : undefined;

  const list = await readConceptList();
  const active = list.concepts.filter((c) => c.status === "active");
  console.log(`${list.concepts.length} concepts on file, ${active.length} active.`);
  if (active.length === 0) {
    console.log("Nothing to check — review your concept list (staleness:bootstrap) and mark some \"active\".");
  }

  const geminiClient = createGeminiClient(apiKey);
  const comparator = createGeminiComparator(apiKey);

  console.log("Running staleness check …");
  const report = await runStalenessCheck(
    active,
    {
      getIndex,
      embedQuery: (text) => geminiClient.embedQuery(text),
      compareConcept: (concept, excerpts) => comparator.compareConcept(concept, excerpts),
      now: () => new Date(),
    },
    { costCapUsd, stepCap },
  );

  await writeReport(report);

  const updatedConcepts = applyCheckedTimestamps(list.concepts, report.findings);
  await writeConceptList({ generatedAt: list.generatedAt, concepts: updatedConcepts });

  await writeRunStatus({
    lastRunStartedAt: report.startedAt,
    lastRunCompletedAt: report.finishedAt,
    lastRunStatus: report.status,
    lastRunFlaggedCount: report.summary.flagged,
    nextScheduledRun: null, // set by the systemd timer once Phase 4 exists
  });

  console.log(`\nRun ${report.runId}: ${report.status.toUpperCase()}`);
  if (report.stopReason) console.log(`  stopped early: ${report.stopReason}`);
  console.log(
    `  ${report.summary.conceptsChecked}/${report.summary.conceptsTotal} concepts checked, ` +
      `${report.summary.flagged} flagged, ${report.summary.steps} steps, ` +
      `~$${report.summary.estimatedCostUsd.toFixed(4)} estimated cost`,
  );
  if (report.findings.length > 0) {
    console.log("\nFindings:");
    for (const f of report.findings) {
      const flag = f.verdict === "stale" || f.verdict === "needs_review" ? " ⚠" : "";
      console.log(`  [${f.verdict}]${flag} ${f.course} / ${f.name}`);
    }
  }
  if (report.skipped.length > 0) {
    console.log("\nSkipped:");
    for (const s of report.skipped) console.log(`  ${s.name} — ${s.reason}`);
  }
}

function fail(message: string): never {
  console.error(`staleness-run: ${message}`);
  process.exit(1);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
