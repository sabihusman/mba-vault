import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, truncate, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheKey,
  openEmbedCache,
  terminatedLines,
  CACHE_KEYS_FILE,
  CACHE_VECTORS_FILE,
} from "./embed-cache";

const DIMS = 8;
const ROW_BYTES = DIMS * 4;
const META = { model: "test-model", dims: DIMS };

function vec(fill: number): Float32Array {
  return new Float32Array(Array.from({ length: DIMS }, (_, i) => fill + i / 100));
}

describe("cacheKey", () => {
  it("is deterministic for the same id and text", () => {
    expect(cacheKey("a::file::0", "hello")).toBe(cacheKey("a::file::0", "hello"));
  });

  it("changes when the text changes but the id does not", () => {
    // The whole point: chunk ids are stable across content edits.
    expect(cacheKey("a::file::0", "hello")).not.toBe(cacheKey("a::file::0", "hello!"));
  });

  it("changes when the id changes but the text does not", () => {
    expect(cacheKey("a::file::0", "hello")).not.toBe(cacheKey("b::file::0", "hello"));
  });

  it("does not collide when id and text boundaries shift", () => {
    // Length-prefixing the id prevents ("ab","c") and ("a","bc") colliding.
    expect(cacheKey("ab", "c")).not.toBe(cacheKey("a", "bc"));
  });
});

describe("terminatedLines", () => {
  it("returns only newline-terminated lines", () => {
    expect(terminatedLines('{"key":"a"}\n{"key":"b"}\n')).toEqual(['{"key":"a"}', '{"key":"b"}']);
  });

  it("drops an unterminated final line — it was never committed", () => {
    expect(terminatedLines('{"key":"a"}\n{"key":"b"')).toEqual(['{"key":"a"}']);
  });

  it("returns nothing for empty input or a single unterminated line", () => {
    expect(terminatedLines("")).toEqual([]);
    expect(terminatedLines("no newline here")).toEqual([]);
  });
});

describe("openEmbedCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mbav-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts empty and round-trips appended entries", async () => {
    const cache = await openEmbedCache(dir, META);
    expect(cache.size).toBe(0);

    await cache.append([
      { key: "k1", vector: vec(1) },
      { key: "k2", vector: vec(2) },
    ]);
    expect(cache.size).toBe(2);
    expect([...cache.get("k1")!]).toEqual([...vec(1)]);

    const reopened = await openEmbedCache(dir, META);
    expect(reopened.size).toBe(2);
    expect([...reopened.get("k2")!]).toEqual([...vec(2)]);
    expect(reopened.has("nope")).toBe(false);
  });

  it("discards a torn vector row rather than trusting it", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([
      { key: "k1", vector: vec(1) },
      { key: "k2", vector: vec(2) },
      { key: "k3", vector: vec(3) },
    ]);

    // Simulate a crash mid-append: the third row is only partly on disk.
    await truncate(join(dir, CACHE_VECTORS_FILE), ROW_BYTES * 3 - 1);

    const reopened = await openEmbedCache(dir, META);
    expect(reopened.size).toBe(2);
    expect(reopened.has("k3")).toBe(false);
    expect([...reopened.get("k1")!]).toEqual([...vec(1)]);
  });

  it("ignores a key line that was never newline-terminated", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([{ key: "k1", vector: vec(1) }]);

    // A half-written commit record, plus its vector already on disk.
    await appendFile(join(dir, CACHE_VECTORS_FILE), Buffer.alloc(ROW_BYTES));
    await appendFile(join(dir, CACHE_KEYS_FILE), '{"key":"k2"', "utf8");

    const reopened = await openEmbedCache(dir, META);
    expect(reopened.size).toBe(1);
    expect(reopened.has("k2")).toBe(false);
  });

  it("treats a different dimensionality as an empty cache", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([{ key: "k1", vector: vec(1) }]);

    const other = await openEmbedCache(dir, { model: META.model, dims: 4 });
    expect(other.size).toBe(0);
  });

  it("treats a different model as an empty cache", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([{ key: "k1", vector: vec(1) }]);

    const other = await openEmbedCache(dir, { model: "other-model", dims: DIMS });
    expect(other.size).toBe(0);
  });

  it("rejects a vector whose width does not match the cache", async () => {
    const cache = await openEmbedCache(dir, META);
    await expect(cache.append([{ key: "k1", vector: new Float32Array(3) }])).rejects.toThrow(
      /expected 8/,
    );
  });

  it("writes vectors before keys so a crash cannot orphan a key", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([{ key: "k1", vector: vec(1) }]);

    const bin = await readFile(join(dir, CACHE_VECTORS_FILE));
    const keys = await readFile(join(dir, CACHE_KEYS_FILE), "utf8");
    expect(bin.length).toBe(ROW_BYTES);
    expect(keys.endsWith("\n")).toBe(true);
    expect(JSON.parse(keys.trim())).toEqual({ key: "k1" });
  });

  it("recovers when the key file is empty but vectors exist", async () => {
    const cache = await openEmbedCache(dir, META);
    await cache.append([{ key: "k1", vector: vec(1) }]);
    await writeFile(join(dir, CACHE_KEYS_FILE), "", "utf8");

    const reopened = await openEmbedCache(dir, META);
    expect(reopened.size).toBe(0);
  });
});
