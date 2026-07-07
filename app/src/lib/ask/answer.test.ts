import { describe, it, expect } from "vitest";
import { answerQuestion, buildPrompt, sourceLabel, type AskDeps, type AskEvent } from "./answer";
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
    for await (const event of answerQuestion(deps, "What is X?", 2)) events.push(event);

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
});
