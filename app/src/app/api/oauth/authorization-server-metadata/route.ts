// RFC 8414 authorization server metadata. Public by design. nginx maps the
// compliant root path (/.well-known/oauth-authorization-server/vault, the
// RFC 8414 path-insertion form for issuer <origin>/vault) onto this route;
// Claude's exact probe form is unverified until the first live connect, so
// watch nginx logs and add aliases if it probes differently.
import { NextResponse } from "next/server";
import {
  authorizationEndpoint,
  issuer,
  registrationEndpoint,
  tokenEndpoint,
  SCOPES,
} from "@/lib/oauth/config";

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      issuer: issuer(),
      authorization_endpoint: authorizationEndpoint(),
      token_endpoint: tokenEndpoint(),
      registration_endpoint: registrationEndpoint(),
      // RFC 7009. Whether claude.ai calls it on disconnect is UNVERIFIED
      // (observable: nginx logs on the next disconnect); the owner's manual
      // revoke curl works regardless (SECURITY.md §10).
      revocation_endpoint: `${issuer()}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // Claude registers as a public client (no secret) via DCR.
      token_endpoint_auth_methods_supported: ["none"],
      // Mandatory advertisement per the MCP authorization spec.
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...SCOPES],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
