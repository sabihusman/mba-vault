// URL/identity configuration for the OAuth 2.1 authorization server (SECURITY.md
// §10). Everything absolute derives from PUBLIC_ORIGIN so a future domain move
// (e.g. IP → DuckDNS) is one .env change. The dev/e2e fallback keeps local flows
// working without configuration.
//
// Issuer = <origin>/vault: the AS and the MCP resource live inside the same app.
// Metadata documents are served from /vault/api/oauth/* routes (NOT app-level
// /.well-known/* — Next's router and our basePath make dot-folders fragile);
// that's spec-legal because Claude's primary discovery is the 401
// WWW-Authenticate resource_metadata pointer, which may be "any HTTPS location"
// (Claude connector auth docs), and nginx maps the root RFC-compliant
// /.well-known/* probe paths onto these routes for the fallback.
export function publicOrigin(): string {
  return process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
}

export function issuer(): string {
  return `${publicOrigin()}/vault`;
}

/** The scopes this AS knows — both strictly read-only:
 *  - "search": semantic search over the index (search_vault)
 *  - "read":   list files + read documents from the index (list_files,
 *              get_document) — added with the file-access tools; existing
 *              connections hold only "search" until re-consented. */
export const SCOPE_SEARCH = "search";
export const SCOPE_READ = "read";
export const SCOPES: readonly string[] = [SCOPE_SEARCH, SCOPE_READ];

/** All scopes as the space-delimited OAuth scope string. */
export function allScopes(): string {
  return SCOPES.join(" ");
}

export function mcpResourceUrl(): string {
  return `${issuer()}/api/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${issuer()}/api/oauth/protected-resource-metadata`;
}

export function authorizationEndpoint(): string {
  return `${issuer()}/oauth/authorize`;
}

export function tokenEndpoint(): string {
  return `${issuer()}/api/oauth/token`;
}

export function registrationEndpoint(): string {
  return `${issuer()}/api/oauth/register`;
}

/** The WWW-Authenticate challenge on every MCP 401 — Claude's primary path for
 *  discovering where our protected-resource metadata lives. The scope param
 *  controls which scopes Claude requests (Claude connector auth docs). */
export function bearerChallenge(): string {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl()}", scope="${allScopes()}"`;
}
