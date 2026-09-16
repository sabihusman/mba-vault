// Relevance instrumentation for retrieval (work order: "Relevance Gate on Ask +
// search_vault", phase 1 — "Ship the logging first"). This module computes and
// logs the calibration signals; it does NOT filter hits or refuse a question yet.
// That comes after the 40-question calibration run confirms the threshold still
// separates covered/near-miss/off-topic at scale (order of work: log, calibrate,
// look at the distribution, THEN write the gate).
//
// Deliberately NOT wired into lib/mcp/* : the Phase 4 security audit fixed the
// MCP/OAuth modules at zero logging (SECURITY.md §10 — "repo-wide grep: zero
// logging in mcp/oauth modules"), specifically so no request detail ever reaches
// process logs. search_vault (search-vault.ts) calls the exact same search()
// over the exact same index as Ask, so instrumenting Ask's retrieval covers both
// paths' score distribution without reopening that audited decision.
import type { SearchHit } from "./search";

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
