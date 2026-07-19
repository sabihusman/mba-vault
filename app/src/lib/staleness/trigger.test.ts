import { describe, it, expect, vi } from "vitest";
import { triggerStalenessRun } from "./trigger";
import type { TriggerDeps } from "./trigger";

/** A tiny in-memory stand-in for run-guard.ts, scoped per test (unlike the
 *  real module-level singleton) so tests can't leak into each other. */
function fakeLock() {
  let runningId: string | null = null;
  return {
    tryAcquireRunLock: (runId: string) => {
      if (runningId !== null) return false;
      runningId = runId;
      return true;
    },
    releaseRunLock: (runId: string) => {
      if (runningId === runId) runningId = null;
    },
    currentRunId: () => runningId,
  };
}

function baseDeps(over: Partial<TriggerDeps> = {}): TriggerDeps {
  const lock = fakeLock();
  return {
    consumeRateLimit: async () => ({ blocked: false, retryAfterSeconds: 0 }),
    hasApiKey: () => true,
    tryAcquireRunLock: lock.tryAcquireRunLock,
    releaseRunLock: lock.releaseRunLock,
    currentRunId: lock.currentRunId,
    scheduleAfterResponse: (task) => void task(),
    executeRun: async () => ({}),
    now: () => new Date("2026-07-19T02:00:00.000Z"),
    ...over,
  };
}

describe("triggerStalenessRun", () => {
  it("returns rate_limited and never touches the lock or scheduler", async () => {
    const scheduler = vi.fn();
    const deps = baseDeps({
      consumeRateLimit: async () => ({ blocked: true, retryAfterSeconds: 42 }),
      scheduleAfterResponse: scheduler,
    });
    const result = await triggerStalenessRun(deps, "1.2.3.4");
    expect(result).toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
    expect(scheduler).not.toHaveBeenCalled();
  });

  it("returns not_configured when there's no API key, without touching the lock", async () => {
    const deps = baseDeps({ hasApiKey: () => false });
    const result = await triggerStalenessRun(deps, "1.2.3.4");
    expect(result).toEqual({ kind: "not_configured" });
    expect(deps.currentRunId()).toBeNull();
  });

  it("acquires the lock, schedules the run, and returns started + a runId", async () => {
    const scheduler = vi.fn();
    const deps = baseDeps({ scheduleAfterResponse: scheduler });
    const result = await triggerStalenessRun(deps, "1.2.3.4");
    expect(result.kind).toBe("started");
    expect(result).toMatchObject({ kind: "started", runId: expect.any(String) });
    expect(scheduler).toHaveBeenCalledTimes(1);
  });

  it("rejects a second trigger while the first's background task hasn't finished yet", async () => {
    let capturedTask: (() => Promise<void>) | null = null;
    const deps = baseDeps({ scheduleAfterResponse: (task) => (capturedTask = task) });

    const first = await triggerStalenessRun(deps, "1.2.3.4");
    expect(first.kind).toBe("started");

    // Second trigger arrives before the first's captured task has run at all.
    const second = await triggerStalenessRun(deps, "5.6.7.8");
    expect(second).toEqual({ kind: "already_running", runId: first.kind === "started" ? first.runId : null });

    // Now let the first task actually run and release its lock…
    expect(capturedTask).not.toBeNull();
    await capturedTask!();

    // …and a third trigger succeeds again.
    const third = await triggerStalenessRun(deps, "1.2.3.4");
    expect(third.kind).toBe("started");
  });

  it("releases the lock even if executeRun throws", async () => {
    let capturedTask: (() => Promise<void>) | null = null;
    const deps = baseDeps({
      scheduleAfterResponse: (task) => (capturedTask = task),
      executeRun: async () => {
        throw new Error("boom");
      },
    });

    await triggerStalenessRun(deps, "1.2.3.4");
    expect(deps.currentRunId()).not.toBeNull();

    await capturedTask!(); // trigger.ts catches internally, so this must not throw
    expect(deps.currentRunId()).toBeNull();
  });
});
