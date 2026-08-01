// The token endpoint. Public by design (the client is a machine holding a code
// or refresh token — those ARE the credentials), defended by: form-urlencoded
// parsing only (Claude's requirement; also what RFC 6749 §4.1.3 mandates),
// single-use PKCE-bound codes, refresh rotation, RFC 6749 error codes
// (Claude's docs require invalid_grant specifically for dead refresh tokens),
// and an IP rate limit. Must respond well under Claude's 10s deadline — all
// work here is local file I/O.
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/request-ip";
import { consumeCode } from "@/lib/oauth/codes";
import { verifierMatchesChallenge } from "@/lib/oauth/pkce";
import { redirectUriMatches } from "@/lib/oauth/clients";
import { mintTokenPair, rotateRefreshToken } from "@/lib/oauth/tokens";
import { consumeToken } from "@/lib/oauth/ratelimit";

function oauthError(error: string, status = 400): Response {
  // Token error responses must not be cached (RFC 6749 §5.2).
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await consumeToken(clientIp(request)))) {
    return oauthError("too_many_requests", 429);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request", 415);
  }
  const form = new URLSearchParams(await request.text());
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    const clientId = form.get("client_id");
    const redirectUri = form.get("redirect_uri");
    if (!code || !verifier || !clientId || !redirectUri) {
      return oauthError("invalid_request");
    }
    // consumeCode burns the code before validation — a failed exchange can't be
    // retried with corrected parameters (that's the RFC's replay stance).
    const grant = consumeCode(code, new Date());
    if (
      !grant ||
      grant.clientId !== clientId ||
      !redirectUriMatches(grant.redirectUri, redirectUri) ||
      !verifierMatchesChallenge(verifier, grant.codeChallenge)
    ) {
      return oauthError("invalid_grant");
    }
    const pair = await mintTokenPair(grant.clientId, grant.scope, new Date());
    return NextResponse.json(
      {
        access_token: pair.accessToken,
        token_type: "Bearer",
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
        scope: grant.scope,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request");
    const pair = await rotateRefreshToken(refreshToken, new Date());
    // invalid_grant, specifically: Claude's refresh logic keys on this code.
    if (!pair) return oauthError("invalid_grant");
    return NextResponse.json(
      {
        access_token: pair.accessToken,
        token_type: "Bearer",
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return oauthError("unsupported_grant_type");
}
