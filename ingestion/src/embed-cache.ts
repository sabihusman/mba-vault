// Resume cache for embeddings. Deliberately NOT inside `.index/` — that directory
// ships wholesale to the box, and both tryLoadPriorIndex and the app's loader
// assume it holds exactly manifest.json / chunks.jsonl / vectors.bin /
// ingest-report.json. This is local scratch: gitignored, never synced.
//
// Layout (append-only):
//   cache-meta.json  { model, dims }   — a mismatch makes every row unusable
//   cache.bin        Float32 rows, dims × 4 bytes each
//   cache.jsonl      one { key } per line, in the same order as the rows
//
// A row is appended to cache.bin BEFORE its line goes to cache.jsonl: the jsonl
// line is the commit record, so an interrupted append can only leave surplus
// bytes in cache.bin — never a key with no vector behind it. On load we take the
// consistent prefix, min(complete lines, whole rows), and discard a torn tail
// rather than trusting it.
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CACHE_META_FILE = "cache-meta.json";
export const CACHE_VECTORS_FILE = "cache.bin";
export const CACHE_KEYS_FILE = "cache.jsonl";

/**
 * The chunk id ALONE is not a safe key. Ids are `relPath::locLabel::ordinal`
 * (document-chunker.ts) and stay identical when a file's *content* changes, so an
 * id-keyed cache would hand back a stale vector for edited text — and it would do
 * so downstream of planEmbedding's file-hash guard, which never sees the lookup.
 * Hashing the text closes that hole. The id is length-prefixed so that
 * (id, text) pairs can't collide by concatenating differently.
 */
export function cacheKey(chunkId: string, text: string): string {
  return createHash("sha256").update(`${chunkId.length}:${chunkId}`).update(text).digest("hex");
}

export interface EmbedCache {
  has(key: string): boolean;
  get(key: string): Float32Array | undefined;
  readonly size: number;
  append(entries: { key: string; vector: Float32Array }[]): Promise<void>;
}

export async function openEmbedCache(
  dir: string,
  meta: { model: string; dims: number },
): Promise<EmbedCache> {
  await mkdir(dir, { recursive: true });
  const metaPath = join(dir, CACHE_META_FILE);
  const binPath = join(dir, CACHE_VECTORS_FILE);
  const keysPath = join(dir, CACHE_KEYS_FILE);

  let compatible = false;
  try {
    const onDisk = JSON.parse(await readFile(metaPath, "utf8")) as { model?: string; dims?: number };
    compatible = onDisk.model === meta.model && onDisk.dims === meta.dims;
  } catch {
    compatible = false; // absent or unreadable → start clean
  }

  if (!compatible) {
    // A different model or dimensionality makes every cached row meaningless.
    await writeFile(metaPath, JSON.stringify(meta) + "\n", "utf8");
    await writeFile(binPath, Buffer.alloc(0));
    await writeFile(keysPath, "", "utf8");
  }

  const rowBytes = meta.dims * 4;
  const entries = new Map<string, Float32Array>();

  if (compatible) {
    let binBytes = 0;
    try {
      binBytes = (await stat(binPath)).size;
    } catch {
      binBytes = 0;
    }
    const wholeRows = Math.floor(binBytes / rowBytes);

    let keysText = "";
    try {
      keysText = await readFile(keysPath, "utf8");
    } catch {
      keysText = "";
    }

    // Count only newline-terminated lines — a torn final line has no newline.
    const lines: string[] = [];
    for (let from = 0; ; ) {
      const nl = keysText.indexOf("\n", from);
      if (nl === -1) break;
      lines.push(keysText.slice(from, nl));
      from = nl + 1;
    }

    const usable = Math.min(wholeRows, lines.length);
    if (usable > 0) {
      const buf = await readFile(binPath);
      for (let i = 0; i < usable; i++) {
        const line = lines[i];
        if (line === undefined || line.length === 0) continue;
        let key: string;
        try {
          key = (JSON.parse(line) as { key: string }).key;
        } catch {
          break; // malformed line → stop; everything after it is untrustworthy
        }
        // Copy into a fresh aligned buffer — a pooled Buffer can sit at an offset
        // Float32Array rejects (same trap as store.ts readVectors).
        const aligned = new ArrayBuffer(rowBytes);
        new Uint8Array(aligned).set(buf.subarray(i * rowBytes, (i + 1) * rowBytes));
        entries.set(key, new Float32Array(aligned));
      }
    }
  }

  return {
    has: (key: string): boolean => entries.has(key),
    get: (key: string): Float32Array | undefined => entries.get(key),
    get size(): number {
      return entries.size;
    },
    async append(items: { key: string; vector: Float32Array }[]): Promise<void> {
      if (items.length === 0) return;

      const bin = Buffer.alloc(items.length * rowBytes);
      items.forEach((item, i) => {
        if (item.vector.length !== meta.dims) {
          throw new Error(
            `cache append: vector has ${item.vector.length} dims, expected ${meta.dims}`,
          );
        }
        Buffer.from(item.vector.buffer, item.vector.byteOffset, rowBytes).copy(bin, i * rowBytes);
      });

      // Vectors first, keys second — see the header comment.
      await appendFile(binPath, bin);
      await appendFile(
        keysPath,
        items.map((item) => JSON.stringify({ key: item.key })).join("\n") + "\n",
        "utf8",
      );

      for (const item of items) entries.set(item.key, item.vector);
    },
  };
}
