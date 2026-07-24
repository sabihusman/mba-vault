import { describe, expect, it } from "vitest";
// Relative import — vitest has no "@/" alias (same convention as store.test.ts).
import { verdictBadge, sortFindings, pickRunId, oneLine } from "./report-format";
import type { ConceptFinding } from "./types";

function finding(overrides: Partial<ConceptFinding>): ConceptFinding {
  return {
    conceptId: "c",
    name: "Concept",
    course: "Course",
    verdict: "current",
    modelVerdict: "current",
    downgradeReason: null,
    courseworkSummary: "",
    currentSummary: "",
    evidenceLinks: [],
    confidenceNote: "",
    escalated: false,
    checkedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("verdictBadge", () => {
  it("distinguishes an ungrounded downgrade from an honest no-match (spec item 4)", () => {
    const ungrounded = verdictBadge(
      finding({ verdict: "couldnt_verify", downgradeReason: "ungrounded" }),
    );
    const noMatch = verdictBadge(finding({ verdict: "couldnt_verify" }));
    expect(ungrounded.label).toMatch(/ungrounded/i);
    expect(ungrounded.tone).toBe("warn");
    expect(noMatch.label).toMatch(/no external match/i);
    expect(noMatch.tone).toBe("neutral");
    expect(ungrounded.label).not.toBe(noMatch.label);
  });

  it("maps the plain verdicts", () => {
    expect(verdictBadge(finding({ verdict: "current" }))).toEqual({ label: "Current", tone: "ok" });
    expect(verdictBadge(finding({ verdict: "stale" })).tone).toBe("err");
    expect(verdictBadge(finding({ verdict: "needs_review" })).tone).toBe("warn");
  });
});

describe("sortFindings", () => {
  it("orders worst-first: needs_review, stale, couldnt_verify, current", () => {
    const input = [
      finding({ conceptId: "a", verdict: "current" }),
      finding({ conceptId: "b", verdict: "couldnt_verify" }),
      finding({ conceptId: "c", verdict: "needs_review" }),
      finding({ conceptId: "d", verdict: "stale" }),
    ];
    expect(sortFindings(input).map((f) => f.conceptId)).toEqual(["c", "d", "b", "a"]);
    // Original array untouched.
    expect(input[0].conceptId).toBe("a");
  });
});

describe("pickRunId", () => {
  const ids = ["2026-07-18T14-30-05-123Z", "2026-01-02T03-04-05-678Z"]; // newest first, as the store returns

  it("defaults to the newest report", () => {
    expect(pickRunId(ids, null)).toBe(ids[0]);
  });

  it("honors a requested id that exists", () => {
    expect(pickRunId(ids, ids[1])).toBe(ids[1]);
  });

  it("falls back to newest for an unknown or hostile requested id", () => {
    expect(pickRunId(ids, "../../etc/passwd")).toBe(ids[0]);
    expect(pickRunId(ids, "nope")).toBe(ids[0]);
  });

  it("returns null when there are no reports", () => {
    expect(pickRunId([], "anything")).toBeNull();
  });
});

describe("oneLine", () => {
  it("flattens whitespace and truncates with an ellipsis", () => {
    expect(oneLine("a\n b\t c")).toBe("a b c");
    const long = "x".repeat(200);
    const out = oneLine(long);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);
  });
});
