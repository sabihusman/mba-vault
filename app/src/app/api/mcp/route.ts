// /vault/api/mcp — the MCP connector endpoint (streamable HTTP). Thin shell:
// REACHABILITY auth never happens here — the proxy gate (proxy.ts) has already
// 404'd the path unless MCP_ENABLED=true and rejected any request without a
// valid OAuth bearer token. This handler re-derives the token's SCOPES (one
// small-file lookup) and hands them to the SDK as authInfo, because per-TOOL
// authorization ("search" vs "read") is decided inside the tool handlers —
// the SDK passes authInfo through untouched and does no verification of its
// own. Fail closed: no verifiable token here (can't happen behind the proxy,
// but still) means no scopes, and every tool refuses.
import { getMcpHandler } from "@/lib/mcp/server";
import { bearerToken } from "@/lib/auth/gate";
import { verifyAccessToken } from "@/lib/oauth/tokens";

async function serve(request: Request): Promise<Response> {
  const token = bearerToken(request.headers.get("authorization"));
  const verified = token ? await verifyAccessToken(token, new Date()) : null;
  const authInfo =
    token && verified
      ? { token, clientId: verified.clientId, scopes: verified.scope.split(" ") }
      : undefined;
  return getMcpHandler().fetch(request, { authInfo });
}

export async function POST(request: Request): Promise<Response> {
  return serve(request);
}

export async function GET(request: Request): Promise<Response> {
  return serve(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return serve(request);
}
