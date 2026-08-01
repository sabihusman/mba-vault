import { afterEach, describe, expect, it } from "vitest";
// Relative imports — vitest has no "@/" alias (repo convention).
import { bearerToken, isMcpEnabled, isPublicPath } from "./gate";

afterEach(() => {
  delete process.env.MCP_ENABLED;
});

describe("isMcpEnabled", () => {
  it('is true only for exactly "true"', () => {
    expect(isMcpEnabled()).toBe(false);
    for (const v of ["1", "TRUE", "True", "yes", ""]) {
      process.env.MCP_ENABLED = v;
      expect(isMcpEnabled(), `MCP_ENABLED=${JSON.stringify(v)}`).toBe(false);
    }
    process.env.MCP_ENABLED = "true";
    expect(isMcpEnabled()).toBe(true);
  });
});

describe("bearerToken", () => {
  it("extracts the token, case-insensitive scheme", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
  });

  it("returns null for other schemes, bare values, and empty headers", () => {
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("abc")).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe("OAuth public-path surface", () => {
  it("metadata/register/token are public; consent and MCP are NOT", () => {
    expect(isPublicPath("/api/oauth/protected-resource-metadata")).toBe(true);
    expect(isPublicPath("/api/oauth/authorization-server-metadata")).toBe(true);
    expect(isPublicPath("/api/oauth/register")).toBe(true);
    expect(isPublicPath("/api/oauth/token")).toBe(true);
    // Consent must ride the session; the MCP path has its own token gate.
    expect(isPublicPath("/oauth/authorize")).toBe(false);
    expect(isPublicPath("/api/oauth/decision")).toBe(false);
    expect(isPublicPath("/api/mcp")).toBe(false);
  });
});
