import { sealData } from "iron-session";
import type { BrowserContext } from "@playwright/test";

// Seal a valid session cookie directly (same secret + ttl the app uses) so tests
// that need an authenticated user can skip the interactive login/TOTP flow. The
// secret is shared via process.env by playwright.config.
const SESSION_COOKIE = "mba_vault_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function loginViaCookie(context: BrowserContext): Promise<void> {
  const secret = process.env.E2E_SESSION_SECRET;
  if (!secret) throw new Error("E2E_SESSION_SECRET not set (see playwright.config)");

  const value = await sealData(
    { username: "sabih", loggedInAt: Date.now() },
    { password: secret, ttl: SESSION_TTL_SECONDS },
  );

  await context.addCookies([
    { name: SESSION_COOKIE, value, domain: "localhost", path: "/vault", httpOnly: true, sameSite: "Lax" },
  ]);
}
