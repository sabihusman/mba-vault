// Validation for the login page's ?next= return path (added for the OAuth
// consent flow: proxy redirects /oauth/authorize → /login?next=<authorize URL>
// so consent resumes after sign-in). Open-redirect hardening: only app-internal
// page paths survive; anything else falls back to the app root.
// - must start with "/" (basePath-relative)
// - "//evil.com" is a protocol-relative external URL → rejected
// - "\" tricks (browsers normalize to //) → rejected
// - /api/* is machine surface, never a sensible post-login destination
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.includes("\\")) return "/";
  if (next.startsWith("/api/") || next === "/api") return "/";
  return next;
}
