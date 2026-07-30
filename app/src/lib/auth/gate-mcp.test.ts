import { afterEach, describe, expect, it } from "vitest";
// Relative imports — vitest has no "@/" alias (repo convention).
import { hasValidMcpToken, isMcpEnabled, MCP_PATH } from "./gate";

// Clearly-fake fixture value (public repo — nothing realistic).
const TOKEN = "unit-test-mcp-token-not-a-real-secret";

afterEach(() => {
  delete process.env.MCP_ENABLED;
  delete process.env.MCP_STATIC_TOKEN;
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

describe("hasValidMcpToken", () => {
  it("accepts a correct Bearer header on the MCP path only", () => {
    process.env.MCP_STATIC_TOKEN = TOKEN;
    expect(hasValidMcpToken(MCP_PATH, `Bearer ${TOKEN}`)).toBe(true);
    expect(hasValidMcpToken("/api/ask", `Bearer ${TOKEN}`)).toBe(false);
    expect(hasValidMcpToken("/", `Bearer ${TOKEN}`)).toBe(false);
  });

  it('accepts a case-insensitive "bearer" scheme (HTTP auth schemes are case-insensitive)', () => {
    process.env.MCP_STATIC_TOKEN = TOKEN;
    expect(hasValidMcpToken(MCP_PATH, `bearer ${TOKEN}`)).toBe(true);
  });

  it("rejects wrong tokens, bare tokens, other schemes, and empty headers", () => {
    process.env.MCP_STATIC_TOKEN = TOKEN;
    expect(hasValidMcpToken(MCP_PATH, "Bearer wrong")).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, TOKEN)).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, `Basic ${TOKEN}`)).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, "")).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, null)).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, undefined)).toBe(false);
  });

  it("never falls open: unset or empty MCP_STATIC_TOKEN rejects everything", () => {
    expect(hasValidMcpToken(MCP_PATH, "Bearer anything")).toBe(false);
    process.env.MCP_STATIC_TOKEN = "";
    expect(hasValidMcpToken(MCP_PATH, "Bearer ")).toBe(false);
    expect(hasValidMcpToken(MCP_PATH, "Bearer anything")).toBe(false);
  });
});
