// The consent decision (SECURITY.md §10). Deliberately NOT in the proxy's
// public allowlist: only a browser holding a valid session cookie reaches this
// handler, which is exactly the "consent = existing login + TOTP" property.
// CSRF is covered by the same cookie being SameSite=Lax — a cross-site form
// POST arrives without it and the proxy 401s before this code runs.
//
// Every field is re-validated from scratch: the consent page's hidden inputs
// travel through the browser and are as untrusted as any query string.
import { NextResponse } from "next/server";
import { validateAuthorizeRequest, callbackUrl } from "@/lib/oauth/authorize-request";
import { issueCode } from "@/lib/oauth/codes";

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 415 });
  }
  const form = new URLSearchParams(await request.text());

  const validation = await validateAuthorizeRequest({
    client_id: form.get("client_id") ?? undefined,
    redirect_uri: form.get("redirect_uri") ?? undefined,
    response_type: form.get("response_type") ?? undefined,
    state: form.get("state") ?? undefined,
    code_challenge: form.get("code_challenge") ?? undefined,
    code_challenge_method: form.get("code_challenge_method") ?? undefined,
    scope: form.get("scope") ?? undefined,
  });

  if (validation.kind === "reject") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (validation.kind === "redirect_error") {
    return NextResponse.redirect(
      callbackUrl(validation.redirectUri, { error: validation.error, state: validation.state }),
      303,
    );
  }

  if (form.get("action") !== "approve") {
    return NextResponse.redirect(
      callbackUrl(validation.redirectUri, { error: "access_denied", state: validation.state }),
      303,
    );
  }

  const code = issueCode(
    {
      clientId: validation.client.clientId,
      redirectUri: validation.redirectUri,
      codeChallenge: validation.codeChallenge,
      scope: validation.scope,
    },
    new Date(),
  );
  return NextResponse.redirect(
    callbackUrl(validation.redirectUri, { code, state: validation.state }),
    303,
  );
}
