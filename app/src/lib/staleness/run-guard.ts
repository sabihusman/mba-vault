// Concurrency guard for the Staleness Detector loop: prevents two runs from
// overlapping. This is a SIMPLE IN-PROCESS guard (a module-level variable) —
// it only stops two triggers from overlapping *within this one Node process*.
//
// This turned out to be sufficient even after Phase 4 (the systemd timer): the
// timer does NOT spawn a separate OS process running the loop directly — it
// authenticates and calls the exact same POST /api/staleness/run endpoint the
// "Run now" button calls (see SECURITY.md's staleness-check section), so both
// triggers are always handled by this one long-running server process and
// this same in-memory guard. There is deliberately no separate CLI-invoked
// path in production (the standalone Docker image doesn't ship `scripts/` or
// a TS runner) — `staleness-run.ts` remains a local/manual dev-only entry
// point, never something the timer runs directly. If that ever changes (the
// loop gets triggered by a genuinely separate OS process), THIS guard would
// no longer be sufficient and would need a real file-based lock instead — see
// git history for the version of this comment from when that was the plan.
let runningId: string | null = null;

/** Acquire the lock for runId, or return false if a run is already in progress. */
export function tryAcquireRunLock(runId: string): boolean {
  if (runningId !== null) return false;
  runningId = runId;
  return true;
}

/** Release the lock, but only if it's still held by the caller's own runId —
 *  a stale release call (e.g. from a task that already lost the race) must
 *  never clear a DIFFERENT run's lock. */
export function releaseRunLock(runId: string): void {
  if (runningId === runId) runningId = null;
}

export function isRunning(): boolean {
  return runningId !== null;
}

export function currentRunId(): string | null {
  return runningId;
}
