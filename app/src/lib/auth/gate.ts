// The session check the proxy gate relies on, factored out so it can be unit
// tested without Next's request machinery. Takes the raw sealed cookie value and
// answers one question: does this represent a logged-in user? Fails closed — any
// problem unsealing (missing, tampered, expired, wrong secret) returns false.
import { timingSafeEqual, createHash } from "node:crypto";
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

// Alternate auth for the Staleness Detector's systemd timer (SECURITY.md §8):
// it isn't a browser and can't hold a session cookie, so it authenticates with
// a shared secret instead. Scoped to exactly one path — this is not a general
// bypass mechanism. The original design minted a real session cookie inside
// the container via iron-session, but that package isn't reachable at all in
// the standalone Docker build (Next 16's production output doesn't ship a
// flat, requirable node_modules tree), so the timer needed its own path.
export const CRON_SECRET_HEADER = "x-cron-secret";
const CRON_TRIGGER_PATH = "/api/staleness/run";

function safeEqual(a: string, b: string): boolean {
  // Hash first so both sides are fixed-length (32 bytes) — timingSafeEqual
  // throws on a length mismatch, and the secret's real length shouldn't be
  // observable from an attacker-controlled header's length anyway.
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/** True only for the staleness-run trigger path, with a header that matches a
 *  CONFIGURED secret. Never falls open: a missing/empty STALENESS_CRON_SECRET
 *  always returns false, regardless of what header value is presented. */
export function hasValidCronSecret(pathname: string, headerValue: string | null | undefined): boolean {
  if (pathname !== CRON_TRIGGER_PATH) return false;
  const secret = process.env.STALENESS_CRON_SECRET;
  if (!secret || !headerValue) return false;
  return safeEqual(headerValue, secret);
}
