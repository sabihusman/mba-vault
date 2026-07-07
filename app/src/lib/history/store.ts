// Server-side Ask history for the "pick up where you left off" card. Single user,
// no DB — this is an append-only JSONL file on a small WRITABLE volume (/state),
// separate from the read-only /data. We store only the question + timestamp
// (resume re-asks via /ask?q=…), capped so the file can't grow without bound.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface HistoryEntry {
  id: string; // stable-ish id for React keys (timestamp + short suffix)
  question: string;
  askedAt: string; // ISO
}

// Keep the most recent N questions on disk; readRecent returns fewer, de-duped.
export const MAX_HISTORY = 50;
const HISTORY_FILE = "history.jsonl";

/** Writable state dir. Prod mounts a volume at /state; overridable via env. */
export function getStateDir(): string {
  return process.env.STATE_DIR ?? "/state";
}

// Guard the fixed filename against the (env-provided) dir, mirroring store.ts in
// ingestion — the name is constant so this always passes, but it validates the
// path before any filesystem access.
function historyPath(): string {
  const base = resolve(getStateDir());
  const target = resolve(base, HISTORY_FILE);
  if (target !== join(base, HISTORY_FILE) || !target.startsWith(base + sep)) {
    throw new Error("unsafe history path");
  }
  return target;
}

async function readAll(): Promise<HistoryEntry[]> {
  try {
    const text = await readFile(historyPath(), "utf8");
    return text
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as HistoryEntry)
      .filter((e) => e && typeof e.question === "string" && typeof e.askedAt === "string");
  } catch {
    return []; // no file yet, or unreadable → empty history
  }
}

/**
 * Append a question, keeping only the last MAX_HISTORY entries. Best-effort: any
 * failure is swallowed by the caller so asking a question never breaks on a write
 * error (e.g. the volume isn't mounted).
 */
export async function appendQuestion(question: string, at: Date): Promise<void> {
  const trimmed = question.trim();
  if (!trimmed) return;

  const entry: HistoryEntry = {
    id: `${at.getTime().toString(36)}-${Math.floor(at.getTime() % 1000).toString(36)}`,
    question: trimmed,
    askedAt: at.toISOString(),
  };

  const existing = await readAll();
  const next = [...existing, entry].slice(-MAX_HISTORY);
  const body = next.map((e) => JSON.stringify(e)).join("\n") + "\n";

  await mkdir(getStateDir(), { recursive: true });
  await writeFile(historyPath(), body, "utf8");
}

/**
 * The most recent questions, newest first, de-duplicated by question text (a
 * repeated question surfaces once, at its latest ask time).
 */
export async function readRecent(limit: number): Promise<HistoryEntry[]> {
  const all = await readAll();
  const seen = new Set<string>();
  const recent: HistoryEntry[] = [];
  for (let i = all.length - 1; i >= 0 && recent.length < limit; i--) {
    const entry = all[i];
    const key = entry.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push(entry);
  }
  return recent;
}
