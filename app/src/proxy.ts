// Route gate. Runs before every matched request (see `config.matcher`) and blocks
// anyone without a valid session. This is the ONLY thing standing between the
// public internet and the app, so it fails closed (see hasValidSession).
//
// Renamed from `middleware` in Next 16 (the file convention is now `proxy`), and
// it defaults to the Node.js runtime. We read the sealed cookie straight off the
// NextRequest (synchronous request.cookies API — NOT the async cookies() helper)
// and hand it to hasValidSession.
// Relative imports (not "@/") — this file is unit-tested directly
// (proxy.test.ts), and the "@/" alias isn't configured for vitest (see
// index-store.ts/search.ts and status/route.ts for the same convention).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/session";
import {
  hasValidSession,
  hasValidCronSecret,
  CRON_SECRET_HEADER,
  isPublicPath,
  isMcpEnabled,
  bearerToken,
  MCP_PATH,
} from "./lib/auth/gate";
import { verifyAccessToken, tokenRateKey } from "./lib/oauth/tokens";
import { consumeMcp } from "./lib/oauth/ratelimit";
import { bearerChallenge } from "./lib/oauth/config";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The login flow and PWA shell/assets are reachable without a session.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // MCP connector endpoint (SECURITY.md §10): handled entirely here, before the
  // session check, because its auth is an OAuth bearer token, not a cookie.
  // Ordering is deliberate — kill switch first (404: with MCP_ENABLED unset the
  // endpoint does not exist, so nothing can be probed), then token verification
  // (401), then the per-token rate limit (429). A session cookie is NOT
  // accepted here: the MCP client is a machine, and keeping the paths disjoint
  // means a browser can never be confused into exercising this endpoint with
  // its cookie. Every 401 carries the WWW-Authenticate challenge — that header
  // is how Claude discovers our protected-resource metadata (and it only
  // honors it on a real 401).
  if (pathname === MCP_PATH) {
    if (!isMcpEnabled()) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const token = bearerToken(request.headers.get("authorization"));
    const verified = token ? await verifyAccessToken(token, new Date()) : null;
    if (!verified) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401, headers: { "WWW-Authenticate": bearerChallenge() } },
      );
    }
    if (!(await consumeMcp(tokenRateKey(token as string)))) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    return NextResponse.next();
  }

  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const cronSecret = request.headers.get(CRON_SECRET_HEADER);
  // Session cookie (the button, a human) OR a valid cron secret (the systemd
  // timer, scoped to exactly one path in hasValidCronSecret) — see SECURITY.md
  // §8. Either is sufficient; nothing below this needs to know which matched.
  if ((await hasValidSession(sealed)) || hasValidCronSecret(pathname, cronSecret)) {
    return NextResponse.next();
  }

  // API callers get a machine-readable 401; humans get bounced to the login page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Clone the NextURL (which tracks basePath) and set the path — a plain
  // `new URL("/login", ...)` would emit `location: /login`, dropping the /vault
  // basePath and 404ing. Cloning yields the correct `/vault/login`.
  // ?next= carries the attempted page (path + query) so login can resume there
  // — e.g. the OAuth consent page with its whole authorize query string. The
  // login page validates it (safeNextPath) before use; the root "/" default
  // case is omitted to keep the common URL clean.
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const attempted = pathname + request.nextUrl.search;
  if (attempted !== "/") loginUrl.searchParams.set("next", attempted);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Keep the matcher to just framework/asset exclusions (low regex complexity);
  // the real auth allowlist lives in isPublicPath() where it's readable and
  // tested. The root "/" is listed explicitly because the negative-lookahead
  // pattern matches paths WITH a segment but not the bare root, which would
  // otherwise leave the home page ungated (verified with a runtime probe).
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
