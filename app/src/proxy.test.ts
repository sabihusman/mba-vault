// Exercises proxy() itself (not just gate.ts's isolated predicates) with a
// constructed NextRequest — no live server needed, since proxy() never calls
// next/server's after() (only the staleness trigger flow does, deep inside a
// route handler). This is what actually proves the wiring is correct, not
// just that hasValidSession/hasValidCronSecret behave correctly in isolation.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { proxy } from "./proxy";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionData } from "./lib/auth/session";

const SESSION_SECRET = "unit-test-session-secret-at-least-32-chars-long";
const CRON_SECRET = "unit-test-cron-secret";

function seal(data: SessionData): Promise<string> {
  return sealData(data, { password: SESSION_SECRET, ttl: SESSION_TTL_SECONDS });
}

// NextRequest.nextUrl.pathname is basePath-STRIPPED under Next's real request
// pipeline (gate.ts's own comment: "paths are basePath-relative — e.g. '/login'
// for /vault/login"). Constructing a NextRequest directly bypasses that
// stripping step entirely, so the URL here must already be basePath-relative
// — NOT prefixed with /vault — to match what proxy() actually sees in prod.
function request(pathname: string, init: { cookie?: string; cronSecretHeader?: string } = {}): NextRequest {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  if (init.cronSecretHeader !== undefined) headers.set("x-cron-secret", init.cronSecretHeader);
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

/** NextResponse.next() marks itself with this header; a 401 JSON or a
 *  redirect response won't have it. */
function isPassThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("proxy — session cookie path (regression: must stay exactly as-is)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
  });

  it("passes through a request with a valid session cookie", async () => {
    const cookie = await seal({ username: "sabih", loggedInAt: 1 });
    const res = await proxy(request("/api/staleness/run", { cookie }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("401s an API request with no cookie and no cron secret", async () => {
    const res = await proxy(request("/api/staleness/run"));
    expect(res.status).toBe(401);
  });

  it("401s an API request with an invalid cookie", async () => {
    const res = await proxy(request("/api/staleness/run", { cookie: "garbage" }));
    expect(res.status).toBe(401);
  });
});

describe("proxy — cron secret path (new)", () => {
  afterEach(() => {
    delete process.env.STALENESS_CRON_SECRET;
  });

  it("passes through /api/staleness/run given a valid secret and NO session cookie", async () => {
    process.env.STALENESS_CRON_SECRET = CRON_SECRET;
    const res = await proxy(request("/api/staleness/run", { cronSecretHeader: CRON_SECRET }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("401s with a missing secret header", async () => {
    process.env.STALENESS_CRON_SECRET = CRON_SECRET;
    const res = await proxy(request("/api/staleness/run"));
    expect(res.status).toBe(401);
  });

  it("401s with a wrong secret", async () => {
    process.env.STALENESS_CRON_SECRET = CRON_SECRET;
    const res = await proxy(request("/api/staleness/run", { cronSecretHeader: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("401s even with a header present when STALENESS_CRON_SECRET isn't configured — never falls open", async () => {
    delete process.env.STALENESS_CRON_SECRET;
    const res = await proxy(request("/api/staleness/run", { cronSecretHeader: CRON_SECRET }));
    expect(res.status).toBe(401);
  });

  it("does not grant the secret access to a different protected route", async () => {
    process.env.STALENESS_CRON_SECRET = CRON_SECRET;
    const res = await proxy(request("/api/staleness/status", { cronSecretHeader: CRON_SECRET }));
    expect(res.status).toBe(401);
  });
});
