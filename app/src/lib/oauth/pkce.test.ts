import { describe, expect, it } from "vitest";
import { isValidVerifier, s256Challenge, verifierMatchesChallenge } from "./pkce";

// RFC 7636 Appendix B reference vector.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("pkce S256", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(s256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    expect(verifierMatchesChallenge(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it("rejects a wrong verifier for a challenge", () => {
    expect(verifierMatchesChallenge("A".repeat(43), RFC_CHALLENGE)).toBe(false);
  });

  it("rejects malformed verifiers (length + charset per RFC 7636 §4.1)", () => {
    expect(isValidVerifier("short")).toBe(false);
    expect(isValidVerifier("x".repeat(129))).toBe(false);
    expect(isValidVerifier("bad space".padEnd(43, "x"))).toBe(false);
    expect(verifierMatchesChallenge("short", s256Challenge(RFC_VERIFIER))).toBe(false);
  });
});
