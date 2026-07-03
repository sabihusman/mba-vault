/**
 * Resolves paths under the coursework data directory — SAFELY. Every browse
 * request turns untrusted URL segments into a filesystem path, so this is the
 * one place that defends against path traversal (…/../../etc/passwd) and symlink
 * escapes. Everything in lib/browse goes through safeResolve; nothing else reads
 * the data dir directly.
 *
 * DATA_DIR points at the read-only volume on the box (defaults to /data, which is
 * exactly what docker-compose mounts). Dev/test point it at fixtures.
 */
import { resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

/** The coursework directory. /data in prod; a fixtures dir in dev/test. */
export function getDataDir(): string {
  return process.env.DATA_DIR ?? "/data";
}

/**
 * A single path segment (one URL part) is safe only if it's a plain file/folder
 * name — no separators, no parent refs, no drive/stream markers, no NUL. Next
 * decodes catch-all params before we see them, so a URL-encoded "%2e%2e" arrives
 * here already as "..", and this catches it.
 */
function isSafeSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  if (segment.includes(":")) return false; // Windows drive / alternate data stream
  if (segment.includes("\0")) return false;
  return true;
}

/**
 * Lexical resolution: reject bad segments, join under the data dir, and confirm
 * the result stays inside it. Pure string math (no filesystem) — the first gate.
 */
export function safeResolveLexical(segments: string[]): string | null {
  if (!segments.every(isSafeSegment)) return null;
  const dataDir = resolve(getDataDir());
  const abs = resolve(dataDir, ...segments);
  if (abs !== dataDir && !abs.startsWith(dataDir + sep)) return null;
  return abs;
}

/**
 * Full resolution: the lexical check, then realpath to defeat symlinks that point
 * outside the data dir (a symlink inside /data → /etc would pass the string check
 * but escape on read). Re-verifies containment against the real, canonical path.
 * Returns the canonical absolute path, or null if unsafe / nonexistent.
 */
export async function safeResolve(segments: string[]): Promise<string | null> {
  const lexical = safeResolveLexical(segments);
  if (lexical === null) return null;
  try {
    const real = await realpath(lexical);
    const dataReal = await realpath(resolve(getDataDir()));
    if (real !== dataReal && !real.startsWith(dataReal + sep)) return null;
    return real;
  } catch {
    // ENOENT (path doesn't exist) or similar — treat as not found.
    return null;
  }
}
