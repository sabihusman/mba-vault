// Credential verification for the single-step login (username + password + TOTP
// in one shot). Returns a single boolean so the caller can give one generic
// failure message — never revealing which factor was wrong.
import { timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";
import { getAuthConfig } from "./config";

export interface LoginInput {
  username: string;
  password: string;
  token: string; // 6-digit TOTP code
}

/** Verify all three factors together. */
export async function verifyLogin(input: LoginInput): Promise<boolean> {
  const cfg = getAuthConfig();
  const usernameOk = safeEqual(input.username, cfg.username);
  // Always run argon2 (even on a wrong username) so response timing doesn't
  // reveal whether the username matched.
  const passwordOk = await verify(cfg.passwordHash, input.password);
  const totpOk = verifyTotp(cfg.totpSecret, input.token);
  return usernameOk && passwordOk && totpOk;
}

/** Validate a TOTP token against the secret, allowing +/-1 step for clock skew. */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.validate({ token: cleaned, window: 1 }) !== null;
}

/** Constant-time string compare (returns false for differing lengths). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
