// The session check the proxy gate relies on, factored out so it can be unit
// tested without Next's request machinery. Takes the raw sealed cookie value and
// answers one question: does this represent a logged-in user? Fails closed — any
// problem unsealing (missing, tampered, expired, wrong secret) returns false.
import { unsealData } from "iron-session";
import { getSessionSecret } from "./config";
import { SESSION_TTL_SECONDS, type SessionData } from "./session";

// Paths reachable WITHOUT a session: the login flow, the public liveness probe,
// and the PWA shell/assets. Kept here (rather than only as matcher regex) so the
// allowlist is readable and unit-testable. Paths are basePath-relative — what
// request.nextUrl.pathname yields, e.g. "/login" for /vault/login.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/api/logout",
  "/api/health", // liveness probe: docker healthcheck + deploy smoke test
  "/offline", // PWA offline fallback
  "/manifest.webmanifest",
  "/sw.js",
]);

/** True for paths the gate must let through unauthenticated. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // App icons (icon-192.png, icon-512.png, …) must load pre-auth for the PWA.
  if (pathname.startsWith("/icon-") && pathname.endsWith(".png")) return true;
  return false;
}

export async function hasValidSession(sealedCookie: string | undefined): Promise<boolean> {
  if (!sealedCookie) return false;
  try {
    const data = await unsealData<SessionData>(sealedCookie, {
      password: getSessionSecret(),
      // Must match the ttl the cookie was sealed with, or unsealData rejects a
      // still-valid session as expired.
      ttl: SESSION_TTL_SECONDS,
    });
    return typeof data.username === "string" && data.username.length > 0;
  } catch {
    return false;
  }
}
