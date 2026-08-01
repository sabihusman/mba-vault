import { afterEach, describe, expect, it } from "vitest";
import { issueCode, consumeCode, clearCodes, CODE_TTL_MS } from "./codes";

const GRANT = {
  clientId: "mcp_client_x",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  scope: "search",
};

afterEach(() => clearCodes());

describe("authorization codes", () => {
  it("round-trips a grant exactly once (single use)", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const code = issueCode(GRANT, now);
    expect(code).toMatch(/^mcp_code_/);
    expect(consumeCode(code, now)).toEqual(GRANT);
    // Second redemption of the same code: burned.
    expect(consumeCode(code, now)).toBeNull();
  });

  it("expires after the TTL", () => {
    const issued = new Date("2026-07-30T00:00:00Z");
    const code = issueCode(GRANT, issued);
    const late = new Date(issued.getTime() + CODE_TTL_MS + 1);
    expect(consumeCode(code, late)).toBeNull();
  });

  it("unknown codes are null", () => {
    expect(consumeCode("mcp_code_nope", new Date())).toBeNull();
  });

  it("codes are independent — consuming one leaves another intact", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const a = issueCode(GRANT, now);
    const b = issueCode({ ...GRANT, clientId: "mcp_client_y" }, now);
    expect(consumeCode(a, now)?.clientId).toBe("mcp_client_x");
    expect(consumeCode(b, now)?.clientId).toBe("mcp_client_y");
  });
});
