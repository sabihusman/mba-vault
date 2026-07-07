// The RAG orchestration: embed the question, retrieve the top-K chunks, then
// stream a grounded answer. Emits a "citations" event first (the sources are known
// before generation) followed by "text" events. Depends on small interfaces so it
// can be tested without calling Gemini.
import { search } from "./search";
import type { LoadedIndex, Loc } from "./index-store";

export const TOP_K = 8;
export const MAX_QUESTION_CHARS = 2000;

// LLM hardening (SECURITY.md §7): fix the role, forbid outside knowledge, require
// citations, and tell it to decline when the coursework doesn't cover the question.
export const SYSTEM_INSTRUCTION = [
  "You are MBA-Vault's study assistant. Answer the user's question using ONLY the",
  "numbered source excerpts provided in the prompt. Cite the excerpts you rely on",
  "inline as [1], [2], etc., matching their numbers. If the excerpts do not contain",
  "the answer, say you don't have that in the coursework — do not use outside",
  "knowledge, and do not guess. Be concise and specific.",
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
  k: number = TOP_K,
): AsyncGenerator<AskEvent> {
  const index = await deps.getIndex();
  const queryVector = await deps.embedQuery(question);
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
  );
  for await (const text of deps.generate(SYSTEM_INSTRUCTION, prompt)) {
    yield { type: "text", text };
  }
}

/** Assemble the numbered-sources prompt the answer is grounded on. */
export function buildPrompt(chunks: { course: string; file: string; loc: Loc; text: string }[], question: string): string {
  const sources = chunks
    .map((chunk, i) => `[${i + 1}] ${sourceLabel(chunk)}\n${chunk.text}`)
    .join("\n\n");
  return `Sources:\n${sources}\n\nQuestion: ${question}`;
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
