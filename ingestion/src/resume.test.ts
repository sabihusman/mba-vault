// The claim under test: a resumed run produces the same index as an
// uninterrupted one, AND it resumes rather than silently restarting. Byte
// equality alone would pass even if the cache did nothing, so every equality
// assertion is paired with an assertion about what the embedder was asked for.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runIngest } from "./run";
import { l2normalize } from "./vector";
import type { Embedder } from "./embed";
import { buildMinimalDocx, buildMinimalPdf, buildMinimalPptx } from "./fixtures";

const DIMS = 8;
const MODEL = "test-model";
const FORM_FEED = String.fromCharCode(12);

/** Deterministic: identical text ⇒ byte-identical vector, so runs are comparable. */
function vectorFor(text: string): Float32Array {
  const values: number[] = [];
  let digest = createHash("sha256").update(text).digest();
  while (values.length < DIMS) {
    for (let i = 0; i + 1 < digest.length && values.length < DIMS; i += 2) {
      values.push(digest.readInt16LE(i) / 32768);
    }
    digest = createHash("sha256").update(digest).digest();
  }
  return l2normalize(values);
}

/** Records every text it is asked to embed; optionally dies after N batches. */
function recordingEmbedder(failAfterBatches = Number.POSITIVE_INFINITY): {
  embedder: Embedder;
  calls: string[];
} {
  const calls: string[] = [];
  let batches = 0;
  const embedder: Embedder = {
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (batches >= failAfterBatches) throw new Error("simulated 429");
      batches += 1;
      calls.push(...texts);
      return texts.map(vectorFor);
    },
  };
  return { embedder, calls };
}

async function buildCorpus(root: string, memoBody: string): Promise<void> {
  const course = join(root, "Course A");
  await mkdir(course, { recursive: true });
  await writeFile(join(course, "notes.pdf"), buildMinimalPdf(["alpha page one", "beta page two"]));
  await writeFile(join(course, "memo.docx"), await buildMinimalDocx([memoBody]));
  await writeFile(
    join(course, "deck.pptx"),
    await buildMinimalPptx([["slide one text"], ["slide two text"]]),
  );
  await writeFile(join(course, "plain.txt"), `gamma one${FORM_FEED}gamma two`, "utf8");
}

