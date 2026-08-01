import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateAuthorizeRequest, callbackUrl } from "./authorize-request";
import { registerClient } from "./clients";

const HOSTED = "https://claude.ai/api/mcp/auth_callback";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

let dir: string;
let clientId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-authz-"));
  process.env.STATE_DIR = dir;
  const result = await registerClient({ redirect_uris: [HOSTED], client_name: "Claude" }, new Date());
  if (!result.ok) throw new Error("fixture registration failed");
  clientId = result.client.clientId;
});
afterEach(async () => {
  delete process.env.STATE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function valid() {
  return {
    client_id: clientId,
    redirect_uri: HOSTED,
    response_type: "code",
    state: "abc",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    scope: "search",
  };
}

describe("validateAuthorizeRequest", () => {
  it("accepts a fully valid request", async () => {
    const v = await validateAuthorizeRequest(valid());
    expect(v.kind).toBe("ok");
    if (v.kind !== "ok") return;
    expect(v.client.clientId).toBe(clientId);
    expect(v.scope).toBe("search");
    expect(v.state).toBe("abc");
  });

  it("REJECTS (never redirects) on unknown client or mismatched redirect_uri", async () => {
    expect((await validateAuthorizeRequest({ ...valid(), client_id: "mcp_client_nope" })).kind).toBe("reject");
    expect(
      (await validateAuthorizeRequest({ ...valid(), redirect_uri: "https://evil.com/cb" })).kind,
    ).toBe("reject");
    expect((await validateAuthorizeRequest({ ...valid(), redirect_uri: undefined })).kind).toBe("reject");
  });

  it("redirects an error for a trusted target with a bad response_type", async () => {
    const v = await validateAuthorizeRequest({ ...valid(), response_type: "token" });
    expect(v).toMatchObject({ kind: "redirect_error", error: "unsupported_response_type", state: "abc" });
  });

  it("PKCE is mandatory: missing challenge or non-S256 method → invalid_request", async () => {
    expect(
      await validateAuthorizeRequest({ ...valid(), code_challenge: undefined }),
    ).toMatchObject({ kind: "redirect_error", error: "invalid_request" });
    expect(
      await validateAuthorizeRequest({ ...valid(), code_challenge_method: "plain" }),
    ).toMatchObject({ kind: "redirect_error", error: "invalid_request" });
  });

  it("unknown scopes → invalid_scope; empty scope defaults to search", async () => {
    expect(await validateAuthorizeRequest({ ...valid(), scope: "admin" })).toMatchObject({
      kind: "redirect_error",
      error: "invalid_scope",
    });
    const v = await validateAuthorizeRequest({ ...valid(), scope: undefined });
    expect(v.kind).toBe("ok");
    if (v.kind === "ok") expect(v.scope).toBe("search");
  });
});

describe("callbackUrl", () => {
  it("appends params and skips nulls", () => {
    const url = callbackUrl(HOSTED, { code: "c1", state: null });
    expect(url).toBe(`${HOSTED}?code=c1`);
  });
});
