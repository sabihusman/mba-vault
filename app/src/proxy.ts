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
import { hasValidSession, hasValidCronSecret, CRON_SECRET_HEADER, isPublicPath } from "./lib/auth/gate";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The login flow and PWA shell/assets are reachable without a session.
  if (isPublicPath(pathname)) {
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
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
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
