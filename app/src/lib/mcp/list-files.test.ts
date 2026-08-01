import { describe, expect, it } from "vitest";
// Relative imports — vitest has no "@/" alias (repo convention).
import { listFiles, parsePathSegments } from "./list-files";
import type { Listing } from "../browse/catalog";

const LISTING: Listing = {
  entries: [
    { name: "Week 1", type: "dir", size: null, modifiedMs: 0, ext: "" },
    { name: "intro.txt", type: "file", size: 120, modifiedMs: 0, ext: "txt" },
  ],
};

describe("parsePathSegments", () => {
  it("handles the root: undefined, empty, whitespace, bare slashes", () => {
    expect(parsePathSegments(undefined)).toEqual([]);
    expect(parsePathSegments("")).toEqual([]);
    expect(parsePathSegments("  ")).toEqual([]);
    expect(parsePathSegments("/")).toEqual([]);
  });

  it("splits normal paths, tolerating leading/trailing slashes", () => {
    expect(parsePathSegments("Course A/Week 1")).toEqual(["Course A", "Week 1"]);
    expect(parsePathSegments("/Course A/")).toEqual(["Course A"]);
  });

  it("rejects traversal shapes, backslashes, empty segments, NUL", () => {
    expect(parsePathSegments("..")).toBeNull();
    expect(parsePathSegments("a/../b")).toBeNull();
    expect(parsePathSegments("a//b")).toBeNull();
    expect(parsePathSegments("a\\b")).toBeNull();
    expect(parsePathSegments("a/./b")).toBeNull();
    expect(parsePathSegments("a\0b")).toBeNull();
  });
});

describe("listFiles", () => {
  it("formats folders and files with full relative paths", async () => {
    const result = await listFiles({ listDirectory: async () => LISTING }, "Course A");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.text).toContain("[folder] Course A/Week 1/");
    expect(result.text).toContain("[file]   Course A/intro.txt (120 bytes)");
  });

  it("root listing has no path prefix", async () => {
    const result = await listFiles({ listDirectory: async () => LISTING }, undefined);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.text).toContain("[folder] Week 1/");
    expect(result.text).toContain("the vault root");
  });

  it("null listing (unsafe/missing dir) → not_found", async () => {
    const result = await listFiles({ listDirectory: async () => null }, "nope");
    expect(result.kind).toBe("not_found");
  });

  it("malformed path never reaches the deps", async () => {
    let called = false;
    const result = await listFiles(
      {
        listDirectory: async () => {
          called = true;
          return LISTING;
        },
      },
      "../escape",
    );
    expect(result.kind).toBe("not_found");
    expect(called).toBe(false);
  });
});