async function readChunks(outDir: string): Promise<{ id: string; file: string; text: string }[]> {
  const text = await readFile(join(outDir, "chunks.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { id: string; file: string; text: string });
}

async function readRow(outDir: string, index: number): Promise<number[]> {
  const buf = await readFile(join(outDir, "vectors.bin"));
  const copy = new ArrayBuffer(DIMS * 4);
  new Uint8Array(copy).set(buf.subarray(index * DIMS * 4, (index + 1) * DIMS * 4));
  return [...new Float32Array(copy)];
}

describe("resume", () => {
  let tmp: string;
  let root: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "mbav-resume-"));
    root = join(tmp, "corpus");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("produces a byte-identical index and re-embeds only what was missing", async () => {
    await buildCorpus(root, "memo body original");
    const outA = join(tmp, "outA");
    const outB = join(tmp, "outB");
    const cacheA = join(tmp, "cacheA");
    const cacheB = join(tmp, "cacheB");
    const common = { root, batchSize: 2, dims: DIMS, model: MODEL } as const;

    // Control: one uninterrupted run.
    const a = recordingEmbedder();
    await runIngest({ ...common, outDir: outA, embedder: a.embedder, cacheDir: cacheA });

    // Interrupted: two batches land, the third dies.
    const b = recordingEmbedder(2);
    await expect(
      runIngest({ ...common, outDir: outB, embedder: b.embedder, cacheDir: cacheB }),
    ).rejects.toThrow(/simulated 429/);

    // Nothing was written — the property that made the real 429 safe.
    await expect(stat(join(outB, "chunks.jsonl"))).rejects.toThrow();
    expect(b.calls.length).toBe(4); // 2 batches × 2

    // Resume against the same cache.
    const c = recordingEmbedder();
    await runIngest({ ...common, outDir: outB, embedder: c.embedder, cacheDir: cacheB });

    // Same index, byte for byte.
    expect(await readFile(join(outB, "vectors.bin"))).toEqual(
      await readFile(join(outA, "vectors.bin")),
    );
    expect(await readFile(join(outB, "chunks.jsonl"), "utf8")).toBe(
      await readFile(join(outA, "chunks.jsonl"), "utf8"),
    );
    const manifestA = JSON.parse(await readFile(join(outA, "manifest.json"), "utf8")) as Record<string, unknown>;
    const manifestB = JSON.parse(await readFile(join(outB, "manifest.json"), "utf8")) as Record<string, unknown>;
    delete manifestA.createdAt;
    delete manifestB.createdAt;
    expect(manifestB).toEqual(manifestA);

    // THE assertion. Without this, the test passes even if the cache is inert
    // and run C re-embedded everything from scratch.
    expect(c.calls.length).toBe(a.calls.length - b.calls.length);
    expect(c.calls.some((text) => b.calls.includes(text))).toBe(false);
    expect([...b.calls, ...c.calls].sort()).toEqual([...a.calls].sort());
  });

  it("re-embeds a chunk whose text changed even though its id did not", async () => {
    // Chunk ids are `relPath::locLabel::ordinal`, so editing a file's content
    // leaves the id identical. An id-keyed cache would serve the stale vector.
    await buildCorpus(root, "memo body original");
    const out = join(tmp, "out");
    const cache = join(tmp, "cache");
    const common = { root, outDir: out, cacheDir: cache, batchSize: 2, dims: DIMS, model: MODEL } as const;

    const first = recordingEmbedder();
    await runIngest({ ...common, embedder: first.embedder });
    expect(first.calls).toContain("memo body original");

    await writeFile(join(root, "Course A", "memo.docx"), await buildMinimalDocx(["memo body REVISED"]));

    const second = recordingEmbedder();
    await runIngest({ ...common, embedder: second.embedder });

    // It must have gone back to the API for the edited text.
    expect(second.calls).toContain("memo body REVISED");

    // And the stored vector must be the new one, not the cached stale one.
    const chunks = await readChunks(out);
    const index = chunks.findIndex((chunk) => chunk.file.endsWith("memo.docx"));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(chunks[index]!.text).toBe("memo body REVISED");
    expect(await readRow(out, index)).toEqual([...vectorFor("memo body REVISED")]);
    expect(await readRow(out, index)).not.toEqual([...vectorFor("memo body original")]);
  });

  it("leaves an existing index byte-identical when embedding fails", async () => {
    await buildCorpus(root, "memo body original");
    const out = join(tmp, "out");
    const common = { root, outDir: out, batchSize: 2, dims: DIMS, model: MODEL } as const;

    const ok = recordingEmbedder();
    await runIngest({ ...common, embedder: ok.embedder, cacheDir: join(tmp, "cache1") });
    const before = {
      chunks: await readFile(join(out, "chunks.jsonl")),
      vectors: await readFile(join(out, "vectors.bin")),
      manifest: await readFile(join(out, "manifest.json")),
    };

    // A new file guarantees there is something to embed; a fresh cache
    // guarantees it must call the API rather than resume.
    await writeFile(join(root, "Course A", "extra.txt"), "delta text", "utf8");
    const failing = recordingEmbedder(0);
    await expect(
      runIngest({ ...common, embedder: failing.embedder, cacheDir: join(tmp, "cache2") }),
    ).rejects.toThrow(/simulated 429/);

    expect(await readFile(join(out, "chunks.jsonl"))).toEqual(before.chunks);
    expect(await readFile(join(out, "vectors.bin"))).toEqual(before.vectors);
    expect(await readFile(join(out, "manifest.json"))).toEqual(before.manifest);
  });

  it("resumes correctly after a torn cache tail", async () => {
    await buildCorpus(root, "memo body original");
    const outA = join(tmp, "outA");
    const outB = join(tmp, "outB");
    const cacheB = join(tmp, "cacheB");
    const common = { root, batchSize: 2, dims: DIMS, model: MODEL } as const;

    const a = recordingEmbedder();
    await runIngest({ ...common, outDir: outA, embedder: a.embedder, cacheDir: join(tmp, "cacheA") });

    const b = recordingEmbedder(2);
    await expect(
      runIngest({ ...common, outDir: outB, embedder: b.embedder, cacheDir: cacheB }),
    ).rejects.toThrow();

    // Corrupt the last cached row, as an interrupted append would.
    const { truncate } = await import("node:fs/promises");
    const binPath = join(cacheB, "cache.bin");
    await truncate(binPath, (await stat(binPath)).size - 1);

    const c = recordingEmbedder();
    await runIngest({ ...common, outDir: outB, embedder: c.embedder, cacheDir: cacheB });

    // One more chunk had to be re-embedded than in the clean-resume case.
    expect(c.calls.length).toBe(a.calls.length - b.calls.length + 1);
    expect(await readFile(join(outB, "vectors.bin"))).toEqual(
      await readFile(join(outA, "vectors.bin")),
    );
  });
});
