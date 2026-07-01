// Lightweight liveness probe. Served at /vault/api/health (basePath). Used by the
// docker-compose healthcheck and the deploy smoke test. Never cached.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "mba-vault" });
}
