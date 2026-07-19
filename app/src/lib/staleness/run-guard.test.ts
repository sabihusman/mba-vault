import { describe, it, expect, beforeEach } from "vitest";
import { tryAcquireRunLock, releaseRunLock, isRunning, currentRunId } from "./run-guard";

// The guard is a module-level singleton, so reset it between tests by
// releasing whatever the previous test left locked.
beforeEach(() => {
  const stale = currentRunId();
  if (stale) releaseRunLock(stale);
});

describe("run-guard", () => {
  it("starts unlocked", () => {
    expect(isRunning()).toBe(false);
    expect(currentRunId()).toBeNull();
  });

  it("acquires the lock and reports it as running", () => {
    expect(tryAcquireRunLock("run-a")).toBe(true);
    expect(isRunning()).toBe(true);
    expect(currentRunId()).toBe("run-a");
  });

  it("refuses a second acquire while one is held", () => {
    expect(tryAcquireRunLock("run-a")).toBe(true);
    expect(tryAcquireRunLock("run-b")).toBe(false);
    expect(currentRunId()).toBe("run-a"); // unchanged by the failed attempt
  });

  it("releases and allows a new acquire afterward", () => {
    expect(tryAcquireRunLock("run-a")).toBe(true);
    releaseRunLock("run-a");
    expect(isRunning()).toBe(false);
    expect(tryAcquireRunLock("run-b")).toBe(true);
    expect(currentRunId()).toBe("run-b");
  });

  it("a stale release (wrong runId) does not clear a different run's lock", () => {
    expect(tryAcquireRunLock("run-a")).toBe(true);
    releaseRunLock("run-b"); // some other, already-superseded task calling release late
    expect(isRunning()).toBe(true);
    expect(currentRunId()).toBe("run-a");
  });
});
