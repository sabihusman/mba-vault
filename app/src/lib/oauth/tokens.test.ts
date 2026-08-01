import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mintTokenPair,
  verifyAccessToken,
  rotateRefreshToken,
  revokeToken,
  clientIdsWithLiveRefreshTokens,
  tokenRateKey,
  ACCESS_TOKEN_TTL_SECONDS,
} from "./tokens";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-tokens-"));
  process.env.STATE_DIR = dir;
});
afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-07-30T00:00:00Z");

describe("token mint + verify", () => {
  it("a minted access token verifies with its client and scope", async () => {
    const pair = await mintTokenPair("mcp_client_x", "search", NOW);
    expect(pair.accessToken).toMatch(/^mcp_at_/);
    expect(pair.refreshToken).toMatch(/^mcp_rt_/);
    expect(pair.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(await verifyAccessToken(pair.accessToken, NOW)).toEqual({
      clientId: "mcp_client_x",
      scope: "search",
    });
  });

  it("rejects unknown, wrong-prefix, and expired tokens", async () => {
    const pair = await mintTokenPair("c", "search", NOW);
    expect(await verifyAccessToken("mcp_at_unknown", NOW)).toBeNull();
    expect(await verifyAccessToken(pair.refreshToken, NOW)).toBeNull(); // refresh ≠ access
    const afterExpiry = new Date(NOW.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect(await verifyAccessToken(pair.accessToken, afterExpiry)).toBeNull();
  });

  it("HASHED AT REST: the state file never contains a raw token", async () => {
    const pair = await mintTokenPair("c", "search", NOW);
    const text = await readFile(join(dir, "mcp", "tokens.json"), "utf8");
    expect(text).not.toContain(pair.accessToken);
    expect(text).not.toContain(pair.refreshToken);
    // Sanity: something WAS stored.
    expect(text).toContain('"access"');
  });
});

describe("refresh rotation (OAuth 2.1 public client)", () => {
  it("rotation invalidates the old refresh token in the same operation", async () => {
    const first = await mintTokenPair("c", "search", NOW);
    const second = await rotateRefreshToken(first.refreshToken, NOW);
    expect(second).not.toBeNull();
    expect(second!.accessToken).not.toBe(first.accessToken);
    // The OLD refresh token is dead — replaying it fails (→ invalid_grant).
    expect(await rotateRefreshToken(first.refreshToken, NOW)).toBeNull();
    // The NEW pair works.
    expect(await verifyAccessToken(second!.accessToken, NOW)).not.toBeNull();
  });

  it("rejects unknown and expired refresh tokens", async () => {
    expect(await rotateRefreshToken("mcp_rt_unknown", NOW)).toBeNull();
    const pair = await mintTokenPair("c", "search", NOW);
    const past31Days = new Date(NOW.getTime() + 31 * 24 * 3600 * 1000);
    expect(await rotateRefreshToken(pair.refreshToken, past31Days)).toBeNull();
  });
});

describe("revokeToken (RFC 7009)", () => {
  it("revoking an access token kills it immediately", async () => {
    const pair = await mintTokenPair("c", "search", NOW);
    await revokeToken(pair.accessToken);
    expect(await verifyAccessToken(pair.accessToken, NOW)).toBeNull();
    // The refresh token is untouched — it was a different credential.
    expect(await rotateRefreshToken(pair.refreshToken, NOW)).not.toBeNull();
  });

  it("revoking a refresh token kills rotation", async () => {
    const pair = await mintTokenPair("c", "search", NOW);
    await revokeToken(pair.refreshToken);
    expect(await rotateRefreshToken(pair.refreshToken, NOW)).toBeNull();
  });

  it("unknown/garbage tokens revoke silently (no probing oracle)", async () => {
    await expect(revokeToken("mcp_at_unknown")).resolves.toBeUndefined();
    await expect(revokeToken("mcp_rt_unknown")).resolves.toBeUndefined();
    await expect(revokeToken("garbage")).resolves.toBeUndefined();
  });
});

describe("clientIdsWithLiveRefreshTokens", () => {
  it("reports clients with unexpired refresh tokens only", async () => {
    await mintTokenPair("live-client", "search", NOW);
    const expired = await mintTokenPair("dead-client", "search", NOW);
    await revokeToken(expired.refreshToken);
    const live = await clientIdsWithLiveRefreshTokens(NOW);
    expect(live.has("live-client")).toBe(true);
    expect(live.has("dead-client")).toBe(false);
  });
});

describe("tokenRateKey", () => {
  it("is stable per token, never the token itself", async () => {
    const pair = await mintTokenPair("c", "search", NOW);
    const key = tokenRateKey(pair.accessToken);
    expect(key).toBe(tokenRateKey(pair.accessToken));
    expect(key).toHaveLength(16);
    expect(pair.accessToken).not.toContain(key);
  });
});
