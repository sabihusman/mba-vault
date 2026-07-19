// The testable core of POST /api/staleness/run. Next 16's `after()` (from
// next/server) throws if called outside a real request scope, which means a
// route handler that calls it inline can't be unit-tested by calling POST()
// directly. So the scheduler is an injected dependency here — the route
// handler wires the real `after`; tests wire a fake that can capture the
// scheduled task instead of running it, which is what makes the
// already-running race actually testable (see trigger.test.ts).
import { toRunId } from "./store";

export interface TriggerDeps {
  consumeRateLimit: (ip: string) => Promise<{ blocked: boolean; retryAfterSeconds: number }>;
  hasApiKey: () => boolean;
  tryAcquireRunLock: (runId: string) => boolean;
  releaseRunLock: (runId: string) => void;
  currentRunId: () => string | null;
  scheduleAfterResponse: (task: () => Promise<void>) => void;
  executeRun: (startedAt: Date) => Promise<unknown>;
  now: () => Date;
}

export type TriggerResult =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "not_configured" }
  | { kind: "already_running"; runId: string | null }
  | { kind: "started"; runId: string };

export async function triggerStalenessRun(deps: TriggerDeps, ip: string): Promise<TriggerResult> {
  const limit = await deps.consumeRateLimit(ip);
  if (limit.blocked) return { kind: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };

  if (!deps.hasApiKey()) return { kind: "not_configured" };

  const startedAt = deps.now();
  const runId = toRunId(startedAt);
  if (!deps.tryAcquireRunLock(runId)) {
    return { kind: "already_running", runId: deps.currentRunId() };
  }

  deps.scheduleAfterResponse(async () => {
    try {
      await deps.executeRun(startedAt);
    } catch (err) {
      // executeStalenessRun already persists a "failed" RunStatus itself before
      // rethrowing (orchestrate.ts) — this is only a last-resort log so a bug
      // in that guarantee still can't leave the lock stuck forever (the
      // `finally` below always runs regardless).
      console.error(`staleness run ${runId} failed`, err);
    } finally {
      deps.releaseRunLock(runId);
    }
  });

  return { kind: "started", runId };
}
