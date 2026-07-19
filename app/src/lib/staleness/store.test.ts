import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readConceptList,
  writeConceptList,
  writeReport,
  readReport,
  listReportIds,
  readRunStatus,
  writeRunStatus,
  toRunId,
} from "./store";
import type { ConceptList, StalenessReport, RunStatus } from "./types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mv-staleness-"));
  process.env.STATE_DIR = dir;
});

afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("staleness concept store", () => {
  it("returns an empty list when bootstrap hasn't run yet", async () => {
    expect(await readConceptList()).toEqual({ generatedAt: "", concepts: [] });
  });

  it("round-trips a written list", async () => {
    const list: ConceptList = {
      generatedAt: "2026-07-17T00:00:00.000Z",
      concepts: [
        {
          id: "investments-capm",
          name: "CAPM",
          course: "Investments",
          description: "Capital Asset Pricing Model relates expected return to systematic risk.",
          status: "pending",
          lastCheckedAt: null,
        },
      ],
    };
    await writeConceptList(list);
    expect(await readConceptList()).toEqual(list);
  });

  it("treats a corrupt or malformed file as an empty list rather than throwing", async () => {
    await mkdir(join(dir, "staleness"), { recursive: true });
    await writeFile(join(dir, "staleness", "concepts.json"), "{not valid json", "utf8");
    await expect(readConceptList()).resolves.toEqual({ generatedAt: "", concepts: [] });

    await writeFile(join(dir, "staleness", "concepts.json"), JSON.stringify({ generatedAt: "x" }), "utf8");
    await expect(readConceptList()).resolves.toEqual({ generatedAt: "", concepts: [] });
  });
});

function report(runId: string, over: Partial<StalenessReport> = {}): StalenessReport {
  return {
    runId,
    startedAt: "2026-07-18T01:00:00.000Z",
    finishedAt: "2026-07-18T01:05:00.000Z",
    status: "ok",
    stopReason: null,
    findings: [],
    skipped: [],
    summary: {
      conceptsTotal: 0,
      conceptsChecked: 0,
      flagged: 0,
      ungroundedDowngrades: 0,
      steps: 0,
      estimatedCostUsd: 0,
      consecutiveErrors: 0,
    },
    ...over,
  };
}

describe("toRunId", () => {
  it("strips colons and dots so the id is filesystem-safe", () => {
    const id = toRunId(new Date("2026-07-18T01:02:03.456Z"));
    expect(id).toBe("2026-07-18T01-02-03-456Z");
  });
});

describe("staleness reports", () => {
  it("returns null for a report that was never written", async () => {
    expect(await readReport(toRunId(new Date("2026-01-01T00:00:00.000Z")))).toBeNull();
  });

  it("round-trips a written report", async () => {
    const r = report(toRunId(new Date("2026-07-18T01:00:00.000Z")));
    await writeReport(r);
    expect(await readReport(r.runId)).toEqual(r);
  });

  it("fails closed (returns null, doesn't throw) for a runId outside the safe character set", async () => {
    // readReport swallows its own path-safety error the same way it swallows a
    // missing file — "not found" either way, never a path-traversal leak.
    await expect(readReport("../../etc/passwd")).resolves.toBeNull();
  });

  it("lists report ids newest-first", async () => {
    await writeReport(report(toRunId(new Date("2026-01-01T00:00:00.000Z"))));
    await writeReport(report(toRunId(new Date("2026-06-01T00:00:00.000Z"))));
    await writeReport(report(toRunId(new Date("2026-03-01T00:00:00.000Z"))));
    const ids = await listReportIds();
    expect(ids).toEqual([
      toRunId(new Date("2026-06-01T00:00:00.000Z")),
      toRunId(new Date("2026-03-01T00:00:00.000Z")),
      toRunId(new Date("2026-01-01T00:00:00.000Z")),
    ]);
  });

  it("returns an empty list when no reports exist yet", async () => {
    expect(await listReportIds()).toEqual([]);
  });
});

describe("run status", () => {
  const empty: RunStatus = {
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastRunStatus: null,
    lastRunFlaggedCount: 0,
    lastRunConceptsChecked: 0,
    lastRunConceptsTotal: 0,
    lastRunUngroundedDowngrades: 0,
    nextScheduledRun: null,
  };

  it("returns the empty status before any run", async () => {
    expect(await readRunStatus()).toEqual(empty);
  });

  it("round-trips a written status", async () => {
    const status: RunStatus = {
      lastRunStartedAt: "2026-07-18T01:00:00.000Z",
      lastRunCompletedAt: "2026-07-18T01:05:00.000Z",
      lastRunStatus: "ok",
      lastRunFlaggedCount: 2,
      lastRunConceptsChecked: 8,
      lastRunConceptsTotal: 8,
      lastRunUngroundedDowngrades: 1,
      nextScheduledRun: null,
    };
    await writeRunStatus(status);
    expect(await readRunStatus()).toEqual(status);
  });
});
