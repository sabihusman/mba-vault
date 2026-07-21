import { describe, it, expect } from "vitest";
import { worst, type Status } from "./types";
import {
  diskStatus,
  certStatus,
  indexStatus,
  stalenessStatus,
  STALENESS_OVERDUE_DAYS,
  daysBetween,
  formatAge,
  formatBytes,
} from "./classify";

describe("worst", () => {
  it("returns the highest-severity status", () => {
    expect(worst(["ok", "ok"])).toBe("ok");
    expect(worst(["ok", "unknown"])).toBe("unknown");
    expect(worst(["ok", "unknown", "warn"])).toBe("warn");
    expect(worst(["warn", "err", "unknown"])).toBe("err");
  });
  it("treats unknown as less severe than a real warning", () => {
    expect(worst(["unknown", "warn"])).toBe("warn");
  });
  it("defaults to ok for an empty list", () => {
    expect(worst([] as Status[])).toBe("ok");
  });
});

describe("diskStatus", () => {
  it("warns low and errs nearly-full", () => {
    expect(diskStatus(0.5)).toBe("ok");
    expect(diskStatus(0.1)).toBe("warn");
    expect(diskStatus(0.02)).toBe("err");
  });
});

describe("certStatus", () => {
  it("maps days-left to status, unknown when unmeasured", () => {
    expect(certStatus(null)).toBe("unknown");
    expect(certStatus(6)).toBe("ok");
    expect(certStatus(2)).toBe("warn");
    expect(certStatus(1)).toBe("err");
    expect(certStatus(0)).toBe("err");
  });
});

describe("indexStatus", () => {
  it("errs when missing, warns when stale", () => {
    expect(indexStatus(false, 0)).toBe("err");
    expect(indexStatus(true, 5)).toBe("ok");
    expect(indexStatus(true, 45)).toBe("warn");
  });
});

describe("stalenessStatus", () => {
  const NOW = Date.parse("2026-07-20T00:00:00.000Z");
  const day = 86_400_000;

  it("is warn (never run) when no run has ever completed", () => {
    expect(stalenessStatus({ lastRunStatus: null, lastRunCompletedAt: null }, NOW)).toBe("warn");
  });

  it("is ok when the last run was ok and recent", () => {
    const completedAt = new Date(NOW - 10 * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "ok", lastRunCompletedAt: completedAt }, NOW)).toBe("ok");
  });

  it("is warn (overdue) when the last ok run is older than the threshold", () => {
    const completedAt = new Date(NOW - (STALENESS_OVERDUE_DAYS + 1) * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "ok", lastRunCompletedAt: completedAt }, NOW)).toBe("warn");
  });

  it("stays ok exactly at the threshold boundary (in whole days), warn one day past it", () => {
    // daysBetween floors to whole days, so the boundary has to move by a full
    // day (not 1ms) to actually cross it.
    const atThreshold = new Date(NOW - STALENESS_OVERDUE_DAYS * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "ok", lastRunCompletedAt: atThreshold }, NOW)).toBe("ok");
    const pastThreshold = new Date(NOW - (STALENESS_OVERDUE_DAYS + 1) * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "ok", lastRunCompletedAt: pastThreshold }, NOW)).toBe("warn");
  });

  it("is warn for a partial run, regardless of age", () => {
    const completedAt = new Date(NOW - 1 * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "partial", lastRunCompletedAt: completedAt }, NOW)).toBe("warn");
  });

  it("is err for a failed run, even a recent one", () => {
    const completedAt = new Date(NOW - 1 * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "failed", lastRunCompletedAt: completedAt }, NOW)).toBe("err");
  });

  it("a failed run stays err even if it's also very old — failure outranks overdue", () => {
    const completedAt = new Date(NOW - (STALENESS_OVERDUE_DAYS + 100) * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "failed", lastRunCompletedAt: completedAt }, NOW)).toBe("err");
  });

  it("never lets stale FINDINGS influence the result — the classifier's input has no findings field at all", () => {
    // This test exists to document intent: stalenessStatus only ever looks at
    // lastRunStatus/lastRunCompletedAt. There is no flaggedCount/downgrade
    // parameter for it to ignore — the type signature itself is the guarantee.
    const completedAt = new Date(NOW - 1 * day).toISOString();
    expect(stalenessStatus({ lastRunStatus: "ok", lastRunCompletedAt: completedAt }, NOW)).toBe("ok");
  });
});

describe("formatters", () => {
  it("daysBetween floors and never goes negative", () => {
    const day = 86_400_000;
    expect(daysBetween(0, 3 * day)).toBe(3);
    expect(daysBetween(3 * day, 0)).toBe(0);
  });
  it("formatAge is compact", () => {
    expect(formatAge(30 * 1000)).toBe("just now");
    expect(formatAge(5 * 60 * 1000)).toBe("5m");
    expect(formatAge(3 * 60 * 60 * 1000)).toBe("3h");
    expect(formatAge(2 * 86_400_000)).toBe("2d");
  });
  it("formatBytes scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});
