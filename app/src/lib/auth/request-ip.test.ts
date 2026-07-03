import { describe, it, expect } from "vitest";
import { clientIp } from "./request-ip";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/vault/api/login", { headers });
}

describe("clientIp", () => {
  it("prefers X-Real-IP (nginx sets it to the true peer)", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("prefers X-Real-IP even when X-Forwarded-For is also present", () => {
    expect(
      clientIp(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8" })),
    ).toBe("203.0.113.9");
  });

  it("falls back to the leftmost X-Forwarded-For entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("trims whitespace around the forwarded entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.9 , 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
