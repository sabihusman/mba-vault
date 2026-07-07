// The RAG orchestration: embed the question, retrieve the top-K chunks, then
// stream a grounded answer. Emits a "citations" event first (the sources are known
// before generation) followed by "text" events. Depends on small interfaces so it
// can be tested without calling Gemini. Supports multi-turn follow-ups: prior Q&A
// is folded into the prompt (capped) so references like "what about X?" resolve.
import { search } from "./search";
import type { LoadedIndex, Loc } from "./index-store";

export const TOP_K = 8;
export const MAX_QUESTION_CHARS = 2000;

// Follow-up context caps (token-cost backstop). Only the most recent turns are
// sent, and each prior answer is truncated — enough for the model to resolve a
// reference without paying to re-send the whole thread every turn.
export const MAX_HISTORY_TURNS = 3;
export const MAX_HISTORY_ANSWER_CHARS = 800;

export interface Turn {
  question: string;
  answer: string;
}

// LLM hardening (SECURITY.md §7): fix the role, forbid outside knowledge, require
// citations, and decline when the coursework doesn't cover the question. It also
// steers toward a synthesized explanation drawn from ALL the excerpts rather than
// echoing the single nearest chunk (the earlier "be concise" wording did that).
export const SYSTEM_INSTRUCTION = [
  "You are MBA-Vault's study assistant. Answer the user's question using ONLY the",
  "numbered source excerpts provided in the prompt — never outside knowledge.",
  "Synthesize a thorough, well-structured explanation that draws on ALL of the",
  "relevant excerpts, not just the closest one: explain the concept in your own",
  "words, connect what the different sources say, and give enough detail to be",
  "genuinely useful for studying. Cite the excerpts you rely on inline as [1],",
  "[2], etc., matching their numbers. If the excerpts do not actually contain the",
  "answer, say you don't have that in the coursework — do not guess or pad with",
  "outside knowledge. When the question is a follow-up, use the conversation so",
  "far to resolve what it refers to, but still ground every claim in the excerpts.",
].join(" ");

export interface Citation {
  n: number; // 1-based, matches the [n] markers in the prompt/answer
  course: string;
  file: string; // relPath, forward-slashed
  loc: Loc;
  score: number;
}

export type AskEvent =
  | { type: "citations"; citations: Citation[] }
  | { type: "text"; text: string };

export interface AskDeps {
  getIndex(): Promise<LoadedIndex>;
  embedQuery(question: string): Promise<Float32Array>;
  generate(systemInstruction: string, prompt: string): AsyncGenerator<string>;
}

export async function* answerQuestion(
  deps: AskDeps,
  question: string,
  history: Turn[] = [],
  k: number = TOP_K,
): AsyncGenerator<AskEvent> {
  const recent = capHistory(history);
  const index = await deps.getIndex();
  // Fold the previous question into the retrieval query so a terse follow-up
  // ("what about pricing?") still retrieves against its actual subject.
  const queryVector = await deps.embedQuery(retrievalQuery(question, recent));
  const hits = search(index, queryVector, k);

  const citations: Citation[] = hits.map((hit, i) => ({
    n: i + 1,
    course: hit.chunk.course,
    file: hit.chunk.file,
    loc: hit.chunk.loc,
    score: hit.score,
  }));
  yield { type: "citations", citations };

  const prompt = buildPrompt(
    hits.map((hit) => hit.chunk),
    question,
    recent,
  );
  for await (const text of deps.generate(SYSTEM_INSTRUCTION, prompt)) {
    yield { type: "text", text };
  }
}

/** Keep only the last few turns; truncate each prior answer. Authoritative cap. */
export function capHistory(history: Turn[]): Turn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    question: turn.question,
    answer: truncate(turn.answer, MAX_HISTORY_ANSWER_CHARS),
  }));
}

/** Retrieval query: prepend the most recent prior question to anchor pronouns. */
export function retrievalQuery(question: string, history: Turn[]): string {
  const prev = history[history.length - 1];
  return prev ? `${prev.question} ${question}` : question;
}

/** Assemble the numbered-sources prompt the answer is grounded on. */
export function buildPrompt(
  chunks: { course: string; file: string; loc: Loc; text: string }[],
  question: string,
  history: Turn[] = [],
): string {
  const sources = chunks
    .map((chunk, i) => `[${i + 1}] ${sourceLabel(chunk)}\n${chunk.text}`)
    .join("\n\n");

  const conversation = history.length
    ? "Conversation so far:\n" +
      history.map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`).join("\n\n") +
      "\n\n"
    : "";

  const label = history.length ? "Follow-up question" : "Question";
  return `Sources:\n${sources}\n\n${conversation}${label}: ${question}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "…";
}

/** Human-readable citation label, e.g. "Marketing / deck.pptx (slide 12)". */
export function sourceLabel(chunk: { course: string; file: string; loc: Loc }): string {
  const name = chunk.file.split("/").pop() ?? chunk.file;
  const where = locLabel(chunk.loc);
  return where ? `${chunk.course} / ${name} (${where})` : `${chunk.course} / ${name}`;
}

function locLabel(loc: Loc): string {
  switch (loc.kind) {
    case "page":
      return `p. ${loc.index}`;
    case "slide":
      return `slide ${loc.index}`;
    case "file":
      return "";
  }
}
