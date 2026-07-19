import { describe, it, expect } from "vitest";
import { runStalenessCheck, applyCheckedTimestamps, DEFAULT_COST_CAP_USD, DEFAULT_STEP_CAP } from "./loop";
import type { StalenessLoopDeps } from "./loop";
import type { Concept, ConceptFinding } from "./types";
import type { ChunkMeta, LoadedIndex } from "../ask/index-store";
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

function baseDeps(over: Partial<StalenessLoopDeps> = {}): StalenessLoopDeps {
  let t = Date.parse("2026-07-18T01:00:00.000Z");
  return {
    getIndex: async () => index([chunk("Product Management", "a.pdf", "some text")]),
    embedQuery: async () => new Float32Array([1, 0, 0]),
    compareConcept: async () => fixedResult(),
    now: () => new Date((t += 1000)),
    ...over,
  };
}

describe("runStalenessCheck — success path", () => {
  it("checks every active concept and reports status ok", async () => {
    const concepts = [concept("a"), concept("b")];
    const report = await runStalenessCheck(concepts, baseDeps());

    expect(report.status).toBe("ok");
    expect(report.stopReason).toBeNull();
    expect(report.findings).toHaveLength(2);
    expect(report.skipped).toEqual([]);
    expect(report.summary.conceptsTotal).toBe(2);
    expect(report.summary.conceptsChecked).toBe(2);
    expect(report.summary.steps).toBe(2);
  });

  it("counts stale and needs_review verdicts as flagged, not current/couldnt_verify", async () => {
    const concepts = [concept("a"), concept("b"), concept("c"), concept("d")];
    let call = 0;
    const verdicts: ConceptFinding["verdict"][] = ["current", "stale", "needs_review", "couldnt_verify"];
    const deps = baseDeps({ compareConcept: async () => fixedResult({ verdict: verdicts[call++] }) });

    const report = await runStalenessCheck(concepts, deps);
    expect(report.summary.flagged).toBe(2); // stale + needs_review
  });

  it("passes an already-downgraded finding through (loop.ts trusts the comparator, doesn't re-derive)", async () => {
    // The downgrade decision is made in gemini.ts's compareConcept; loop.ts just
    // carries the fields through and rolls up the count.
    const concepts = [concept("a"), concept("b"), concept("c")];
    let call = 0;
    const deps = baseDeps({
      compareConcept: async () => {
        call++;
        if (call === 1) {
          return fixedResult({ verdict: "couldnt_verify", modelVerdict: "current", downgradeReason: "ungrounded" });
        }
        return fixedResult(); // grounded "current", no downgrade
      },
    });

    const report = await runStalenessCheck(concepts, deps);
    expect(report.summary.ungroundedDowngrades).toBe(1);
    expect(report.summary.flagged).toBe(0); // downgraded verdict is couldnt_verify, not stale/needs_review
    expect(report.findings[0]).toMatchObject({ verdict: "couldnt_verify", modelVerdict: "current", downgradeReason: "ungrounded" });
    expect(report.findings[1]).toMatchObject({ verdict: "current", modelVerdict: "current", downgradeReason: null });
    expect(report.findings[2]).toMatchObject({ verdict: "current", modelVerdict: "current", downgradeReason: null });
  });

  it("returns an empty-but-valid report for zero active concepts", async () => {
    const report = await runStalenessCheck([], baseDeps());
    expect(report.status).toBe("ok");
    expect(report.findings).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.summary.conceptsTotal).toBe(0);
  });

  it("includes coursework excerpts with source refs in each finding", async () => {
    const report = await runStalenessCheck([concept("a")], baseDeps());
    expect(report.findings[0].courseworkSummary).toContain("Product Management");
    expect(report.findings[0].courseworkSummary).toContain("some text");
  });

  it("only retrieves excerpts from the concept's own course", async () => {
    const deps = baseDeps({
      getIndex: async () =>
        index([chunk("Product Management", "a.pdf", "pm text"), chunk("Finance", "b.pdf", "finance text")]),
    });
    const report = await runStalenessCheck([concept("a", { course: "Product Management" })], deps);
    expect(report.findings[0].courseworkSummary).toContain("pm text");
    expect(report.findings[0].courseworkSummary).not.toContain("finance text");
  });
});

