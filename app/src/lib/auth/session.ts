// iron-session wiring: a stateless, encrypted (sealed) cookie holds the login
// state — no session store or DB. Used from Route Handlers (login sets it,
// logout destroys it) and Server Components (read it). PR4's route gate reads
// the same cookie in the proxy/edge runtime via unsealData (Web Crypto), so it
// does not import this Node-runtime helper.
import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { getSessionSecret } from "./config";

/** Shape of the sealed session payload. Absent fields ⇒ not logged in. */
export interface SessionData {
  username?: string;
  loggedInAt?: number; // epoch ms
}

export const SESSION_COOKIE = "mba_vault_session";
// Exported so the proxy gate's unsealData() re-checks expiry against the SAME
// ttl the cookie was sealed with — a mismatch would reject valid sessions.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: getSessionSecret(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true, // not readable by JS
      // Dev runs over http://localhost; prod is always HTTPS behind nginx.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // Scope the cookie to the app's basePath so it is never sent to the other
      // tenants sharing this host (/ study guide, /wellmark).
      path: "/vault",
    },
  };
}

/** Read (or lazily create) the session for the current request. */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** True when the session represents an authenticated user. */
export function isLoggedIn(session: SessionData): boolean {
  return typeof session.username === "string" && session.username.length > 0;
}
