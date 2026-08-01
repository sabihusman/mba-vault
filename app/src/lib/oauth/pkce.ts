// PKCE (RFC 7636), S256 only — the MCP authorization spec mandates S256 and
// Claude sends it on every authorization request. "Plain" is deliberately not
// implemented: it exists for clients that can't hash, and every client we serve
// can.
import { createHash, timingSafeEqual } from "node:crypto";

// RFC 7636 §4.1: verifier is 43–128 chars of [A-Za-z0-9-._~].
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidVerifier(verifier: string): boolean {
  return VERIFIER_PATTERN.test(verifier);
}

/** BASE64URL(SHA256(verifier)) — what a client sends as code_challenge. */
export function s256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Does this verifier prove that challenge? Constant-time on the comparison. */
export function verifierMatchesChallenge(verifier: string, challenge: string): boolean {
  if (!isValidVerifier(verifier)) return false;
  // Hash both sides to fixed length so timingSafeEqual can't throw on length.
  const a = createHash("sha256").update(s256Challenge(verifier)).digest();
  const b = createHash("sha256").update(challenge).digest();
  return timingSafeEqual(a, b);
}
