import { test, expect } from "@playwright/test";

// MCP endpoint gate + wiring over real HTTP (Phase 1). The e2e server runs
// with MCP_ENABLED=true and a generated MCP_STATIC_TOKEN (playwright.config).
// Like the staleness cron-secret specs, these use the request fixture with no
// session cookie — the whole point is machine auth. The MCP initialize
// round-trip proves the SDK handler is actually mounted behind the gate; the
// tool CALL isn't exercised here because search_vault needs GEMINI_API_KEY +
// a real index, neither of which exists in the e2e env — the tool logic is
// unit-tested (search-vault.test.ts).

const MCP_URL = "/vault/api/mcp";
const TOKEN = process.env.E2E_MCP_TOKEN as string;

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

test("no token → 401 (never reachable unauthenticated)", async ({ request }) => {
  const res = await request.post(MCP_URL, { data: INITIALIZE });
  expect(res.status()).toBe(401);
});

test("wrong token → 401", async ({ request }) => {
  const res = await request.post(MCP_URL, {
    headers: { authorization: "Bearer not-the-right-token" },
    data: INITIALIZE,
  });
  expect(res.status()).toBe(401);
});

test("a session cookie alone → 401 (cookie auth is not accepted on the MCP path)", async ({
  browser,
}) => {
  // Mint a valid session the way the UI specs do, then hit MCP with ONLY that.
  const { loginViaCookie } = await import("./auth-cookie");
  const context = await browser.newContext();
  await loginViaCookie(context);
  const res = await context.request.post(MCP_URL, { data: INITIALIZE });
  expect(res.status()).toBe(401);
  await context.close();
});

test("valid token → MCP initialize succeeds and lists the server", async ({ request }) => {
  const res = await request.post(MCP_URL, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/json, text/event-stream",
    },
    data: INITIALIZE,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  // Streamable HTTP may answer as JSON or as an SSE event — both carry the
  // serverInfo name back.
  expect(body).toContain("mba-vault");
});
