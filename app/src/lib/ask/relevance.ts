// Relevance instrumentation + gate for retrieval (work order: "Relevance Gate
// on Ask + search_vault"). Phase 1 shipped logging and ran the 40-question
// calibration; that run found covered/near-miss overlap, so per its own rule
// ("stop and report rather than tuning the number") no gate was written for
// near-miss. Manual relabeling afterward found most of the "near-miss" set was
// actually covered — the real, confirmed picture is:
//   covered            0.629 – 0.807
//   genuine near-miss  0.612 – 0.669
//   off-topic          0.497 – 0.557
// Off-topic still separates cleanly from everything else; near-miss does not
// separate from covered. This phase (2, narrowed) gates ONLY the clean
// separation: off-corpus questions. A question in an adjacent subject the
// vault doesn't actually cover will still pass and get answered — that's a
// known, deferred gap (needs reranking or an LLM relevance check), not an
// oversight.
//
// Deliberately NOT wired into lib/mcp/* : the Phase 4 security audit fixed the
// MCP/OAuth modules at zero logging (SECURITY.md §10 — "repo-wide grep: zero
// logging in mcp/oauth modules"), specifically so no request detail ever reaches
// process logs. search_vault (search-vault.ts) calls the exact same search()
// over the exact same index as Ask, so instrumenting Ask's retrieval covers both
// paths' score distribution without reopening that audited decision. The GATE
// (this module's passesRelevanceGate) is a pure function with no logging of its
// own, so search-vault.ts can call it directly without violating that policy.
import { EMBED_MODEL } from "./gemini";
import type { SearchHit } from "./search";

export const RELEVANCE_THRESHOLD_ENV = "ASK_RELEVANCE_THRESHOLD";

/** Calibrated 2026-09 against gemini-embedding-001 (see the module comment for
 *  the confirmed score ranges): sits above every off-topic result (max 0.557)
 *  and below every genuine question, covered or near-miss (min 0.612). This is
 *  a whole-query gate on the top chunk's score only — spread was tested and
 *  does not separate near-miss from covered, so it isn't used for gating. */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.58;

/** The threshold above is only valid for the model it was calibrated against —
 *  changing EMBED_MODEL invalidates this number and requires recalibration
 *  before it's trustworthy again. Documented here as a coupling marker rather
 *  than a runtime assertion: ingestion is laptop-only with exactly one
 *  operator, so a model change is already a deliberate, manual step. */
export const RELEVANCE_THRESHOLD_MODEL = EMBED_MODEL;

export interface RelevanceStats {
  hitCount: number;
  topScore: number | null; // cosine similarity of the best-matching chunk; null if no hits
  spread: number | null; // top-1 score minus the Nth (last) hit's score; null if <2 hits
  topChunkChars: number | null; // length of the best-matching chunk's text; null if no hits
}

/** Pure: derive the calibration signals from an already-sorted (desc) hit list. */
export function computeRelevanceStats(hits: SearchHit[]): RelevanceStats {
  if (hits.length === 0) {
    return { hitCount: 0, topScore: null, spread: null, topChunkChars: null };
  }
  const top = hits[0];
  const last = hits[hits.length - 1];
  return {
    hitCount: hits.length,
    topScore: top.score,
    spread: hits.length > 1 ? top.score - last.score : null,
    topChunkChars: top.chunk.text.length,
  };
}

/** One structured line per retrieval call. Numbers only — never the question text
 *  or chunk content — so this is safe to leave running in production. */
export function logRelevanceStats(stats: RelevanceStats): void {
  console.log(JSON.stringify({ event: "ask_relevance", ...stats }));
}

/** The configured threshold: the env override if it's a valid cosine value
 *  ([-1, 1]), otherwise the calibrated default. Mirrors envCap's NaN-guard
 *  reasoning (lib/staleness/env-caps.ts) — an unset or garbage value must fall
 *  back to the default, never silently disable the gate by passing NaN/Infinity
 *  through (NaN/Infinity comparisons are always false, which would let every
 *  query through regardless of score). */
export function relevanceThreshold(): number {
  const raw = process.env[RELEVANCE_THRESHOLD_ENV]?.trim();
  // Number("") and Number("  ") both coerce to 0 — a valid-looking cosine
  // value — so an unset/blank var must be caught before Number(), not after,
  // or a whitespace env value would silently become threshold 0.
  if (!raw) return DEFAULT_RELEVANCE_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= -1 && n <= 1 ? n : DEFAULT_RELEVANCE_THRESHOLD;
}

/** Whole-query gate: is the top chunk relevant enough to answer from at all?
 *  Not a per-chunk filter — sub-threshold chunks among an otherwise-relevant
 *  result set are left alone; only the top score decides whether to answer
 *  the query at all. */
export function passesRelevanceGate(
  topScore: number | null,
  threshold: number = relevanceThreshold(),
): boolean {
  return topScore !== null && topScore >= threshold;
}
