// Validation for the authorize step, shared by the consent page (GET render)
// and the decision handler (POST) — the POST re-validates EVERYTHING because
// hidden form fields are untrusted client input, exactly like query params.
//
// The one rule that matters most (RFC 6749 §4.1.2.1, and every OAuth
// post-mortem ever): if the client or redirect_uri doesn't validate, render an
// error — NEVER redirect. Redirecting to an unvalidated URI is an open
// redirect; worse, it can carry a code. Only a validated redirect_uri may
// receive error callbacks.
import { getClient, redirectUriMatches, type OAuthClientRecord } from "./clients";
import { SCOPE } from "./config";

export interface RawAuthorizeParams {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
}

export type AuthorizeValidation =
  // Render an error page; no redirect may happen.
  | { kind: "reject"; reason: string }
  // The redirect target is trusted; send an OAuth error callback.
  | { kind: "redirect_error"; redirectUri: string; error: string; state: string | null }
  // Good to show consent / issue a code.
  | {
      kind: "ok";
      client: OAuthClientRecord;
      redirectUri: string;
      state: string | null;
      codeChallenge: string;
      scope: string;
    };

// base64url(sha256) is always 43 chars; accept a small range defensively.
const CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43,128}$/;

export async function validateAuthorizeRequest(params: RawAuthorizeParams): Promise<AuthorizeValidation> {
  const { client_id, redirect_uri } = params;
  if (!client_id || !redirect_uri) {
    return { kind: "reject", reason: "Missing client_id or redirect_uri." };
  }
  const client = await getClient(client_id);
  if (!client) {
    return { kind: "reject", reason: "Unknown client. Reconnect from Claude to re-register." };
  }
  if (!client.redirectUris.some((registered) => redirectUriMatches(registered, redirect_uri))) {
    return { kind: "reject", reason: "redirect_uri does not match this client's registration." };
  }

  // From here the redirect target is trusted — errors go back as callbacks.
  const state = params.state ?? null;
  if (params.response_type !== "code") {
    return { kind: "redirect_error", redirectUri: redirect_uri, error: "unsupported_response_type", state };
  }
  if (
    !params.code_challenge ||
    !CHALLENGE_PATTERN.test(params.code_challenge) ||
    params.code_challenge_method !== "S256"
  ) {
    // PKCE S256 is mandatory here (MCP authorization spec) — no challenge, no code.
    return { kind: "redirect_error", redirectUri: redirect_uri, error: "invalid_request", state };
  }
  // Only our one scope exists; an empty/absent scope defaults to it.
  const requested = (params.scope ?? "").split(/\s+/).filter(Boolean);
  if (requested.some((s) => s !== SCOPE)) {
    return { kind: "redirect_error", redirectUri: redirect_uri, error: "invalid_scope", state };
  }

  return {
    kind: "ok",
    client,
    redirectUri: redirect_uri,
    state,
    codeChallenge: params.code_challenge,
    scope: SCOPE,
  };
}

/** Build an OAuth callback URL (code or error) on a VALIDATED redirect URI. */
export function callbackUrl(
  redirectUri: string,
  params: Record<string, string | null>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}
