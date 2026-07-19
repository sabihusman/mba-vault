import { describe, it, expect, vi } from "vitest";
import { executeStalenessRun } from "./orchestrate";
import { toRunId } from "./store";
import type { OrchestrateDeps } from "./orchestrate";
import type { ChunkMeta, LoadedIndex } from "../ask/index-store";
import type { Concept, ConceptList } from "./types";
import type { ConceptComparisonResult } from "./gemini";

function concept(id: string, over: Partial<Concept> = {}): Concept {
  return {
    id,
    name: id,
    course: "Product Management",
    description: `${id} description`,
    status: "active",
    lastCheckedAt: null,
    ...over,
  };
}

function chunk(course: string, file: string, text: string): ChunkMeta {
  return { id: `${file}::0`, course, file, loc: { kind: "page", index: 1 }, text };
}

function index(chunks: ChunkMeta[]): LoadedIndex {
  const dims = 3;
  const vectors = new Float32Array(chunks.length * dims);
  chunks.forEach((_, i) => vectors.set([1, 0, 0], i * dims));
  return { manifest: { model: "t", dims, count: chunks.length, createdAt: "", files: {} }, chunks, vectors };
}

function fixedResult(over: Partial<ConceptComparisonResult> = {}): ConceptComparisonResult {
  return {
    verdict: "current",
    modelVerdict: "current",
    downgradeReason: null,
    currentSummary: "still accurate",
    confidenceNote: "high",
    evidenceLinks: [],
    escalated: false,
    costUsd: 0.01,
    ...over,
  };
}

function fakeDeps(over: Partial<OrchestrateDeps> = {}, listOver: Partial<ConceptList> = {}): OrchestrateDeps {
  const list: ConceptList = { generatedAt: "2026-01-01T00:00:00.000Z", concepts: [concept("a")], ...listOver };
  return {
    readConceptList: vi.fn(async () => list),
    writeConceptList: vi.fn(async () => {}),
    writeReport: vi.fn(async () => {}),
    writeRunStatus: vi.fn(async () => {}),
    loop: {
      getIndex: async () => index([chunk("Product Management", "a.pdf", "some text")]),
      embedQuery: async () => new Float32Array([1, 0, 0]),
      compareConcept: async () => fixedResult(),
    },
    ...over,
  };
}

describe("executeStalenessRun — happy path", () => {
  it("produces a report whose runId matches the pre-committed startedAt", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps();
    const report = await executeStalenessRun(deps, startedAt);

    expect(report.runId).toBe(toRunId(startedAt));
    expect(report.startedAt).toBe(startedAt.toISOString());
    expect(report.status).toBe("ok");
  });

  it("persists the report, updated concept timestamps, and run status", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps();
    const report = await executeStalenessRun(deps, startedAt);

    expect(deps.writeReport).toHaveBeenCalledWith(report);
    expect(deps.writeConceptList).toHaveBeenCalledWith({
      generatedAt: "2026-01-01T00:00:00.000Z",
      concepts: [expect.objectContaining({ id: "a", lastCheckedAt: report.findings[0].checkedAt })],
    });
    expect(deps.writeRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        lastRunStatus: "ok",
        lastRunConceptsChecked: 1,
        lastRunConceptsTotal: 1,
        lastRunUngroundedDowngrades: 0,
      }),
    );
  });

  it("only checks active concepts, leaving pending/rejected ones out of the run entirely", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps(
      {},
      { concepts: [concept("a", { status: "active" }), concept("b", { status: "pending" }), concept("c", { status: "rejected" })] },
    );
    const report = await executeStalenessRun(deps, startedAt);
    expect(report.summary.conceptsTotal).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].conceptId).toBe("a");
  });
});

describe("executeStalenessRun — crash safety", () => {
  it("still writes a failed RunStatus, and rethrows, when the index can't be loaded", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps({
      loop: {
        getIndex: async () => {
          throw new Error("index corrupt");
        },
        embedQuery: async () => new Float32Array([1, 0, 0]),
        compareConcept: async () => fixedResult(),
      },
    });

    await expect(executeStalenessRun(deps, startedAt)).rejects.toThrow("index corrupt");
    expect(deps.writeRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        lastRunStatus: "failed",
        lastRunStartedAt: startedAt.toISOString(),
        lastRunConceptsChecked: 0,
      }),
    );
    // A crash before a report exists must never write a report or concept list.
    expect(deps.writeReport).not.toHaveBeenCalled();
    expect(deps.writeConceptList).not.toHaveBeenCalled();
  });

  it("still writes a failed RunStatus, and rethrows, when the concept list can't be read", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps({
      readConceptList: vi.fn(async () => {
        throw new Error("state dir unreadable");
      }),
    });

    await expect(executeStalenessRun(deps, startedAt)).rejects.toThrow("state dir unreadable");
    expect(deps.writeRunStatus).toHaveBeenCalledWith(expect.objectContaining({ lastRunStatus: "failed" }));
  });

  it("a second failure while writing the failed status doesn't mask the original error", async () => {
    const startedAt = new Date("2026-07-19T02:00:00.000Z");
    const deps = fakeDeps({
      readConceptList: vi.fn(async () => {
        throw new Error("original failure");
      }),
      writeRunStatus: vi.fn(async () => {
        throw new Error("state volume not mounted");
      }),
    });

    await expect(executeStalenessRun(deps, startedAt)).rejects.toThrow("original failure");
  });
});
