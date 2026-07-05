import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashFile } from "./hash";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mbav-hash-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("hashFile", () => {
  it("is deterministic for identical content and differs for different content", async () => {
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    const c = join(dir, "c.txt");
    await writeFile(a, "same bytes");
    await writeFile(b, "same bytes");
    await writeFile(c, "other bytes");

    const ha = await hashFile(a);
    expect(ha).toHaveLength(64); // sha256 hex
    expect(ha).toBe(await hashFile(b));
    expect(ha).not.toBe(await hashFile(c));
  });
});
