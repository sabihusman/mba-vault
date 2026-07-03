// The session check the proxy gate relies on, factored out so it can be unit
// tested without Next's request machinery. Takes the raw sealed cookie value and
// answers one question: does this represent a logged-in user? Fails closed — any
// problem unsealing (missing, tampered, expired, wrong secret) returns false.
import { unsealData } from "iron-session";
import { getSessionSecret } from "./config";
import { SESSION_TTL_SECONDS, type SessionData } from "./session";

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
