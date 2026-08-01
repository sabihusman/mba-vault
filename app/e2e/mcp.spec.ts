import { createHash, randomBytes } from "node:crypto";
import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { loginViaCookie } from "./auth-cookie";

// Phase 2: the FULL OAuth 2.1 flow over real HTTP — register → authorize
// (session consent) → code → PKCE token exchange → authenticated MCP
// initialize → refresh rotation — plus the failure paths that make it OAuth
// (reused code, wrong verifier, dead refresh token, discovery challenge).
// The e2e server runs MCP_ENABLED=true + PUBLIC_ORIGIN (playwright.config).

const MCP_URL = "/vault/api/mcp";
const HOSTED_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "0.0.0" },
  },
};

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// Register/token are IP rate-limited, and every direct-to-dev-server call
// shares the one "unknown" clientIp() bucket (no nginx in front) — the same
// landmine the staleness cron specs hit. A fresh synthetic TEST-NET IP per
// call keeps buckets unshared across tests, projects, and workers.
function syntheticIp(): string {
  return `198.51.${randomBytes(1)[0]}.${(randomBytes(1)[0] % 254) + 1}`;
}

async function registerTestClient(request: APIRequestContext): Promise<string> {
  const res = await request.post("/vault/api/oauth/register", {
    headers: { "x-real-ip": syntheticIp() },
    data: { redirect_uris: [HOSTED_CALLBACK], client_name: "e2e client" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { client_id: string };
  expect(body.client_id).toMatch(/^mcp_client_/);
  return body.client_id;
}

/** Approve consent via the decision endpoint using a logged-in context, and
 *  return the code from the redirect Location. */
async function approveAndGetCode(
  context: BrowserContext,
  clientId: string,
  challenge: string,
): Promise<string> {
  const res = await context.request.post("/vault/api/oauth/decision", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    maxRedirects: 0,
    form: {
      client_id: clientId,
      redirect_uri: HOSTED_CALLBACK,
      response_type: "code",
      state: "e2e-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "search",
      action: "approve",
    },
  });
  expect(res.status()).toBe(303);
  const location = res.headers()["location"] ?? "";
  const url = new URL(location);
  expect(url.origin + url.pathname).toBe(HOSTED_CALLBACK);
  expect(url.searchParams.get("state")).toBe("e2e-state");
  const code = url.searchParams.get("code");
  expect(code).toMatch(/^mcp_code_/);
  return code as string;
}

test("metadata endpoints are public and consistent", async ({ request }) => {
  const prm = await request.get("/vault/api/oauth/protected-resource-metadata");
  expect(prm.status()).toBe(200);
  const prmBody = (await prm.json()) as { resource: string; authorization_servers: string[] };
  expect(prmBody.resource).toBe("http://localhost:3000/vault/api/mcp");

  const asm = await request.get("/vault/api/oauth/authorization-server-metadata");
  expect(asm.status()).toBe(200);
  const asmBody = (await asm.json()) as Record<string, unknown>;
  expect(asmBody.issuer).toBe(prmBody.authorization_servers[0]);
  expect(asmBody.code_challenge_methods_supported).toEqual(["S256"]);
  expect(asmBody.token_endpoint_auth_methods_supported).toEqual(["none"]);
});

test("MCP 401s carry the WWW-Authenticate discovery challenge", async ({ request }) => {
  const res = await request.post(MCP_URL, { data: INITIALIZE });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("resource_metadata=");
});

test("the consent page requires a session: anonymous authorize → login redirect with next", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const res = await context.request.get(
    "/vault/oauth/authorize?client_id=x&redirect_uri=y",
    { maxRedirects: 0 },
  );
  expect(res.status()).toBe(307);
  const location = res.headers()["location"] ?? "";
  expect(location).toContain("/vault/login?next=");
  await context.close();
});

test("full flow: register → consent → code → PKCE exchange → MCP initialize → refresh rotation", async ({
  browser,
  request,
}) => {
  const clientId = await registerTestClient(request);
  const { verifier, challenge } = pkcePair();

  const context = await browser.newContext();
  await loginViaCookie(context);

  // The consent page renders for a logged-in user with a valid request.
  const page = await context.newPage();
  await page.goto(
    `/vault/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(HOSTED_CALLBACK)}` +
      `&response_type=code&state=e2e-state&code_challenge=${challenge}&code_challenge_method=S256&scope=search`,
  );
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByText("claude.ai")).toBeVisible(); // redirect host shown

  const code = await approveAndGetCode(context, clientId, challenge);

  // Exchange with the right verifier.
  const tokenRes = await request.post("/vault/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": syntheticIp() },
    form: {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: HOSTED_CALLBACK,
    },
  });
  expect(tokenRes.status()).toBe(200);
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
  expect(tokens.token_type).toBe("Bearer");
  expect(tokens.access_token).toMatch(/^mcp_at_/);

  // Reusing the code fails — single use.
  const reuse = await request.post("/vault/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": syntheticIp() },
    form: {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: HOSTED_CALLBACK,
    },
  });
  expect(reuse.status()).toBe(400);
  expect(((await reuse.json()) as { error: string }).error).toBe("invalid_grant");

  // The access token opens the MCP endpoint.
  const mcp = await request.post(MCP_URL, {
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      accept: "application/json, text/event-stream",
    },
    data: INITIALIZE,
  });
  expect(mcp.status()).toBe(200);
  expect(await mcp.text()).toContain("mba-vault");

  // Refresh rotation: new pair works, old refresh token is dead.
  const refreshRes = await request.post("/vault/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": syntheticIp() },
    form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token },
  });
  expect(refreshRes.status()).toBe(200);
  const rotated = (await refreshRes.json()) as { access_token: string };
  expect(rotated.access_token).not.toBe(tokens.access_token);

  const replayOld = await request.post("/vault/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": syntheticIp() },
    form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token },
  });
  expect(replayOld.status()).toBe(400);
  expect(((await replayOld.json()) as { error: string }).error).toBe("invalid_grant");

  await context.close();
});

test("a wrong PKCE verifier burns the code and yields invalid_grant", async ({ browser, request }) => {
  const clientId = await registerTestClient(request);
  const { challenge } = pkcePair();
  const context = await browser.newContext();
  await loginViaCookie(context);
  const code = await approveAndGetCode(context, clientId, challenge);

  const bad = await request.post("/vault/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": syntheticIp() },
    form: {
      grant_type: "authorization_code",
      code,
      code_verifier: randomBytes(32).toString("base64url"), // not the verifier
      client_id: clientId,
      redirect_uri: HOSTED_CALLBACK,
    },
  });
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe("invalid_grant");
  await context.close();
});

test("registration rejects a non-allowlisted redirect_uri", async ({ request }) => {
  const res = await request.post("/vault/api/oauth/register", {
    headers: { "x-real-ip": syntheticIp() },
    data: { redirect_uris: ["https://evil.example.com/cb"] },
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe("invalid_redirect_uri");
});
