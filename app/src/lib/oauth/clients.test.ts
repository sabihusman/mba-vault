import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isAllowedRedirectUri,
  redirectUriMatches,
  registerClient,
  getClient,
  MAX_CLIENTS,
} from "./clients";
import { mintTokenPair } from "./tokens";

const HOSTED = "https://claude.ai/api/mcp/auth_callback";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-clients-"));
  process.env.STATE_DIR = dir;
});
afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("isAllowedRedirectUri — the documented Claude callbacks and nothing else", () => {
  it("accepts the hosted claude.ai callback exactly", () => {
    expect(isAllowedRedirectUri(HOSTED)).toBe(true);
    expect(isAllowedRedirectUri(HOSTED + "/extra")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback")).toBe(false); // not documented
    expect(isAllowedRedirectUri("https://evil.com/api/mcp/auth_callback")).toBe(false);
  });

  it("accepts Claude Code loopback /callback on any port", () => {
    expect(isAllowedRedirectUri("http://localhost/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:49152/callback")).toBe(true);
  });

  it("rejects loopback variants that differ in anything but port", () => {
    expect(isAllowedRedirectUri("http://localhost/other")).toBe(false);
    expect(isAllowedRedirectUri("https://localhost/callback")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost/callback?x=1")).toBe(false);
    expect(isAllowedRedirectUri("http://192.168.1.10/callback")).toBe(false);
    expect(isAllowedRedirectUri("http://evil.com/callback")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
});

describe("redirectUriMatches — port-agnostic ONLY for loopback (RFC 8252 §7.3)", () => {
  it("hosted callback must match exactly", () => {
    expect(redirectUriMatches(HOSTED, HOSTED)).toBe(true);
    expect(redirectUriMatches(HOSTED, "https://claude.ai/api/mcp/auth_callback2")).toBe(false);
  });

  it("loopback matches across ports, same host and path", () => {
    expect(redirectUriMatches("http://localhost/callback", "http://localhost:3118/callback")).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1/callback", "http://127.0.0.1:49152/callback")).toBe(true);
    expect(redirectUriMatches("http://localhost/callback", "http://127.0.0.1:3118/callback")).toBe(false);
    expect(redirectUriMatches("http://localhost/callback", "http://localhost:3118/other")).toBe(false);
  });
});

describe("registerClient", () => {
  it("registers a valid client and finds it again", async () => {
    const result = await registerClient(
      { redirect_uris: [HOSTED], client_name: "Claude" },
      new Date("2026-07-30T00:00:00Z"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.client.clientId).toMatch(/^mcp_client_/);
    expect(await getClient(result.client.clientId)).toEqual(result.client);
  });

  it("rejects any non-allowlisted URI outright — no partial acceptance", async () => {
    const result = await registerClient(
      { redirect_uris: [HOSTED, "https://evil.com/cb"] },
      new Date(),
    );
    expect(result).toEqual({ ok: false, error: "invalid_redirect_uri" });
  });

  it("rejects empty/missing/oversized redirect_uris", async () => {
    expect((await registerClient({ redirect_uris: [] }, new Date())).ok).toBe(false);
    expect((await registerClient({ redirect_uris: "nope" }, new Date())).ok).toBe(false);
    expect(
      (await registerClient({ redirect_uris: Array(5).fill(HOSTED) }, new Date())).ok,
    ).toBe(false);
  });

  it(`evicts the oldest beyond ${MAX_CLIENTS} (Claude DCRs a new client per connection)`, async () => {
    let firstId = "";
    for (let i = 0; i <= MAX_CLIENTS; i++) {
      const r = await registerClient(
        { redirect_uris: [HOSTED], client_name: `c${i}` },
        new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      );
      if (r.ok && i === 0) firstId = r.client.clientId;
    }
    expect(await getClient(firstId)).toBeNull();
  });

  it("Phase 4 (F2): eviction skips the client that holds a live refresh token", async () => {
    // Oldest client is the LIVE one (has an unexpired refresh token).
    const oldest = await registerClient(
      { redirect_uris: [HOSTED], client_name: "live" },
      new Date(Date.UTC(2026, 0, 1)),
    );
    if (!oldest.ok) throw new Error("fixture registration failed");
    await mintTokenPair(oldest.client.clientId, "search read", new Date(Date.UTC(2026, 0, 1)));

    // Churn: fill past the cap with throwaway registrations.
    let secondOldestId = "";
    for (let i = 0; i <= MAX_CLIENTS; i++) {
      const r = await registerClient(
        { redirect_uris: [HOSTED], client_name: `churn${i}` },
        new Date(Date.UTC(2026, 0, 2, 0, 0, i)),
      );
      if (r.ok && i === 0) secondOldestId = r.client.clientId;
    }

    // The live client survived; the oldest NON-live registration was evicted.
    expect(await getClient(oldest.client.clientId)).not.toBeNull();
    expect(await getClient(secondOldestId)).toBeNull();
  });

  it("stores no secrets: the state file holds only public client metadata", async () => {
    await registerClient({ redirect_uris: [HOSTED] }, new Date());
    const text = await readFile(join(dir, "mcp", "clients.json"), "utf8");
    expect(text).not.toMatch(/secret/i);
  });
});
