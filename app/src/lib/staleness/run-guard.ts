// Concurrency guard for the Staleness Detector loop: prevents two runs from
// overlapping. This is a SIMPLE IN-PROCESS guard (a module-level variable) —
// it only stops two triggers from overlapping *within this one Node process*.
//
// IMPORTANT — does NOT protect against Phase 4's cron: the systemd timer
// (Phase 4) runs the loop from a SEPARATE OS process (a CLI invocation), which
// this in-memory flag cannot see at all. Today that's harmless because only
// the app endpoint calls this guard — the CLI script runs manually, never
// concurrently with itself. But the moment the systemd timer exists, the app
// button and the cron CAN race and double-spend real money, since neither
// process can see the other's lock. Phase 4 MUST introduce a real file-based
// lock (e.g. flock-style exclusive create) *before or together with* the timer
// unit — never ship the timer without it. Keep this module's four-function
// interface (tryAcquireRunLock/releaseRunLock/isRunning/currentRunId) stable
// so that swap is a drop-in change for every caller (route handler, and the
// CLI script once it also needs to check the lock).
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
