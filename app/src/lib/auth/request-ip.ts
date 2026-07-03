// Determine the client's IP for rate limiting. The app never faces the internet
// directly — nginx on the box terminates TLS and proxies to us — so the socket
// address is always nginx (127.0.0.1). We rely on the forwarding headers nginx
// sets:
//
//   proxy_set_header X-Real-IP       $remote_addr;              (the true client)
//   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//
// SECURITY: these headers are only trustworthy because nginx OVERWRITES X-Real-IP
// with the real socket peer on every request. A client-sent X-Real-IP cannot get
// through — nginx replaces it. If nginx is ever misconfigured to not set X-Real-IP,
// we fall back to the LEFTMOST X-Forwarded-For entry, then to "unknown". Falling
// back to "unknown" is safe-by-default: every attacker then shares one rate-limit
// bucket (stricter), rather than each spoofing a fresh key (bypass).

/** Best-effort real client IP from the proxy headers, or "unknown". */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // X-Forwarded-For is "client, proxy1, proxy2 …" — the client is leftmost.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
