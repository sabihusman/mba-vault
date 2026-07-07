import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendQuestion, readRecent, MAX_HISTORY } from "./store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mv-history-"));
  process.env.STATE_DIR = dir;
});

afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("history store", () => {
  it("returns empty when nothing has been asked", async () => {
    expect(await readRecent(4)).toEqual([]);
  });

  it("appends and returns newest-first", async () => {
    await appendQuestion("first question", new Date("2026-07-01T10:00:00Z"));
    await appendQuestion("second question", new Date("2026-07-01T11:00:00Z"));
    const recent = await readRecent(4);
    expect(recent.map((e) => e.question)).toEqual(["second question", "first question"]);
  });

  it("de-duplicates a repeated question to its latest ask", async () => {
    await appendQuestion("what is CAC?", new Date("2026-07-01T10:00:00Z"));
    await appendQuestion("what about LTV?", new Date("2026-07-01T10:30:00Z"));
    await appendQuestion("What is CAC?", new Date("2026-07-01T12:00:00Z")); // dup, diff case
    const recent = await readRecent(4);
    expect(recent.map((e) => e.question)).toEqual(["What is CAC?", "what about LTV?"]);
    expect(recent[0].askedAt).toBe("2026-07-01T12:00:00.000Z");
  });

  it("caps the file at MAX_HISTORY entries", async () => {
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      await appendQuestion(`q${i}`, new Date(Date.parse("2026-07-01T00:00:00Z") + i * 1000));
    }
    const recent = await readRecent(MAX_HISTORY + 10);
    expect(recent).toHaveLength(MAX_HISTORY);
    expect(recent[0].question).toBe(`q${MAX_HISTORY + 9}`); // newest kept
    expect(recent.at(-1)?.question).toBe("q10"); // q0..q9 dropped by the cap
  });

  it("ignores blank questions", async () => {
    await appendQuestion("   ", new Date());
    expect(await readRecent(4)).toEqual([]);
  });
});
