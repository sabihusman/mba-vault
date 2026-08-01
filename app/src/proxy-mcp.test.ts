// Proxy wiring for the MCP endpoint (Phase 2: kill switch + OAuth bearer).
// Same direct-NextRequest technique as proxy.test.ts — URLs are basePath-
// relative (no /vault prefix). Real tokens are minted through the real store
// into a temp STATE_DIR, so this exercises the actual verification path.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { proxy } from "./proxy";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionData } from "./lib/auth/session";
import { mintTokenPair } from "./lib/oauth/tokens";

const SESSION_SECRET = "unit-test-session-secret-at-least-32-chars-long";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-proxy-"));
  process.env.STATE_DIR = dir;
});
afterEach(async () => {
  delete process.env.STATE_DIR;
  delete process.env.MCP_ENABLED;
  await rm(dir, { recursive: true, force: true });
});

beforeAll(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
});

function request(pathname: string, init: { authorization?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (init.authorization !== undefined) headers.set("authorization", init.authorization);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

function isPassThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

async function mintedAccessToken(): Promise<string> {
  return (await mintTokenPair("mcp_client_test", "search", new Date())).accessToken;
}

describe("proxy — MCP kill switch (MCP_ENABLED)", () => {
  it("404s /api/mcp when disabled, even with a real minted token", async () => {
    const token = await mintedAccessToken();
    const res = await proxy(request("/api/mcp", { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(404);
  });
});

describe("proxy — MCP OAuth bearer (enabled)", () => {
  beforeEach(() => {
    process.env.MCP_ENABLED = "true";
  });

  it("passes through with a real minted access token", async () => {
    const token = await mintedAccessToken();
    const res = await proxy(request("/api/mcp", { authorization: `Bearer ${token}` }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("401s unknown tokens, malformed headers, and no header — WITH the discovery challenge", async () => {
    for (const auth of ["Bearer mcp_at_unknown", "mcp_at_unknown", "Basic abc", undefined]) {
      const res = await proxy(request("/api/mcp", { authorization: auth }));
      expect(res.status, `authorization=${JSON.stringify(auth)}`).toBe(401);
      // The WWW-Authenticate header is Claude's primary metadata discovery path.
      expect(res.headers.get("www-authenticate")).toMatch(
        /^Bearer resource_metadata=".*protected-resource-metadata"/,
      );
    }
  });

  it("never falls open: an empty token store rejects everything", async () => {
    const res = await proxy(request("/api/mcp", { authorization: "Bearer mcp_at_anything" }));
    expect(res.status).toBe(401);
  });

  it("a valid SESSION COOKIE is not accepted on the MCP path", async () => {
    const cookie = await sealData({ username: "sabih", loggedInAt: 1 } satisfies SessionData, {
      password: SESSION_SECRET,
      ttl: SESSION_TTL_SECONDS,
    });
    const res = await proxy(request("/api/mcp", { cookie }));
    expect(res.status).toBe(401);
  });

  it("an MCP access token does NOT open any other path", async () => {
    const token = await mintedAccessToken();
    const res = await proxy(request("/api/ask", { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(401);
  });

  it("per-token rate limit: 31st call inside the window is 429, other tokens unaffected", async () => {
    const tokenA = await mintedAccessToken();
    const tokenB = await mintedAccessToken();
    for (let i = 0; i < 30; i++) {
      const res = await proxy(request("/api/mcp", { authorization: `Bearer ${tokenA}` }));
      expect(res.status, `call ${i + 1}`).not.toBe(429);
    }
    const blocked = await proxy(request("/api/mcp", { authorization: `Bearer ${tokenA}` }));
    expect(blocked.status).toBe(429);
    const other = await proxy(request("/api/mcp", { authorization: `Bearer ${tokenB}` }));
    expect(isPassThrough(other)).toBe(true);
  });
});

describe("proxy — login redirect carries ?next=", () => {
  it("a page request bounces to /login with the attempted path+query", async () => {
    const res = await proxy(request("/oauth/authorize?client_id=x&state=y"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?next=");
    expect(decodeURIComponent(location)).toContain("/oauth/authorize?client_id=x&state=y");
  });

  it("the bare root redirects without a next param", async () => {
    const res = await proxy(request("/"));
    expect(res.headers.get("location") ?? "").not.toContain("next=");
  });
});
