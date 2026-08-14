import { describe, it, expect } from "vitest";
import { embedChunks, type BatchStat, type Embedder } from "./embed";

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

describe("embedChunks instrumentation and pacing", () => {
  it("reports one stat per batch with counts and an estimated token figure", async () => {
    const { embedder } = fakeEmbedder();
    const chunks = [
      { id: "a", text: "x".repeat(40) },
      { id: "b", text: "y".repeat(40) },
      { id: "c", text: "z".repeat(8) },
    ];
    const stats: BatchStat[] = [];
    await embedChunks(embedder, chunks, 2, undefined, {
      onBatch: (_batch, stat) => {
        stats.push(stat);
      },
    });

    expect(stats.map((s) => s.index)).toEqual([0, 1]);
    expect(stats.map((s) => s.count)).toEqual([2, 1]);
    expect(stats.map((s) => s.done)).toEqual([2, 3]);
    expect(stats.every((s) => s.total === 3)).toBe(true);
    expect(stats[0]!.estTokens).toBe(20); // 80 chars / 4
    expect(stats[1]!.estTokens).toBe(2); // 8 chars / 4
    expect(stats.every((s) => s.latencyMs >= 0)).toBe(true);
  });

  it("hands onBatch the chunks and vectors for that batch only", async () => {
    const { embedder } = fakeEmbedder();
    const chunks = [
      { id: "a", text: "alpha" },
      { id: "b", text: "beta" },
      { id: "c", text: "gamma" },
    ];
    const seen: string[][] = [];
    await embedChunks(embedder, chunks, 2, undefined, {
      onBatch: (batch) => {
        expect(batch.vectors).toHaveLength(batch.chunks.length);
        seen.push(batch.chunks.map((c) => c.id));
      },
    });
    expect(seen).toEqual([["a", "b"], ["c"]]);
  });

  it("does not delay by default", async () => {
    const { embedder } = fakeEmbedder();
    const chunks = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, text: `t${i}` }));
    const startedAt = Date.now();
    await embedChunks(embedder, chunks, 1);
    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  it("pauses between batches but not before the first or after the last", async () => {
    const { embedder } = fakeEmbedder();
    const chunks = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, text: `t${i}` }));
    const startedAt = Date.now();
    await embedChunks(embedder, chunks, 1, undefined, { delayMs: 25 });
    const elapsed = Date.now() - startedAt;
    // 3 batches ⇒ exactly 2 gaps.
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(300);
  });
});
