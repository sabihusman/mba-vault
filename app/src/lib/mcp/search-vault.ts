// The search_vault tool's logic (MCP Phase 1): embed the query, brute-force
// cosine search over the existing index, return chunk text + citations.
// Retrieval-only — deliberately NO Gemini answer step (the calling model does
// its own reading), and read-only over the index by construction: it only ever
// touches getIndex()/search(), the same read path Ask uses. Small deps
// interface so tests inject a fake index and embedder (same pattern as
// answer.ts's AskDeps).
//
// Relevance-gate work order, phase 2: same whole-query gate as Ask (same
// threshold, ../ask/relevance.ts), but a DIFFERENT refusal payload. When
// nothing clears the gate, the calling model (Claude, ChatGPT) would otherwise
// answer from its own training data — reintroducing the exact ungrounded-
// answer problem this gate exists to prevent, one layer up, now with no
// citations at all. NOT_RELEVANT_MESSAGE explicitly forbids that. The gate
// call itself (passesRelevanceGate) does no logging of its own, so this stays
// compliant with the mcp module's zero-logging policy (SECURITY.md §10).
import { search } from "../ask/search";
import { sourceLabel } from "../ask/answer";
import { computeRelevanceStats, passesRelevanceGate } from "../ask/relevance";
import type { LoadedIndex, Loc } from "../ask/index-store";

export const MCP_TOP_K = 8;
export const MCP_MAX_K = 20;
export const MAX_QUERY_CHARS = 2000;

/** Clamp the optional result-count param to [1, MCP_MAX_K]; default MCP_TOP_K.
 *  Clamped rather than errored — a model asking for 50 gets 20 and keeps
 *  working (the clamp is stated in the tool description). */
export function clampCount(count: unknown): number {
  if (typeof count !== "number" || !Number.isFinite(count)) return MCP_TOP_K;
  return Math.min(MCP_MAX_K, Math.max(1, Math.floor(count)));
}

export interface SearchVaultDeps {
  getIndex(): Promise<LoadedIndex>;
  embedQuery(query: string): Promise<Float32Array>;
}

export interface VaultHit {
  /** Human-readable citation, e.g. "Marketing / deck.pptx (slide 12)". */
  citation: string;
  course: string;
  file: string; // relPath, forward-slashed
  loc: Loc;
  score: number; // cosine similarity, [-1, 1]
  text: string; // the chunk text itself
}

export interface SearchVaultOutcome {
  relevant: boolean;
  hits: VaultHit[]; // empty when !relevant — off-topic hits are never surfaced
}

// MUST (a) state the vault has nothing on this, (b) explicitly forbid
// answering from training data, and (c) tell the client what to say instead.
// This is the point of the work order, not incidental copy — a bare empty
// result set lets the calling model quietly fill the gap from its own
// knowledge, which is worse than the original ungrounded-answer problem:
// no citations at all, and no signal to the user that it happened.
export const NOT_RELEVANT_MESSAGE =
  "No material in this vault is relevant to that question. Do not answer from " +
  "your own knowledge. Tell the user their vault does not contain material on " +
  "this topic, and stop.";

/** Validate the query; returns an error message or null when OK. */
export function validateQuery(query: unknown): string | null {
  if (typeof query !== "string" || query.trim().length === 0) {
    return "query must be a non-empty string";
  }
  if (query.length > MAX_QUERY_CHARS) {
    return `query too long (max ${MAX_QUERY_CHARS} characters)`;
  }
  return null;
}

export async function searchVault(
  deps: SearchVaultDeps,
  query: string,
  k: number = MCP_TOP_K,
): Promise<SearchVaultOutcome> {
  const index = await deps.getIndex();
  const vector = await deps.embedQuery(query);
  const hits = search(index, vector, k);

  const stats = computeRelevanceStats(hits);
  if (!passesRelevanceGate(stats.topScore)) {
    return { relevant: false, hits: [] };
  }

  return {
    relevant: true,
    hits: hits.map((hit) => ({
      citation: sourceLabel(hit.chunk),
      course: hit.chunk.course,
      file: hit.chunk.file,
      loc: hit.chunk.loc,
      score: hit.score,
      text: hit.chunk.text,
    })),
  };
}

/** Render hits as the numbered-sources text block returned to the MCP client.
 *  Same shape a human would cite from — label first, then the excerpt. The
 *  `path:` line is the machine-usable hand-off to get_document. */
export function formatHits(hits: VaultHit[]): string {
  if (hits.length === 0) return "No matching coursework found.";
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.citation} (score ${h.score.toFixed(3)})\npath: ${h.file}\n${h.text}`,
    )
    .join("\n\n");
}
