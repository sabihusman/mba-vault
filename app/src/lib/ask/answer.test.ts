import { describe, it, expect } from "vitest";
import {
  answerQuestion,
  buildPrompt,
  sourceLabel,
  capHistory,
  retrievalQuery,
  MAX_HISTORY_TURNS,
  MAX_HISTORY_ANSWER_CHARS,
  type AskDeps,
  type AskEvent,
  type Turn,
} from "./answer";
import type { ChunkMeta, LoadedIndex } from "./index-store";

function chunk(id: string, over: Partial<ChunkMeta> = {}): ChunkMeta {
  return { id, course: "Marketing", file: `Marketing/${id}.pdf`, loc: { kind: "page", index: 1 }, text: `text ${id}`, ...over };
}

function index(chunks: ChunkMeta[], rows: number[][], dims: number): LoadedIndex {
  return {
    manifest: { model: "t", dims, count: chunks.length, createdAt: "", files: {} },
    chunks,
    vectors: new Float32Array(rows.flat()),
  };
}

describe("answerQuestion", () => {
  it("emits top-K citations first, then the streamed answer text", async () => {
    const loaded = index([chunk("a"), chunk("b"), chunk("c")], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 3);

    const deps: AskDeps = {
      getIndex: async () => loaded,
      embedQuery: async () => new Float32Array([0.9, 0.1, 0]), // nearest "a", then "b"
      async *generate(systemInstruction, prompt) {
        expect(systemInstruction).toContain("ONLY");
        expect(prompt).toContain("Question: What is X?");
        expect(prompt).toContain("[1]");
        yield "The answer ";
        yield "is [1].";
      },
    };

    const events: AskEvent[] = [];
    for await (const event of answerQuestion(deps, "What is X?", [], 2)) events.push(event);

    const first = events[0];
    expect(first.type).toBe("citations");
    if (first.type !== "citations") throw new Error("expected citations first");
    expect(first.citations).toHaveLength(2);
    expect(first.citations[0]).toMatchObject({ n: 1, file: "Marketing/a.pdf" });
    expect(first.citations[1]).toMatchObject({ n: 2, file: "Marketing/b.pdf" });

    const text = events
      .filter((e): e is Extract<AskEvent, { type: "text" }> => e.type === "text")
      .map((e) => e.text)
      .join("");
    expect(text).toBe("The answer is [1].");
  });
});

describe("buildPrompt / sourceLabel", () => {
  it("numbers sources with a location-aware label", () => {
    const prompt = buildPrompt(
      [{ course: "C", file: "C/deck.pptx", loc: { kind: "slide", index: 5 }, text: "hi" }],
      "why?",
    );
    expect(prompt).toContain("[1] C / deck.pptx (slide 5)");
    expect(prompt).toContain("Question: why?");
  });

  it("omits the location for file-level (DOCX) sources", () => {
    expect(sourceLabel({ course: "C", file: "C/paper.docx", loc: { kind: "file" } })).toBe("C / paper.docx");
    expect(sourceLabel({ course: "C", file: "C/r.pdf", loc: { kind: "page", index: 3 } })).toBe("C / r.pdf (p. 3)");
  });

  it("adds a conversation block and 'Follow-up question' label when history is present", () => {
    const prompt = buildPrompt(
      [{ course: "C", file: "C/a.pdf", loc: { kind: "page", index: 1 }, text: "hi" }],
      "what about pricing?",
      [{ question: "what is a business model?", answer: "It is how a firm creates value [1]." }],
    );
    expect(prompt).toContain("Conversation so far:");
    expect(prompt).toContain("Q: what is a business model?");
    expect(prompt).toContain("A: It is how a firm creates value [1].");
    expect(prompt).toContain("Follow-up question: what about pricing?");
    expect(prompt).not.toContain("\nQuestion: "); // first-turn label not used
  });
});

describe("capHistory", () => {
  it("keeps only the last MAX_HISTORY_TURNS turns", () => {
    const many: Turn[] = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const capped = capHistory(many);
    expect(capped).toHaveLength(MAX_HISTORY_TURNS);
    expect(capped[0].question).toBe("q2"); // dropped q0, q1
    expect(capped.at(-1)?.question).toBe("q4");
  });

  it("truncates a long prior answer", () => {
    const long = "x".repeat(MAX_HISTORY_ANSWER_CHARS + 500);
    const [turn] = capHistory([{ question: "q", answer: long }]);
    expect(turn.answer.length).toBe(MAX_HISTORY_ANSWER_CHARS + 1); // +1 for the ellipsis
    expect(turn.answer.endsWith("…")).toBe(true);
  });
});

describe("retrievalQuery", () => {
  it("prepends the most recent prior question to anchor a follow-up", () => {
    expect(retrievalQuery("what about it?", [{ question: "explain CAC", answer: "…" }])).toBe(
      "explain CAC what about it?",
    );
  });

  it("returns the question unchanged with no history", () => {
    expect(retrievalQuery("explain CAC", [])).toBe("explain CAC");
  });
});
