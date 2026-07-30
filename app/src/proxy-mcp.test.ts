// Proxy wiring for the MCP endpoint (Phase 1): kill switch + static bearer.
// Same direct-NextRequest technique as proxy.test.ts — URLs are basePath-
// relative (no /vault prefix), since a directly-constructed NextRequest never
// goes through Next's basePath stripping.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { proxy } from "./proxy";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionData } from "./lib/auth/session";

const SESSION_SECRET = "unit-test-session-secret-at-least-32-chars-long";
// Clearly-fake fixture value (public repo — nothing realistic).
const MCP_TOKEN = "unit-test-mcp-token-not-a-real-secret";

function request(pathname: string, init: { authorization?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (init.authorization !== undefined) headers.set("authorization", init.authorization);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

function isPassThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

beforeAll(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
});

afterEach(() => {
  delete process.env.MCP_ENABLED;
  delete process.env.MCP_STATIC_TOKEN;
});

describe("proxy — MCP kill switch (MCP_ENABLED)", () => {
  it("404s /api/mcp when MCP_ENABLED is unset, even with a valid token configured and presented", async () => {
    process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
    const res = await proxy(request("/api/mcp", { authorization: `Bearer ${MCP_TOKEN}` }));
    expect(res.status).toBe(404);
  });

  it('404s when MCP_ENABLED is any value other than exactly "true"', async () => {
    for (const value of ["1", "TRUE", "yes", "false", ""]) {
      process.env.MCP_ENABLED = value;
      process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
      const res = await proxy(request("/api/mcp", { authorization: `Bearer ${MCP_TOKEN}` }));
      expect(res.status, `MCP_ENABLED=${JSON.stringify(value)}`).toBe(404);
    }
  });
});

describe("proxy — MCP static bearer (enabled)", () => {
  it("passes through with the correct bearer token", async () => {
    process.env.MCP_ENABLED = "true";
    process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
    const res = await proxy(request("/api/mcp", { authorization: `Bearer ${MCP_TOKEN}` }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("401s with a wrong token, a malformed header, or no header", async () => {
    process.env.MCP_ENABLED = "true";
    process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
    for (const auth of ["Bearer wrong-token", MCP_TOKEN, "Basic abc", undefined]) {
      const res = await proxy(request("/api/mcp", { authorization: auth }));
      expect(res.status, `authorization=${JSON.stringify(auth)}`).toBe(401);
    }
  });

  it("never falls open: enabled but NO token configured rejects everything", async () => {
    process.env.MCP_ENABLED = "true";
    const res = await proxy(request("/api/mcp", { authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
  });

  it("a valid SESSION COOKIE is not accepted on the MCP path", async () => {
    process.env.MCP_ENABLED = "true";
    process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
    const cookie = await sealData({ username: "sabih", loggedInAt: 1 } satisfies SessionData, {
      password: SESSION_SECRET,
      ttl: SESSION_TTL_SECONDS,
    });
    const res = await proxy(request("/api/mcp", { cookie }));
    expect(res.status).toBe(401);
  });

  it("the MCP token does NOT open any other path (path-scoped like the cron secret)", async () => {
    process.env.MCP_ENABLED = "true";
    process.env.MCP_STATIC_TOKEN = MCP_TOKEN;
    const res = await proxy(request("/api/ask", { authorization: `Bearer ${MCP_TOKEN}` }));
    expect(res.status).toBe(401);
  });
});
