import { describe, it, expect } from "vitest";
import { embedChunks, type Embedder } from "./embed";

// Fake embedder: records the batches it was asked to embed and returns a distinct
// 2-dim vector per text (first component = its call order) so we can assert mapping.
function fakeEmbedder(): { embedder: Embedder; batches: string[][] } {
  const batches: string[][] = [];
  let counter = 0;
  const embedder: Embedder = {
    async embedBatch(texts) {
      batches.push(texts);
      return texts.map(() => new Float32Array([counter++, 0]));
    },
  };
  return { embedder, batches };
}

describe("embedChunks", () => {
  it("maps every chunk id to its vector", async () => {
    const { embedder } = fakeEmbedder();
    const chunks = [
      { id: "a", text: "alpha" },
      { id: "b", text: "beta" },
    ];
    const byId = await embedChunks(embedder, chunks, 10);
    expect([...byId.keys()].sort()).toEqual(["a", "b"]);
    expect(byId.get("a")![0]).toBe(0);
    expect(byId.get("b")![0]).toBe(1);
  });

  it("splits into batches of batchSize and reports progress", async () => {
    const { embedder, batches } = fakeEmbedder();
    const chunks = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, text: `t${i}` }));
    const progress: number[] = [];
    const byId = await embedChunks(embedder, chunks, 2, (p) => progress.push(p.done));

    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(byId.size).toBe(5);
    expect(progress).toEqual([2, 4, 5]);
  });

  it("handles an empty chunk list without calling the embedder", async () => {
    const { embedder, batches } = fakeEmbedder();
    const byId = await embedChunks(embedder, [], 10);
    expect(byId.size).toBe(0);
    expect(batches).toEqual([]);
  });
});
