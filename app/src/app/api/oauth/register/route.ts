// RFC 7591 dynamic client registration. Public by design (Claude registers
// before any user is authenticated), defended by: JSON-only parsing, the hard
// redirect-URI allowlist (clients.ts — the real security boundary: a client
// can only ever be sent back to a documented Claude callback), a stored-client
// cap with eviction, and its own IP rate limit. Content-Type per RFC 7591 §3.1
// is application/json — deliberately different from the form-urlencoded token
// endpoint.
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/request-ip";
import { registerClient } from "@/lib/oauth/clients";
import { consumeRegister } from "@/lib/oauth/ratelimit";

export async function POST(request: Request): Promise<Response> {
  if (!(await consumeRegister(clientIp(request)))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const { redirect_uris, client_name } = body as { redirect_uris?: unknown; client_name?: unknown };
  const result = await registerClient({ redirect_uris, client_name }, new Date());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // RFC 7591 §3.2.1 response. No client_secret: this AS only issues public
  // clients (token_endpoint_auth_method "none" + PKCE).
  return NextResponse.json(
    {
      client_id: result.client.clientId,
      client_name: result.client.clientName,
      redirect_uris: result.client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(new Date(result.client.createdAt).getTime() / 1000),
    },
    { status: 201 },
  );
}
