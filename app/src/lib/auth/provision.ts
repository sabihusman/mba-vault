// Credential generation for the single MBA-Vault user. Pure, side-effect-free
// helpers shared by the `provision:auth` CLI (scripts/provision-auth.ts) and the
// unit tests. The login/verify side (PR 2/3) will live alongside this in
// src/lib/auth/. Nothing here is imported by a route, so it never ships to the
// browser bundle.
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";

/** Shown as the account provider in the authenticator app entry. */
export const TOTP_ISSUER = "MBA-Vault";

// Argon2id parameters, tuned above the library default (4 MiB) toward the
// OWASP-recommended argon2id profile: 19 MiB memory, 2 iterations, 1 lane.
// argon2id and version 19 (0x13) are the library defaults, so they're left
// implicit. All of these are embedded in the resulting PHC hash string, so the
// verify side reads them back automatically — nothing to keep in sync.
const ARGON2_OPTIONS = {
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/** Hash a plaintext password into an argon2id PHC string. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Generate a fresh 160-bit TOTP secret, returned as base32. */
export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** Build a TOTP object — SHA1 / 6 digits / 30s, the universally-supported profile. */
export function buildTotp(username: string, secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** The otpauth:// enrolment URI (for a QR code or manual entry). */
export function totpUri(username: string, secretBase32: string): string {
  return buildTotp(username, secretBase32).toString();
}

/** A random 256-bit secret (base64url) used to seal the iron-session cookie. */
export function generateSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}
