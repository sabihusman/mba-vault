import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, newTotpSecret, buildTotp } from "./provision";
import { verifyLogin, verifyTotp } from "./verify";

const USERNAME = "sabih";
const PASSWORD = "correcthorsebatterystaple";
let secret: string;

beforeAll(async () => {
  secret = newTotpSecret();
  process.env.AUTH_USERNAME = USERNAME;
  process.env.AUTH_PASSWORD_HASH = await hashPassword(PASSWORD);
  process.env.TOTP_SECRET = secret;
});

function currentToken(): string {
  return buildTotp(USERNAME, secret).generate();
}

function aWrongToken(): string {
  const real = currentToken();
  return real === "000000" ? "111111" : "000000";
}

describe("verifyLogin", () => {
  it("accepts the correct username + password + TOTP together", async () => {
    expect(await verifyLogin({ username: USERNAME, password: PASSWORD, token: currentToken() })).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyLogin({ username: USERNAME, password: "not-it", token: currentToken() })).toBe(false);
  });

  it("rejects a wrong username", async () => {
    expect(await verifyLogin({ username: "eve", password: PASSWORD, token: currentToken() })).toBe(false);
  });

  it("rejects a wrong TOTP code", async () => {
    expect(await verifyLogin({ username: USERNAME, password: PASSWORD, token: aWrongToken() })).toBe(false);
  });
});

describe("verifyTotp", () => {
  it("accepts a current token", () => {
    expect(verifyTotp(secret, currentToken())).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(verifyTotp(secret, "abc")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });
});
