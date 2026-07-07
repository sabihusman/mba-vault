// Client-side helpers for consuming the /vault/api/ask NDJSON stream. Kept as
// pure functions (no DOM, no server imports) so the Ask UI stays thin and these
// can be unit-tested directly. Types mirror the server's AskEvent in answer.ts,
// redeclared here to keep server code out of the client bundle.

export type Loc =
  | { kind: "page"; index: number }
  | { kind: "slide"; index: number }
  | { kind: "file" };

export interface Citation {
  n: number;
  course: string;
  file: string; // relPath, forward-slashed
  loc: Loc;
  score: number;
}

export type AskEvent =
  | { type: "citations"; citations: Citation[] }
  | { type: "text"; text: string }
  | { type: "error"; message: string };

/**
 * Split a rolling buffer into complete NDJSON lines, returning any trailing
 * partial line as `rest` to prepend to the next chunk. A stream chunk can end
 * mid-line, so we only emit up to the last newline.
 */
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? ""; // last element is the (possibly empty) partial
  const lines = parts.filter((line) => line.trim().length > 0);
  return { lines, rest };
}

/** Parse one NDJSON line into an AskEvent, or null if it isn't a known event. */
export function parseEvent(line: string): AskEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const event = value as Record<string, unknown>;
  if (event.type === "citations" && Array.isArray(event.citations)) {
    return { type: "citations", citations: event.citations as Citation[] };
  }
  if (event.type === "text" && typeof event.text === "string") {
    return { type: "text", text: event.text };
  }
  if (event.type === "error" && typeof event.message === "string") {
    return { type: "error", message: event.message };
  }
  return null;
}

// Phrases the grounding prompt (answer.ts SYSTEM_INSTRUCTION) steers the model
// toward when the coursework doesn't cover the question. Matched loosely so a
// slight rephrase still trips the "not covered" state.
const DECLINE_PATTERNS: RegExp[] = [
  /\bnot\b[^.]{0,40}\b(?:in|covered|part of)\b[^.]{0,20}\b(?:the\s+)?(?:course\s?work|materials?|coursework)\b/i,
  /\bdon['’]?t\s+have\s+that\b[^.]{0,40}\b(?:course\s?work|materials?)\b/i,
  /\b(?:isn['’]?t|is\s+not)\s+covered\b/i,
  /\bcannot\s+(?:find|answer)[^.]{0,40}\b(?:course\s?work|materials?)\b/i,
];

/**
 * Client heuristic: does the finished answer read as a decline ("not covered in
 * your materials")? The backend doesn't tag this — the model just says so in
 * prose — so we scan the assembled text. Applied only to short answers, since a
 * long substantive answer that merely mentions "coursework" isn't a decline.
 */
export function isNotCovered(answer: string): boolean {
  const trimmed = answer.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 400) return false;
  return DECLINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
