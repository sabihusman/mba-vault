// The shared "run the loop and persist everything" sequence, used by both the
// manual CLI (staleness-run.ts) and the Phase 3 app endpoint, so the write
// sequence — and its crash-safety guarantee — lives in exactly one place.
// Report-only: nothing here writes to /data or the vector index; it only
// reads the index (via loop deps) and writes to the /state volume (report,
// concepts, run-status).
import { getIndex } from "../ask/index-store";
import { createGeminiClient } from "../ask/gemini";
import { createGeminiComparator } from "./gemini";
import { applyCheckedTimestamps, runStalenessCheck } from "./loop";
import { readConceptList, writeConceptList, writeReport, writeRunStatus, toRunId } from "./store";
import type { StalenessLoopDeps, StalenessLoopOptions } from "./loop";
import type { Concept, ConceptList, RunStatus, StalenessReport } from "./types";

export interface OrchestrateDeps {
  readConceptList: () => Promise<ConceptList>;
  writeConceptList: (list: ConceptList) => Promise<void>;
  writeReport: (report: StalenessReport) => Promise<void>;
  writeRunStatus: (status: RunStatus) => Promise<void>;
  // Everything runStalenessCheck needs EXCEPT `now` — executeStalenessRun
  // supplies a clock that returns `startedAt` on its first call so the
  // report's own internally-generated runId always matches the runId a
  // caller may have already committed to (e.g. handed back to an HTTP client
  // before the run finishes — see the Phase 3 trigger).
  loop: Omit<StalenessLoopDeps, "now">;
}

/** A clock whose FIRST call returns `first` exactly, then behaves like a real
 *  clock afterward. Lets a caller pre-commit to a runId/startedAt and be sure
 *  runStalenessCheck's own `toRunId(startedAt)` produces that exact id. */
function fixedThenLiveClock(first: Date): () => Date {
  let used = false;
  return () => {
    if (used) return new Date();
    used = true;
    return first;
  };
}

function runStatusFrom(report: StalenessReport): RunStatus {
  return {
    lastRunStartedAt: report.startedAt,
    lastRunCompletedAt: report.finishedAt,
    lastRunStatus: report.status,
    lastRunFlaggedCount: report.summary.flagged,
    lastRunConceptsChecked: report.summary.conceptsChecked,
    lastRunConceptsTotal: report.summary.conceptsTotal,
    lastRunUngroundedDowngrades: report.summary.ungroundedDowngrades,
    nextScheduledRun: null, // set by the systemd timer once Phase 4 exists
  };
}

/**
 * Read the active concept check-list, run the loop, and persist the report +
 * updated concept timestamps + run status. Crash-safe: if ANYTHING throws
 * before a report is produced (a missing/corrupt index, a store read
 * failure), a "failed" RunStatus is still written before rethrowing — so a
 * caller that only fires this in the background (the Phase 3 endpoint) can
 * never leave state without ever reflecting the attempt. Combined with
 * "running" never being persisted at all (see run-guard.ts), this is what
 * guarantees state is never stuck at "running".
 */
export async function executeStalenessRun(
  deps: OrchestrateDeps,
  startedAt: Date,
  options: StalenessLoopOptions = {},
): Promise<StalenessReport> {
  try {
    const list = await deps.readConceptList();
    const active = list.concepts.filter((c: Concept) => c.status === "active");

    const report = await runStalenessCheck(active, { ...deps.loop, now: fixedThenLiveClock(startedAt) }, options);

    await deps.writeReport(report);
    const updatedConcepts = applyCheckedTimestamps(list.concepts, report.findings);
    await deps.writeConceptList({ generatedAt: list.generatedAt, concepts: updatedConcepts });
    await deps.writeRunStatus(runStatusFrom(report));

    return report;
  } catch (err) {
    const finishedAt = new Date();
    await deps
      .writeRunStatus({
        lastRunStartedAt: startedAt.toISOString(),
        lastRunCompletedAt: finishedAt.toISOString(),
        lastRunStatus: "failed",
        lastRunFlaggedCount: 0,
        lastRunConceptsChecked: 0,
        lastRunConceptsTotal: 0,
        lastRunUngroundedDowngrades: 0,
        nextScheduledRun: null,
      })
      .catch(() => {}); // best-effort — a second failure here must not mask the first
    console.error(`staleness run ${toRunId(startedAt)} crashed before producing a report:`, err);
    throw err;
  }
}

/** Real wiring shared by the CLI script and the Phase 3 route handler. */
export function createRealOrchestrateDeps(apiKey: string): OrchestrateDeps {
  const geminiClient = createGeminiClient(apiKey);
  const comparator = createGeminiComparator(apiKey);
  return {
    readConceptList,
    writeConceptList,
    writeReport,
    writeRunStatus,
    loop: {
      getIndex,
      embedQuery: (text) => geminiClient.embedQuery(text),
      compareConcept: (concept, excerpts) => comparator.compareConcept(concept, excerpts),
    },
  };
}
