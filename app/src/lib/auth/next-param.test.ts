import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-param";

describe("safeNextPath", () => {
  it("passes app-internal page paths through, query included", () => {
    expect(safeNextPath("/browse")).toBe("/browse");
    expect(safeNextPath("/oauth/authorize?client_id=x&state=y")).toBe(
      "/oauth/authorize?client_id=x&state=y",
    );
  });

  it("falls back to the root for anything external or machine-facing", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/api/logout")).toBe("/");
    expect(safeNextPath("/api")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });
});
