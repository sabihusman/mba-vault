import { describe, it, expect } from "vitest";
import { verify } from "@node-rs/argon2";
import {
  hashPassword,
  newTotpSecret,
  buildTotp,
  totpUri,
  generateSessionSecret,
  TOTP_ISSUER,
} from "./provision";

describe("auth provisioning", () => {
  it("produces an argon2id hash that verifies the original password only", async () => {
    const phc = await hashPassword("correct horse battery staple");
    expect(phc.startsWith("$argon2id$")).toBe(true);
    expect(await verify(phc, "correct horse battery staple")).toBe(true);
    expect(await verify(phc, "wrong password")).toBe(false);
  });

  it("embeds the tuned argon2id parameters in the hash", async () => {
    const phc = await hashPassword("another sufficiently long password");
    expect(phc).toContain("m=19456,t=2,p=1");
  });

  it("generates a base32 TOTP secret that self-validates", () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/); // RFC 4648 base32 alphabet, unpadded
    const totp = buildTotp("sabih", secret);
    expect(totp.validate({ token: totp.generate(), window: 1 })).not.toBeNull();
  });

  it("builds an otpauth URI carrying the issuer and secret", () => {
    const secret = newTotpSecret();
    const uri = totpUri("sabih", secret);
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`issuer=${TOTP_ISSUER}`);
    expect(uri).toContain(`secret=${secret}`);
  });

  it("generates a >=32 char session secret, unique per call", () => {
    const a = generateSessionSecret();
    const b = generateSessionSecret();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toEqual(b);
  });
});
