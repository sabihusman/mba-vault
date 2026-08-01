// RFC 7009 token revocation (Phase 4, F1). Public by design like the token
// endpoint — the presented token IS the credential — with the same IP rate
// limit. Always 200 on well-formed requests, even for unknown/expired/garbage
// tokens: per the RFC, revocation is idempotent and MUST NOT let a caller
// probe whether a token existed.
//
// Whether claude.ai actually calls this on disconnect is UNVERIFIED — we
// advertise it (revocation_endpoint) and will watch nginx logs on the next
// disconnect. Either way it gives the owner a manual kill:
//   curl -sk -X POST https://<ip>/vault/api/oauth/revoke \
//     -H "Content-Type: application/x-www-form-urlencoded" -d "token=mcp_rt_..."
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/request-ip";
import { revokeToken } from "@/lib/oauth/tokens";
import { consumeToken } from "@/lib/oauth/ratelimit";

export async function POST(request: Request): Promise<Response> {
  if (!(await consumeToken(clientIp(request)))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 415 });
  }
  const form = new URLSearchParams(await request.text());
  const token = form.get("token");
  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  await revokeToken(token);
  // Empty 200 per RFC 7009 §2.2 — same response whether anything was revoked.
  return new NextResponse(null, { status: 200 });
}
