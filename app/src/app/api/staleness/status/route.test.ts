import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "./route";
import { writeRunStatus } from "../../../../lib/staleness/store";
import { tryAcquireRunLock, releaseRunLock, currentRunId } from "../../../../lib/staleness/run-guard";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mv-staleness-status-"));
  process.env.STATE_DIR = dir;
});

afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
  const stale = currentRunId();
  if (stale) releaseRunLock(stale);
});

describe("GET /api/staleness/status", () => {
  it("reports not running with the empty status before any run has happened", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      running: false,
      currentRunId: null,
      lastRunStartedAt: null,
      lastRunStatus: null,
      lastRunConceptsChecked: 0,
    });
  });

  it("reflects the last completed run's persisted status", async () => {
    await writeRunStatus({
      lastRunStartedAt: "2026-07-19T02:00:00.000Z",
      lastRunCompletedAt: "2026-07-19T02:05:00.000Z",
      lastRunStatus: "ok",
      lastRunFlaggedCount: 2,
      lastRunConceptsChecked: 8,
      lastRunConceptsTotal: 8,
      lastRunUngroundedDowngrades: 1,
      nextScheduledRun: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({
      running: false,
      lastRunStatus: "ok",
      lastRunConceptsChecked: 8,
      lastRunUngroundedDowngrades: 1,
    });
  });

  it("reports running:true with the live runId while a run is in progress", async () => {
    tryAcquireRunLock("run-in-progress");
    const res = await GET();
    const body = await res.json();
    expect(body.running).toBe(true);
    expect(body.currentRunId).toBe("run-in-progress");
  });

  it("is never cached", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
