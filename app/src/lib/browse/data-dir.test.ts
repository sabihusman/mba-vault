import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getDataDir, safeResolveLexical, safeResolve } from "./data-dir";

const FIXTURES = fileURLToPath(new URL("../../../test-fixtures/data", import.meta.url));

beforeAll(() => {
  process.env.DATA_DIR = FIXTURES;
});

describe("safeResolveLexical (traversal guard)", () => {
  it("rejects traversal and malformed segments", () => {
    const bad: string[][] = [
      [".."],
      ["Course A", "..", ".."],
      ["foo/bar"], // separator inside a segment
      ["foo\\bar"], // backslash separator
      [""], // empty segment
      ["."], // current-dir ref
      ["C:"], // Windows drive / ADS marker
      ["a\0b"], // NUL byte
      ["/etc/passwd"], // leading slash makes it one slash-bearing segment
    ];
    for (const segments of bad) {
      expect(safeResolveLexical(segments), JSON.stringify(segments)).toBeNull();
    }
  });

  it("accepts plain names, keeping the result inside the data dir", () => {
    const course = safeResolveLexical(["Course A"]);
    expect(course).not.toBeNull();
    expect(course?.startsWith(resolve(FIXTURES))).toBe(true);

    const nested = safeResolveLexical(["Course A", "Week 1", "notes.pdf"]);
    expect(nested?.endsWith(join("Course A", "Week 1", "notes.pdf"))).toBe(true);
  });

  it("treats the empty path as the data root", () => {
    expect(safeResolveLexical([])).toBe(resolve(getDataDir()));
  });
});

describe("safeResolve (symlink defense)", () => {
  it("resolves an existing file within the data dir", async () => {
    const p = await safeResolve(["Course A", "intro.txt"]);
    expect(p).not.toBeNull();
    expect(p?.endsWith("intro.txt")).toBe(true);
  });

  it("returns null for a lexically-safe but nonexistent path", async () => {
    expect(await safeResolve(["Course A", "nope.pdf"])).toBeNull();
  });

  it("returns null for traversal", async () => {
    expect(await safeResolve([".."])).toBeNull();
  });

  it("blocks a symlink that escapes the data dir", async () => {
    // Build a throwaway data dir containing a symlink that points OUTSIDE it.
    const base = await mkdtemp(join(tmpdir(), "mbav-browse-"));
    const dataDir = join(base, "data");
    const outside = join(base, "outside");
    await mkdir(dataDir);
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "should never be reachable");

    // On Windows a real symlink needs elevation, but a directory JUNCTION does
    // not — use that there so this security test runs cross-platform.
    const linkType = process.platform === "win32" ? "junction" : "dir";
    let symlinkCreated = true;
    try {
      await symlink(outside, join(dataDir, "escape"), linkType);
    } catch {
      symlinkCreated = false; // no privilege at all — skip assertion (CI still runs it)
    }

    if (!symlinkCreated) {
      await rm(base, { recursive: true, force: true });
      return;
    }

    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    try {
      // Lexically clean (no ".."), but realpath lands outside → must be rejected.
      expect(await safeResolve(["escape", "secret.txt"])).toBeNull();
      // A genuine file directly inside the data dir still resolves.
      await writeFile(join(dataDir, "inside.txt"), "ok");
      expect(await safeResolve(["inside.txt"])).not.toBeNull();
    } finally {
      process.env.DATA_DIR = prev;
      await rm(base, { recursive: true, force: true });
    }
  });
});
