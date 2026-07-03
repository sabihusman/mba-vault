import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { listDirectory, resolveFile } from "./catalog";

const FIXTURES = fileURLToPath(new URL("../../../test-fixtures/data", import.meta.url));

beforeAll(() => {
  process.env.DATA_DIR = FIXTURES;
});

describe("listDirectory", () => {
  it("lists the root: course folders sorted, dotfiles hidden", async () => {
    const listing = await listDirectory([]);
    expect(listing).not.toBeNull();
    if (listing === null) return;
    expect(listing.entries.map((e) => e.name)).toEqual(["Course A", "Course B"]);
    expect(listing.entries.every((e) => e.type === "dir")).toBe(true);
  });

  it("lists a course folder: subfolders before files, with metadata", async () => {
    const listing = await listDirectory(["Course A"]);
    expect(listing).not.toBeNull();
    if (listing === null) return;

    expect(listing.entries.map((e) => e.name)).toEqual(["Week 1", "intro.txt", "slides.pptx"]);

    const intro = listing.entries.find((e) => e.name === "intro.txt");
    expect(intro?.type).toBe("file");
    expect(intro?.ext).toBe("txt");
    expect(intro?.size ?? 0).toBeGreaterThan(0);
    expect(intro?.modifiedMs ?? 0).toBeGreaterThan(0);

    const week = listing.entries.find((e) => e.name === "Week 1");
    expect(week?.type).toBe("dir");
    expect(week?.size).toBeNull();
    expect(week?.ext).toBe("");
  });

  it("returns null for a file path, a missing path, and traversal", async () => {
    expect(await listDirectory(["Course A", "intro.txt"])).toBeNull(); // it's a file
    expect(await listDirectory(["Nope"])).toBeNull();
    expect(await listDirectory([".."])).toBeNull();
  });
});

describe("resolveFile", () => {
  it("resolves a real nested file with size and extension", async () => {
    const file = await resolveFile(["Course A", "Week 1", "notes.pdf"]);
    expect(file).not.toBeNull();
    if (file === null) return;
    expect(file.name).toBe("notes.pdf");
    expect(file.ext).toBe("pdf");
    expect(file.size).toBeGreaterThan(0);
    expect(file.absPath.endsWith("notes.pdf")).toBe(true);
  });

  it("returns null for a directory, an empty path, and traversal", async () => {
    expect(await resolveFile(["Course A"])).toBeNull(); // a directory
    expect(await resolveFile([])).toBeNull();
    expect(await resolveFile(["..", "..", "package.json"])).toBeNull();
  });
});
