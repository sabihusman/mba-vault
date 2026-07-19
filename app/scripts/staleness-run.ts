/**
 * staleness-run — the Staleness Detector loop (Phase 2). Checks every "active"
 * concept in the reviewed check-list against current web sources and writes a
 * dated report. Report-only: never writes to /data or the vector index.
 *
 * This is a manual CLI entry point. The Phase 3 app endpoint (POST
 * /api/staleness/run) calls the exact same executeStalenessRun() via the same
 * createRealOrchestrateDeps() wiring — this script is now a thin, console-
 * printing wrapper around it, so the run+persist sequence lives in one place
 * (lib/staleness/orchestrate.ts) rather than being duplicated here.
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
import { createRealOrchestrateDeps, executeStalenessRun } from "../src/lib/staleness/orchestrate";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail("GEMINI_API_KEY environment variable is required");

  const costCapUsd = process.env.COST_CAP_USD ? Number(process.env.COST_CAP_USD) : undefined;
  const stepCap = process.env.STEP_CAP ? Number(process.env.STEP_CAP) : undefined;

  console.log("Running staleness check …");
  const report = await executeStalenessRun(createRealOrchestrateDeps(apiKey), new Date(), { costCapUsd, stepCap });

  console.log(`\nRun ${report.runId}: ${report.status.toUpperCase()}`);
  if (report.stopReason) console.log(`  stopped early: ${report.stopReason}`);
  console.log(
    `  ${report.summary.conceptsChecked}/${report.summary.conceptsTotal} concepts checked, ` +
      `${report.summary.flagged} flagged, ${report.summary.ungroundedDowngrades} ungrounded-downgraded, ` +
      `${report.summary.steps} steps, ~$${report.summary.estimatedCostUsd.toFixed(4)} estimated cost`,
  );
  if (report.findings.length > 0) {
    console.log("\nFindings:");
    for (const f of report.findings) {
      const flag = f.verdict === "stale" || f.verdict === "needs_review" ? " ⚠" : "";
      const downgraded = f.downgradeReason ? ` (model said "${f.modelVerdict}", ${f.downgradeReason})` : "";
      console.log(`  [${f.verdict}]${flag}${downgraded} ${f.course} / ${f.name}`);
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
