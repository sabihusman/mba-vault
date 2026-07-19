// The Staleness Detector loop (Phase 2): for each ACTIVE concept, retrieve its
// top coursework excerpts (read-only, existing index), compare them against
// current web sources via a grounded Gemini call, and append the result to a
// dated report. Enforces the loop spec's stop conditions (§3) as hard limits,
// not suggestions: a per-run cost cap, a total step cap, and a
// 3-consecutive-error circuit breaker. A stuck-stop still yields a valid
// partial report — every active concept ends up either checked (a finding) or
// explicitly skipped-with-reason; nothing is silently dropped.
//
// Report-only: nothing in this file writes to /data or the index. It only
// reads the index (via deps.getIndex/embedQuery) and returns a report object —
// callers (the CLI script, later the app endpoint) own all persistence.
import { search } from "../ask/search";
import { sourceLabel } from "../ask/answer";
import type { LoadedIndex } from "../ask/index-store";
import type { SearchHit } from "../ask/search";
import type { ConceptComparator } from "./gemini";
import { toRunId } from "./store";
import type { Concept, ConceptFinding, SkippedConcept, StalenessReport } from "./types";

export const DEFAULT_COST_CAP_USD = 1;
export const DEFAULT_STEP_CAP = 50;
export const MAX_CONSECUTIVE_ERRORS = 3;
export const TOP_K_CHUNKS = 5;

export interface StalenessLoopDeps {
  getIndex: () => Promise<LoadedIndex>;
  embedQuery: (text: string) => Promise<ArrayLike<number>>;
  compareConcept: ConceptComparator["compareConcept"];
  now: () => Date;
}

export interface StalenessLoopOptions {
  costCapUsd?: number;
  stepCap?: number;
}

/** Course-scoped top-K: search the whole index, then keep only hits from the
 *  concept's own course — a concept's comparison should never be grounded in
 *  another course's excerpts. */
function topConceptChunks(index: LoadedIndex, queryVector: ArrayLike<number>, course: string, k: number): SearchHit[] {
  return search(index, queryVector, index.chunks.length)
    .filter((hit) => hit.chunk.course === course)
    .slice(0, k);
}

function formatExcerpts(hits: SearchHit[]): string {
  if (hits.length === 0) return "(no coursework excerpts found for this concept)";
  return hits.map((hit) => `[${sourceLabel(hit.chunk)}]\n${hit.chunk.text}`).join("\n\n");
}

export async function runStalenessCheck(
  activeConcepts: Concept[],
  deps: StalenessLoopDeps,
  options: StalenessLoopOptions = {},
): Promise<StalenessReport> {
  const costCapUsd = options.costCapUsd ?? DEFAULT_COST_CAP_USD;
  const stepCap = options.stepCap ?? DEFAULT_STEP_CAP;

  const startedAt = deps.now();
  const findings: ConceptFinding[] = [];
  const skipped: SkippedConcept[] = [];

  let steps = 0;
  let estimatedCostUsd = 0;
  let consecutiveErrors = 0;
  let stopReason: string | null = null;

  const index = await deps.getIndex();

  for (const concept of activeConcepts) {
    if (steps >= stepCap) {
      stopReason = `run stopped early: step cap (${stepCap}) reached`;
      break;
    }
    if (estimatedCostUsd >= costCapUsd) {
      stopReason = `run stopped early: per-run cost cap ($${costCapUsd}) reached`;
      break;
    }

    steps++; // an attempt counts as a step whether it succeeds or errors

    try {
      const queryVector = await deps.embedQuery(`${concept.name}: ${concept.description}`);
      const hits = topConceptChunks(index, queryVector, concept.course, TOP_K_CHUNKS);
      const courseworkExcerpts = formatExcerpts(hits);

      const result = await deps.compareConcept(concept, courseworkExcerpts);
      estimatedCostUsd += result.costUsd;
      consecutiveErrors = 0;

      findings.push({
        conceptId: concept.id,
        name: concept.name,
        course: concept.course,
        verdict: result.verdict,
        modelVerdict: result.modelVerdict,
        downgradeReason: result.downgradeReason,
        courseworkSummary: courseworkExcerpts,
        currentSummary: result.currentSummary,
        evidenceLinks: result.evidenceLinks,
        confidenceNote: result.confidenceNote,
        escalated: result.escalated,
        checkedAt: deps.now().toISOString(),
      });
    } catch (err) {
      consecutiveErrors++;
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ conceptId: concept.id, name: concept.name, reason: `error: ${message}` });

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stopReason = `run stopped early: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`;
        break;
      }
    }
  }

  // Anything not yet accounted for (including the concept we were about to
  // start, if we stopped before attempting it) was never reached at all.
  const attemptedIds = new Set([...findings.map((f) => f.conceptId), ...skipped.map((s) => s.conceptId)]);
  for (const concept of activeConcepts) {
    if (attemptedIds.has(concept.id)) continue;
    skipped.push({ conceptId: concept.id, name: concept.name, reason: stopReason ?? "not reached" });
  }

  const finishedAt = deps.now();
  const flagged = findings.filter((f) => f.verdict === "stale" || f.verdict === "needs_review").length;
  const ungroundedDowngrades = findings.filter((f) => f.downgradeReason === "ungrounded").length;

  return {
    runId: toRunId(startedAt),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    status: stopReason ? "partial" : "ok",
    stopReason,
    findings,
    skipped,
    summary: {
      conceptsTotal: activeConcepts.length,
      conceptsChecked: findings.length,
      flagged,
      ungroundedDowngrades,
      steps,
      estimatedCostUsd,
      consecutiveErrors,
    },
  };
}

/** Merge each finding's checkedAt back into the FULL concept list (all
 *  statuses, not just active) so a store write preserves pending/rejected
 *  entries — and any active concept not in findings — exactly as they were. */
export function applyCheckedTimestamps(concepts: Concept[], findings: ConceptFinding[]): Concept[] {
  const checkedAt = new Map(findings.map((f) => [f.conceptId, f.checkedAt]));
  return concepts.map((c) => (checkedAt.has(c.id) ? { ...c, lastCheckedAt: checkedAt.get(c.id) ?? c.lastCheckedAt } : c));
}
