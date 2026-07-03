// Route gate. Runs before every matched request (see `config.matcher`) and blocks
// anyone without a valid session. This is the ONLY thing standing between the
// public internet and the app, so it fails closed (see hasValidSession).
//
// Renamed from `middleware` in Next 16 (the file convention is now `proxy`), and
// it defaults to the Node.js runtime. We read the sealed cookie straight off the
// NextRequest (synchronous request.cookies API — NOT the async cookies() helper)
// and hand it to hasValidSession.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { hasValidSession } from "@/lib/auth/gate";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  if (await hasValidSession(sealed)) {
    return NextResponse.next();
  }

  // API callers get a machine-readable 401; humans get bounced to the login page.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl));
}

export const config = {
  // Run on everything EXCEPT the login flow, the PWA shell/service worker, and
  // build assets — otherwise the gate would block the very pages needed to log
  // in, and CSS/JS/icons would 302 to /login. `matcher` values must be static
  // literals (Next analyzes them at build time). Paths here are relative to the
  // basePath (/vault), so "login" guards /vault/login.
  matcher: [
    // The root ("/", i.e. /vault) must be listed explicitly: the negative-
    // lookahead pattern below matches paths WITH a segment but not the bare root,
    // which would otherwise leave the home page ungated. Verified with a runtime
    // probe (GET /vault returned 200 until this was added).
    "/",
    "/((?!login|api/login|api/logout|_next/static|_next/image|manifest.webmanifest|sw.js|offline|favicon.ico|icon-.*\\.png).*)",
  ],
};