describe("runStalenessCheck — stop conditions", () => {
  it("stops early when the cost cap is reached, skipping the rest with a reason", async () => {
    const concepts = [concept("a"), concept("b"), concept("c")];
    const deps = baseDeps({ compareConcept: async () => fixedResult({ costUsd: 0.6 }) });

    const report = await runStalenessCheck(concepts, deps, { costCapUsd: 1 });
    expect(report.status).toBe("partial");
    expect(report.stopReason).toMatch(/cost cap/);
    expect(report.findings).toHaveLength(2); // 0.6 + 0.6 = 1.2 >= 1 stops before the 3rd
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toMatch(/cost cap/);
  });

  it("stops early when the step cap is reached", async () => {
    const concepts = [concept("a"), concept("b"), concept("c")];
    const report = await runStalenessCheck(concepts, baseDeps(), { stepCap: 2 });
    expect(report.status).toBe("partial");
    expect(report.stopReason).toMatch(/step cap/);
    expect(report.findings).toHaveLength(2);
    expect(report.skipped).toHaveLength(1);
  });

  it("stops after 3 consecutive errors, but a success in between resets the counter", async () => {
    const concepts = [concept("a"), concept("b"), concept("c"), concept("d"), concept("e")];
    let call = 0;
    const deps = baseDeps({
      compareConcept: async () => {
        call++;
        // fail, fail, SUCCEED, fail, fail — never 3 in a row, so the run completes.
        if (call === 3) return fixedResult();
        throw new Error(`boom ${call}`);
      },
    });

    const report = await runStalenessCheck(concepts, deps);
    expect(report.status).toBe("ok");
    expect(report.findings).toHaveLength(1);
    expect(report.skipped).toHaveLength(4);
    expect(report.skipped.every((s) => s.reason.startsWith("error:"))).toBe(true);
  });

  it("actually stops after 3 TRUE consecutive errors", async () => {
    const concepts = [concept("a"), concept("b"), concept("c"), concept("d"), concept("e")];
    const deps = baseDeps({
      compareConcept: async () => {
        throw new Error("always fails");
      },
    });

    const report = await runStalenessCheck(concepts, deps);
    expect(report.status).toBe("partial");
    expect(report.stopReason).toMatch(/3 consecutive errors/);
    expect(report.findings).toEqual([]);
    expect(report.skipped).toHaveLength(5);
    // First 3 have the specific error reason; the last 2 were never attempted.
    expect(report.skipped[0].reason).toBe("error: always fails");
    expect(report.skipped[2].reason).toBe("error: always fails");
    expect(report.skipped[3].reason).toMatch(/3 consecutive errors/);
  });

  it("marks a couldnt_verify result as a finding, not a skip — it was genuinely attempted", async () => {
    const deps = baseDeps({ compareConcept: async () => fixedResult({ verdict: "couldnt_verify" }) });
    const report = await runStalenessCheck([concept("a")], deps);
    expect(report.findings).toHaveLength(1);
    expect(report.skipped).toEqual([]);
    expect(report.status).toBe("ok");
  });

  it("uses sane defaults matching the loop spec when no options are passed", () => {
    expect(DEFAULT_COST_CAP_USD).toBe(1);
    expect(DEFAULT_STEP_CAP).toBe(50);
  });
});

describe("runStalenessCheck — escalation", () => {
  it("surfaces an escalated (possible prompt-injection) finding without stopping the run", async () => {
    const concepts = [concept("a"), concept("b")];
    let call = 0;
    const deps = baseDeps({
      compareConcept: async () => (call++ === 0 ? fixedResult({ escalated: true, verdict: "needs_review" }) : fixedResult()),
    });
    const report = await runStalenessCheck(concepts, deps);
    expect(report.status).toBe("ok");
    expect(report.findings[0].escalated).toBe(true);
    expect(report.findings[1].escalated).toBe(false);
    expect(report.summary.flagged).toBe(1);
  });
});

describe("applyCheckedTimestamps", () => {
  it("updates lastCheckedAt only for concepts that have a finding", () => {
    const concepts = [
      concept("a", { status: "active", lastCheckedAt: null }),
      concept("b", { status: "active", lastCheckedAt: null }),
      concept("c", { status: "rejected", lastCheckedAt: null }),
    ];
    const findings: ConceptFinding[] = [
      {
        conceptId: "a",
        name: "a",
        course: "Product Management",
        verdict: "current",
        modelVerdict: "current",
        downgradeReason: null,
        courseworkSummary: "",
        currentSummary: "",
        evidenceLinks: [],
        confidenceNote: "",
        escalated: false,
        checkedAt: "2026-07-18T01:05:00.000Z",
      },
    ];
    const updated = applyCheckedTimestamps(concepts, findings);
    expect(updated.find((c) => c.id === "a")?.lastCheckedAt).toBe("2026-07-18T01:05:00.000Z");
    expect(updated.find((c) => c.id === "b")?.lastCheckedAt).toBeNull();
    expect(updated.find((c) => c.id === "c")?.lastCheckedAt).toBeNull();
  });
});
