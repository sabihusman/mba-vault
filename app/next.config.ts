import type { NextConfig } from "next";
import path from "node:path";

// Baseline security headers applied to every response. We deliberately keep this
// minimal for now; a full Content-Security-Policy lands in the LLM-hardening phase
// (CSP needs care so it doesn't break Next's inline runtime).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Pin the build root to the monorepo root (one level up from /app) so Next never
  // mis-infers it from stray lockfiles elsewhere on disk.
  turbopack: {
    root: path.join(import.meta.dirname, ".."),
  },
  // Produce a self-contained server build for the Docker image (we run our own
  // Node server on Hetzner — no Vercel).
  output: "standalone",
  // MBA-Vault is served under /vault on the box (nginx path-routes: the study guide
  // owns /, this app owns /vault). basePath prefixes routes and /_next assets.
  basePath: "/vault",
  // Don't advertise the framework/version to clients.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // The service worker must never be cached, or users get stuck on an old one.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
