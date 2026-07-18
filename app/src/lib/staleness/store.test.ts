import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConceptList, writeConceptList } from "./store";
import type { ConceptList } from "./types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mv-staleness-"));
  process.env.STATE_DIR = dir;
});

afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("staleness concept store", () => {
  it("returns an empty list when bootstrap hasn't run yet", async () => {
    expect(await readConceptList()).toEqual({ generatedAt: "", concepts: [] });
  });

  it("round-trips a written list", async () => {
    const list: ConceptList = {
      generatedAt: "2026-07-17T00:00:00.000Z",
      concepts: [
        {
          id: "investments-capm",
          name: "CAPM",
          course: "Investments",
          description: "Capital Asset Pricing Model relates expected return to systematic risk.",
          status: "pending",
          lastCheckedAt: null,
        },
      ],
    };
    await writeConceptList(list);
    expect(await readConceptList()).toEqual(list);
  });

  it("treats a corrupt or malformed file as an empty list rather than throwing", async () => {
    await mkdir(join(dir, "staleness"), { recursive: true });
    await writeFile(join(dir, "staleness", "concepts.json"), "{not valid json", "utf8");
    await expect(readConceptList()).resolves.toEqual({ generatedAt: "", concepts: [] });

    await writeFile(join(dir, "staleness", "concepts.json"), JSON.stringify({ generatedAt: "x" }), "utf8");
    await expect(readConceptList()).resolves.toEqual({ generatedAt: "", concepts: [] });
  });
});
