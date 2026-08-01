// RFC 9728 protected resource metadata. Public by design (it's how a client
// learns where our authorization server is — it contains no secrets). Claude
// finds this URL primarily via the WWW-Authenticate header on the MCP 401;
// nginx additionally maps the root RFC probe paths
// (/.well-known/oauth-protected-resource[/vault/api/mcp]) onto this route.
import { NextResponse } from "next/server";
import { issuer, mcpResourceUrl, SCOPE } from "@/lib/oauth/config";

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      // Must equal the MCP URL exactly as entered in Claude, path included.
      resource: mcpResourceUrl(),
      // First entry wins in Claude's resolution; we only have one.
      authorization_servers: [issuer()],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
