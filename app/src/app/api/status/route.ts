// GET /vault/api/status — the detailed health aggregate for the header pill's
// drill-down panel. Auth-gated by the proxy (unlike the public /api/health
// liveness probe), so component details — disk, cert expiry, index age — aren't
// exposed to unauthenticated scanners. Never cached at the HTTP layer; the network
// probes inside buildReport are cached in-process for a poll cycle.
import { buildReport } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await buildReport();
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
